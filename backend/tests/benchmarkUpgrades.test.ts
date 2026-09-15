// Tests for the benchmark-driven upgrades (FR-B7..FR-B20): driver ownership enforcement,
// privileged SSE ticket scoping, re-delivery attempt reset, operational metadata, outcome-time
// history filtering, deactivated-token revocation, and outcome validation.

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type Database from "better-sqlite3";
import { createTestDb } from "./testDb.js";
import { createAppContext, type AppContext } from "../src/appContext.js";
import { createAuthRoutes } from "../src/routes/authRoutes.js";
import { createDeliveryRoutes } from "../src/routes/deliveryRoutes.js";
import { createMasterDataRoutes } from "../src/routes/masterDataRoutes.js";
import { createEventsRoutes } from "../src/routes/eventsRoutes.js";
import { ConflictError, ValidationError } from "../src/utils/errors.js";
import { eventBus } from "../src/events/eventBus.js";

function buildApp(ctx: AppContext) {
  const app = express();
  app.use(express.json());
  app.use("/api", createAuthRoutes(ctx));
  app.use("/api", createDeliveryRoutes(ctx));
  app.use("/api", createMasterDataRoutes(ctx));
  app.use("/api", createEventsRoutes(ctx));
  return app;
}

describe("Benchmark upgrades", () => {
  let db: Database.Database;
  let ctx: AppContext;
  let app: express.Express;
  let campId: number;
  let driverAId: number;
  let driverBId: number;

  beforeEach(async () => {
    db = createTestDb();
    ctx = createAppContext(db);
    app = buildApp(ctx);

    const passwordHash = await ctx.auth.hashPassword("pass");
    driverAId = ctx.masterData.createDriver({
      employeeId: "EMP-A",
      name: "Driver Alpha",
      passwordHash,
      assignedArea: "Area A",
      contact: "010-0000-0001",
    }).id;
    driverBId = ctx.masterData.createDriver({
      employeeId: "EMP-B",
      name: "Driver Bravo",
      passwordHash,
      assignedArea: "Area B",
      contact: "010-0000-0002",
    }).id;
    ctx.auth.createAdminUser("morgan", await ctx.auth.hashPassword("admin-pass"));
    campId = ctx.masterData.createCamp({ name: "Camp A", assignedArea: "Area A" }).id;
  });

  async function tokenFor(employeeId: string) {
    const res = await request(app).post("/api/auth/driver/login").send({ employeeId, password: "pass" });
    return res.body.token as string;
  }

  async function adminToken() {
    const res = await request(app).post("/api/auth/admin/login").send({ username: "morgan", password: "admin-pass" });
    return res.body.token as string;
  }

  function createOutForDelivery(driverId: number) {
    const delivery = ctx.delivery.createDelivery({ productName: "Widget", address: "1 Main St, Seoul", campId });
    ctx.delivery.assignDriver(delivery.id, driverId, "admin:1");
    ctx.delivery.updateStatus(delivery.id, "pickup", "system");
    ctx.delivery.updateStatus(delivery.id, "line_haul_loaded", "system");
    ctx.delivery.updateStatus(delivery.id, "arrived_at_camp", "system");
    return ctx.delivery.updateStatus(delivery.id, "out_for_delivery", "system");
  }

  describe("FR-B7 driver ownership enforcement", () => {
    it("denies advancing another driver's delivery", async () => {
      const delivery = createOutForDelivery(driverAId);
      const tokenB = await tokenFor("EMP-B");

      const res = await request(app)
        .patch(`/api/driver/deliveries/${delivery.id}/status`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ status: "delivered" });

      expect(res.status).toBe(404);
      expect(ctx.delivery.getDeliveryById(delivery.id)!.status).toBe("out_for_delivery");
    });

    it("denies completing another driver's delivery", async () => {
      const delivery = createOutForDelivery(driverAId);
      const tokenB = await tokenFor("EMP-B");

      const res = await request(app)
        .post(`/api/driver/deliveries/${delivery.id}/complete`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/p.jpg" });

      expect(res.status).toBe(404);
      expect(ctx.delivery.getDeliveryById(delivery.id)!.status).toBe("out_for_delivery");
    });

    it("denies failing another driver's delivery", async () => {
      const delivery = createOutForDelivery(driverAId);
      const tokenB = await tokenFor("EMP-B");

      const res = await request(app)
        .post(`/api/driver/deliveries/${delivery.id}/fail`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ reason: "recipient_absent" });

      expect(res.status).toBe(404);
      expect(ctx.delivery.getDeliveryById(delivery.id)!.isRedeliveryTarget).toBe(false);
    });

    it("denies reading another driver's delivery via the shared detail route", async () => {
      const delivery = createOutForDelivery(driverAId);
      const tokenB = await tokenFor("EMP-B");

      const res = await request(app)
        .get(`/api/deliveries/${delivery.id}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });

    it("still allows the owning driver to act", async () => {
      const delivery = createOutForDelivery(driverAId);
      const tokenA = await tokenFor("EMP-A");

      const res = await request(app)
        .post(`/api/driver/deliveries/${delivery.id}/complete`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/p.jpg" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("delivered");
    });
  });

  describe("FR-B17 privileged realtime authorization", () => {
    it("rejects the admin-wide channel without a ticket", async () => {
      const res = await request(app).get("/api/events?channel=all");
      expect(res.status).toBe(401);
    });

    it("rejects selecting an arbitrary driver channel without a ticket", async () => {
      const res = await request(app).get(`/api/events?channel=driver&driverId=${driverAId}`);
      expect(res.status).toBe(401);
    });

    it("rejects an invalid or reused ticket", async () => {
      const tokenA = await tokenFor("EMP-A");
      const ticketRes = await request(app).post("/api/events/ticket").set("Authorization", `Bearer ${tokenA}`);
      expect(ticketRes.status).toBe(201);

      // Consuming programmatically proves single use; a second consume must fail.
      expect(ctx.sseTickets.consume(ticketRes.body.ticket)).not.toBeNull();
      expect(ctx.sseTickets.consume(ticketRes.body.ticket)).toBeNull();
      expect(ctx.sseTickets.consume("not-a-real-ticket")).toBeNull();
    });

    it("binds a driver ticket to the authenticated driver, not a requested id", async () => {
      const tokenB = await tokenFor("EMP-B");
      const ticketRes = await request(app)
        .post("/api/events/ticket")
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ driverId: driverAId });

      const channel = ctx.sseTickets.consume(ticketRes.body.ticket);
      expect(channel).toEqual({ type: "driver", driverId: driverBId });
    });

    it("mints an admin-wide channel for admin tokens", async () => {
      const token = await adminToken();
      const ticketRes = await request(app).post("/api/events/ticket").set("Authorization", `Bearer ${token}`);
      expect(ctx.sseTickets.consume(ticketRes.body.ticket)).toEqual({ type: "all" });
    });

    it("rejects a tracking channel for an unknown tracking number", async () => {
      const res = await request(app).get("/api/events?channel=tracking&trackingNumber=DT-NOPE1234");
      expect(res.status).toBe(404);
    });
  });

  describe("FR-B10 deactivated driver revocation", () => {
    it("rejects a still-valid token after the driver is deactivated", async () => {
      const tokenA = await tokenFor("EMP-A");
      const before = await request(app).get("/api/driver/deliveries").set("Authorization", `Bearer ${tokenA}`);
      expect(before.status).toBe(200);

      ctx.masterData.deactivateDriver(driverAId);

      const after = await request(app).get("/api/driver/deliveries").set("Authorization", `Bearer ${tokenA}`);
      expect(after.status).toBe(401);
    });
  });

  describe("FR-B19 re-delivery attempt reset", () => {
    it("creates a fresh attempt timestamp, ETA, and cleared failure fields", () => {
      const delivery = createOutForDelivery(driverAId);
      const failed = ctx.delivery.reportFailure(delivery.id, "recipient_absent", "No answer", "driver:1");
      expect(failed.status).toBe("failed");
      expect(failed.failureReason).toBe("recipient_absent");

      const previousAttemptAt = delivery.outForDeliveryAt!;
      const reassigned = ctx.delivery.assignDriver(delivery.id, driverBId, "admin:1");

      expect(reassigned.status).toBe("out_for_delivery");
      expect(reassigned.isRedeliveryTarget).toBe(false);
      expect(reassigned.driverId).toBe(driverBId);
      expect(reassigned.failureReason).toBeNull();
      expect(reassigned.failureMemo).toBeNull();
      expect(new Date(reassigned.outForDeliveryAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(previousAttemptAt).getTime()
      );
      // A fresh ETA must be in the future so the recipient countdown is meaningful again.
      expect(new Date(reassigned.eta!).getTime()).toBeGreaterThan(Date.now());
    });

    it("republishes a statusChanged event so live tracking restarts", () => {
      const delivery = createOutForDelivery(driverAId);
      ctx.delivery.reportFailure(delivery.id, "bad_address", undefined, "driver:1");

      const events: any[] = [];
      const listener = (event: any) => events.push(event);
      eventBus.on("statusChanged", listener);
      ctx.delivery.assignDriver(delivery.id, driverBId, "admin:1");
      eventBus.off("statusChanged", listener);

      expect(events.some((e) => e.payload?.status === "out_for_delivery")).toBe(true);
    });
  });

  describe("FR-B12/FR-B15 operational metadata and history semantics", () => {
    it("reports last status change time", () => {
      const delivery = createOutForDelivery(driverAId);
      const meta = ctx.delivery.getOperationalMeta(delivery.id);
      expect(meta.lastStatusChangeAt).not.toBeNull();
      expect(meta.isDelayed).toBe(false);
    });

    it("flags a delivery as delayed once its ETA has passed", () => {
      const delivery = createOutForDelivery(driverAId);
      db.prepare(`UPDATE deliveries SET eta = ? WHERE id = ?`).run(
        new Date(Date.now() - 60_000).toISOString(),
        delivery.id
      );
      expect(ctx.delivery.getOperationalMeta(delivery.id).isDelayed).toBe(true);
    });

    it("reports outcome time for delivered and failed deliveries", () => {
      const delivered = createOutForDelivery(driverAId);
      ctx.delivery.completeDelivery(
        delivered.id,
        { receiptMethod: "in_person", proofOfDeliveryPhotoUrl: "https://example.com/p.jpg" },
        "driver:1"
      );
      expect(ctx.delivery.getOperationalMeta(delivered.id).outcomeAt).not.toBeNull();

      const failed = createOutForDelivery(driverBId);
      ctx.delivery.reportFailure(failed.id, "other", undefined, "driver:2");
      expect(ctx.delivery.getOperationalMeta(failed.id).outcomeAt).not.toBeNull();
    });

    it("history filter returns only terminal deliveries", async () => {
      createOutForDelivery(driverAId); // still in progress
      const delivered = createOutForDelivery(driverBId);
      ctx.delivery.completeDelivery(
        delivered.id,
        { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/p.jpg" },
        "driver:2"
      );

      const token = await adminToken();
      const res = await request(app)
        .get("/api/admin/deliveries?history=true")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe("delivered");
      expect(res.body[0].outcomeAt).not.toBeNull();
      expect(res.body[0].lastStatusChangeAt).not.toBeNull();
    });

    it("includes deliveries completed today when filtering by today's date", async () => {
      const delivered = createOutForDelivery(driverAId);
      ctx.delivery.completeDelivery(
        delivered.id,
        { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/p.jpg" },
        "driver:1"
      );
      const today = new Date().toISOString().slice(0, 10);

      const token = await adminToken();
      const res = await request(app)
        .get(`/api/admin/deliveries?history=true&dateFrom=${today}&dateTo=${today}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.body.map((d: any) => d.id)).toContain(delivered.id);
    });
  });

  describe("FR-B9 driver route order and note visibility", () => {
    it("returns stable 1-based delivery order and the request note", async () => {
      const first = ctx.delivery.createDelivery({
        productName: "First",
        address: "1 St",
        campId,
        requestNote: "Leave with security desk",
      });
      const second = ctx.delivery.createDelivery({ productName: "Second", address: "2 St", campId });
      ctx.delivery.assignDriver(first.id, driverAId, "admin:1");
      ctx.delivery.assignDriver(second.id, driverAId, "admin:1");

      const token = await tokenFor("EMP-A");
      const res = await request(app).get("/api/driver/deliveries").set("Authorization", `Bearer ${token}`);

      expect(res.body.map((d: any) => d.deliveryOrder)).toEqual([1, 2]);
      expect(res.body[0].requestNote).toBe("Leave with security desk");
    });
  });

  describe("FR-B11 outcome validation", () => {
    it("rejects an unknown receipt method", () => {
      const delivery = createOutForDelivery(driverAId);
      expect(() =>
        ctx.delivery.completeDelivery(
          delivery.id,
          { receiptMethod: "teleport" as any, proofOfDeliveryPhotoUrl: "https://example.com/p.jpg" },
          "driver:1"
        )
      ).toThrow(ValidationError);
    });

    it("rejects a non-HTTP proof URL", () => {
      const delivery = createOutForDelivery(driverAId);
      expect(() =>
        ctx.delivery.completeDelivery(
          delivery.id,
          { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "javascript:alert(1)" },
          "driver:1"
        )
      ).toThrow(ValidationError);
    });

    it("rejects an unknown failure reason", () => {
      const delivery = createOutForDelivery(driverAId);
      expect(() => ctx.delivery.reportFailure(delivery.id, "bored" as any, undefined, "driver:1")).toThrow(
        ValidationError
      );
    });

    it("rejects an over-long request note", () => {
      const delivery = ctx.delivery.createDelivery({ productName: "Widget", address: "1 St", campId });
      expect(() => ctx.delivery.updateRequestNote(delivery.trackingNumber, "x".repeat(501))).toThrow(ValidationError);
    });
  });

  describe("FR-B14 master data integrity", () => {
    it("refuses to delete a camp that deliveries still reference", () => {
      ctx.delivery.createDelivery({ productName: "Widget", address: "1 St", campId });
      expect(() => ctx.masterData.deleteCamp(campId)).toThrow(ConflictError);
    });

    it("rejects renaming a camp onto another camp's name", () => {
      const other = ctx.masterData.createCamp({ name: "Camp B", assignedArea: "Area B" });
      expect(() => ctx.masterData.updateCamp(other.id, { name: "camp a" })).toThrow(ConflictError);
    });

    it("rejects blanking required driver fields", () => {
      expect(() => ctx.masterData.updateDriver(driverAId, { name: "   " })).toThrow(ValidationError);
    });

    it("allows a valid driver edit", () => {
      const updated = ctx.masterData.updateDriver(driverAId, { assignedArea: "Area Z" });
      expect(updated.assignedArea).toBe("Area Z");
    });
  });
});
