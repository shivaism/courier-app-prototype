import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type Database from "better-sqlite3";
import { createTestDb } from "./testDb.js";
import { createAppContext, type AppContext } from "../src/appContext.js";
import { createAuthRoutes } from "../src/routes/authRoutes.js";
import { createDeliveryRoutes } from "../src/routes/deliveryRoutes.js";
import { createMasterDataRoutes } from "../src/routes/masterDataRoutes.js";

function buildApp(ctx: AppContext) {
  const app = express();
  app.use(express.json());
  app.use("/api", createAuthRoutes(ctx));
  app.use("/api", createDeliveryRoutes(ctx));
  app.use("/api", createMasterDataRoutes(ctx));
  return app;
}

describe("Delivery API routes (integration)", () => {
  let db: Database.Database;
  let ctx: AppContext;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    ctx = createAppContext(db);
    app = buildApp(ctx);

    const passwordHash = await ctx.auth.hashPassword("driver-pass");
    ctx.masterData.createDriver({
      employeeId: "EMP001",
      name: "Kim Minjun",
      passwordHash,
      assignedArea: "Area A",
      contact: "010-0000-0000",
    });
    const adminPasswordHash = await ctx.auth.hashPassword("admin-pass");
    ctx.auth.createAdminUser("morgan", adminPasswordHash);
  });

  async function driverToken(): Promise<string> {
    const res = await request(app).post("/api/auth/driver/login").send({ employeeId: "EMP001", password: "driver-pass" });
    return res.body.token;
  }

  async function adminToken(): Promise<string> {
    const res = await request(app).post("/api/auth/admin/login").send({ username: "morgan", password: "admin-pass" });
    return res.body.token;
  }

  it("CUST-1: returns 404 for an unknown tracking number", async () => {
    const res = await request(app).get("/api/deliveries/lookup/DT-UNKNOWN1");
    expect(res.status).toBe(404);
  });

  it("CUST-1: returns a masked view for a valid tracking number", async () => {
    const camp = ctx.masterData.createCamp({ name: "Camp A", assignedArea: "Area A" });
    const created = ctx.delivery.createDelivery({ productName: "Widget", address: "123 Main St, Seoul", campId: camp.id });

    const res = await request(app).get(`/api/deliveries/lookup/${created.trackingNumber}`);
    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe(created.trackingNumber);
    expect(res.body.address).not.toBe("123 Main St, Seoul"); // masked
  });

  it("DRV-1: driver login succeeds and returns a token", async () => {
    const res = await request(app).post("/api/auth/driver/login").send({ employeeId: "EMP001", password: "driver-pass" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("DRV-1: driver login fails with wrong password", async () => {
    const res = await request(app).post("/api/auth/driver/login").send({ employeeId: "EMP001", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("DRV-2: rejects unauthenticated access to driver delivery list", async () => {
    const res = await request(app).get("/api/driver/deliveries");
    expect(res.status).toBe(401);
  });

  it("DRV-2/DRV-3: driver can list and advance their own delivery status", async () => {
    const camp = ctx.masterData.createCamp({ name: "Camp A", assignedArea: "Area A" });
    const driver = ctx.masterData.getDriverByEmployeeId("EMP001")!;
    const created = ctx.delivery.createDelivery({ productName: "Widget", address: "123 Main St", campId: camp.id });
    ctx.delivery.assignDriver(created.id, driver.id, "admin:1");

    const token = await driverToken();

    const listRes = await request(app).get("/api/driver/deliveries").set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const statusRes = await request(app)
      .patch(`/api/driver/deliveries/${created.id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "pickup" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("pickup");
  });

  it("ADM-4: admin can create a driver, but rejects duplicate employeeId", async () => {
    const token = await adminToken();

    const res1 = await request(app)
      .post("/api/admin/drivers")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: "EMP002", name: "New Driver", assignedArea: "Area B", contact: "010-1111-1111", password: "pass" });
    expect(res1.status).toBe(201);
    expect(res1.body.passwordHash).toBeUndefined();

    const res2 = await request(app)
      .post("/api/admin/drivers")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: "emp002", name: "Dup", assignedArea: "Area B", contact: "010-1111-1111", password: "pass" });
    expect(res2.status).toBe(409);
  });

  it("ADM-3: admin can assign a delivery to a driver", async () => {
    const camp = ctx.masterData.createCamp({ name: "Camp A", assignedArea: "Area A" });
    const driver = ctx.masterData.getDriverByEmployeeId("EMP001")!;
    const created = ctx.delivery.createDelivery({ productName: "Widget", address: "123 Main St", campId: camp.id });

    const token = await adminToken();
    const res = await request(app)
      .post(`/api/admin/deliveries/${created.id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ driverId: driver.id });

    expect(res.status).toBe(200);
    expect(res.body.driverId).toBe(driver.id);
  });

  it("CUST-3: rejects note edit once delivery is out_for_delivery", async () => {
    const camp = ctx.masterData.createCamp({ name: "Camp A", assignedArea: "Area A" });
    const created = ctx.delivery.createDelivery({ productName: "Widget", address: "123 Main St", campId: camp.id });
    ctx.delivery.updateStatus(created.id, "pickup", "system");
    ctx.delivery.updateStatus(created.id, "line_haul_loaded", "system");
    ctx.delivery.updateStatus(created.id, "arrived_at_camp", "system");
    ctx.delivery.updateStatus(created.id, "out_for_delivery", "system");

    const res = await request(app)
      .patch(`/api/deliveries/lookup/${created.trackingNumber}/note`)
      .send({ note: "too late" });
    expect(res.status).toBe(400);
  });
});
