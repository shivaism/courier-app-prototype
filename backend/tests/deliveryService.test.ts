import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./testDb.js";
import { MasterDataService } from "../src/services/masterDataService.js";
import { DeliveryService } from "../src/services/deliveryService.js";
import { ValidationError, NotFoundError } from "../src/utils/errors.js";
import { eventBus } from "../src/events/eventBus.js";
import type { Camp, Driver } from "../src/domain/types.js";

describe("DeliveryService", () => {
  let db: Database.Database;
  let masterData: MasterDataService;
  let delivery: DeliveryService;
  let camp: Camp;
  let driver: Driver;

  beforeEach(() => {
    db = createTestDb();
    masterData = new MasterDataService(db);
    delivery = new DeliveryService(db, masterData);
    camp = masterData.createCamp({ name: "Camp A", assignedArea: "Area A" });
    driver = masterData.createDriver({
      employeeId: "EMP001",
      name: "Kim Minjun",
      passwordHash: "hashed",
      assignedArea: "Area A",
      contact: "010-0000-0000",
    });
  });

  describe("createDelivery (BR-8)", () => {
    it("creates a delivery with status intake and a generated tracking number", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      expect(d.status).toBe("intake");
      expect(d.trackingNumber).toMatch(/^DT-[A-Z0-9]{8}$/);
      expect(d.intakeAt).not.toBeNull();
    });

    it("rejects missing required fields", () => {
      expect(() => delivery.createDelivery({ productName: "", address: "1 Main St", campId: camp.id })).toThrow(
        ValidationError
      );
    });

    it("rejects a non-existent camp", () => {
      expect(() =>
        delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: 9999 })
      ).toThrow(ValidationError);
    });
  });

  describe("updateStatus (BR-1)", () => {
    it("allows advancing one step at a time in order", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      const updated = delivery.updateStatus(d.id, "pickup", "system");
      expect(updated.status).toBe("pickup");
      expect(updated.pickupAt).not.toBeNull();
    });

    it("rejects skipping a stage", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      expect(() => delivery.updateStatus(d.id, "arrived_at_camp", "system")).toThrow(ValidationError);
    });

    it("rejects moving backward", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      delivery.updateStatus(d.id, "pickup", "system");
      expect(() => delivery.updateStatus(d.id, "intake", "system")).toThrow(ValidationError);
    });

    it("rejects transitioning directly to failed via updateStatus", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      expect(() => delivery.updateStatus(d.id, "failed", "system")).toThrow(ValidationError);
    });

    it("computes ETA when reaching out_for_delivery (BR-6)", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      delivery.updateStatus(d.id, "pickup", "system");
      delivery.updateStatus(d.id, "line_haul_loaded", "system");
      delivery.updateStatus(d.id, "arrived_at_camp", "system");
      const updated = delivery.updateStatus(d.id, "out_for_delivery", "system");
      expect(updated.eta).not.toBeNull();
    });

    it("writes a status history entry for every transition", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      delivery.updateStatus(d.id, "pickup", "system");
      const history = delivery.getStatusHistory(d.id);
      expect(history.map((h) => h.status)).toEqual(["intake", "pickup"]);
    });

    it("emits a statusChanged domain event", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      const events: unknown[] = [];
      const listener = (e: unknown) => events.push(e);
      eventBus.on("statusChanged", listener);
      delivery.updateStatus(d.id, "pickup", "system");
      eventBus.off("statusChanged", listener);
      expect(events).toHaveLength(1);
    });
  });

  describe("completeDelivery (BR-2)", () => {
    function advanceToOutForDelivery(id: number) {
      delivery.updateStatus(id, "pickup", "system");
      delivery.updateStatus(id, "line_haul_loaded", "system");
      delivery.updateStatus(id, "arrived_at_camp", "system");
      delivery.updateStatus(id, "out_for_delivery", "system");
    }

    it("completes a delivery with receipt method and photo url", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      advanceToOutForDelivery(d.id);
      const completed = delivery.completeDelivery(
        d.id,
        { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/photo.jpg" },
        "driver:1"
      );
      expect(completed.status).toBe("delivered");
      expect(completed.deliveredAt).not.toBeNull();
    });

    it("rejects completion from a status other than out_for_delivery", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      expect(() =>
        delivery.completeDelivery(
          d.id,
          { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/photo.jpg" },
          "driver:1"
        )
      ).toThrow(ValidationError);
    });

    it("rejects missing receiptMethod or photo url", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      advanceToOutForDelivery(d.id);
      expect(() =>
        delivery.completeDelivery(d.id, { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "" }, "driver:1")
      ).toThrow(ValidationError);
    });
  });

  describe("reportFailure and re-delivery (BR-4)", () => {
    function advanceToOutForDelivery(id: number) {
      delivery.updateStatus(id, "pickup", "system");
      delivery.updateStatus(id, "line_haul_loaded", "system");
      delivery.updateStatus(id, "arrived_at_camp", "system");
      delivery.updateStatus(id, "out_for_delivery", "system");
    }

    it("marks a delivery as failed and a re-delivery target", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      advanceToOutForDelivery(d.id);
      const failed = delivery.reportFailure(d.id, "recipient_absent", "No answer", "driver:1");
      expect(failed.status).toBe("failed");
      expect(failed.isRedeliveryTarget).toBe(true);
    });

    it("rejects reporting failure from a non out_for_delivery status", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      expect(() => delivery.reportFailure(d.id, "recipient_absent", undefined, "driver:1")).toThrow(ValidationError);
    });

    it("resets status to out_for_delivery and clears the flag on reassignment", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      advanceToOutForDelivery(d.id);
      delivery.reportFailure(d.id, "bad_address", undefined, "driver:1");
      const reassigned = delivery.assignDriver(d.id, driver.id, "admin:1");
      expect(reassigned.status).toBe("out_for_delivery");
      expect(reassigned.isRedeliveryTarget).toBe(false);
    });
  });

  describe("updateRequestNote (BR-3)", () => {
    it("allows editing before out_for_delivery", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      const updated = delivery.updateRequestNote(d.trackingNumber, "Leave at door");
      expect(updated.requestNote).toBe("Leave at door");
    });

    it("rejects editing once out_for_delivery", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      delivery.updateStatus(d.id, "pickup", "system");
      delivery.updateStatus(d.id, "line_haul_loaded", "system");
      delivery.updateStatus(d.id, "arrived_at_camp", "system");
      delivery.updateStatus(d.id, "out_for_delivery", "system");
      expect(() => delivery.updateRequestNote(d.trackingNumber, "Too late")).toThrow(ValidationError);
    });

    it("throws NotFoundError for unknown tracking number", () => {
      expect(() => delivery.updateRequestNote("DT-UNKNOWN1", "note")).toThrow(NotFoundError);
    });
  });

  describe("assignDriver (BR-5)", () => {
    it("assigns without changing status for a non-failed delivery", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      const assigned = delivery.assignDriver(d.id, driver.id, "admin:1");
      expect(assigned.driverId).toBe(driver.id);
      expect(assigned.status).toBe("intake");
    });

    it("rejects assigning to an inactive driver", () => {
      const d = delivery.createDelivery({ productName: "Widget", address: "1 Main St", campId: camp.id });
      masterData.deactivateDriver(driver.id);
      expect(() => delivery.assignDriver(d.id, driver.id, "admin:1")).toThrow(ValidationError);
    });
  });

  describe("listUnassignedDeliveries", () => {
    it("includes deliveries with no driver and failed deliveries", () => {
      const d1 = delivery.createDelivery({ productName: "A", address: "addr", campId: camp.id });
      const d2 = delivery.createDelivery({ productName: "B", address: "addr", campId: camp.id });
      delivery.assignDriver(d2.id, driver.id, "admin:1");
      delivery.updateStatus(d2.id, "pickup", "system");
      delivery.updateStatus(d2.id, "line_haul_loaded", "system");
      delivery.updateStatus(d2.id, "arrived_at_camp", "system");
      delivery.updateStatus(d2.id, "out_for_delivery", "system");
      delivery.reportFailure(d2.id, "other", undefined, "driver:1");

      const unassigned = delivery.listUnassignedDeliveries();
      const trackingNumbers = unassigned.map((d) => d.trackingNumber);
      expect(trackingNumbers).toContain(d1.trackingNumber);
      expect(trackingNumbers).toContain(d2.trackingNumber);
    });
  });
});
