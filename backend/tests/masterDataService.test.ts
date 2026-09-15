import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./testDb.js";
import { MasterDataService } from "../src/services/masterDataService.js";
import { ConflictError, ValidationError, NotFoundError } from "../src/utils/errors.js";

describe("MasterDataService", () => {
  let db: Database.Database;
  let service: MasterDataService;

  beforeEach(() => {
    db = createTestDb();
    service = new MasterDataService(db);
  });

  describe("createDriver (BR-7)", () => {
    it("creates a driver with valid input", () => {
      const driver = service.createDriver({
        employeeId: "EMP001",
        name: "Test Driver",
        passwordHash: "hashed",
        assignedArea: "Area A",
        contact: "010-0000-0000",
      });
      expect(driver.employeeId).toBe("EMP001");
      expect(driver.active).toBe(true);
    });

    it("rejects missing required fields", () => {
      expect(() =>
        service.createDriver({
          employeeId: "",
          name: "Test",
          passwordHash: "hashed",
          assignedArea: "Area A",
          contact: "010-0000-0000",
        })
      ).toThrow(ValidationError);
    });

    it("rejects case-insensitive duplicate employeeId", () => {
      service.createDriver({
        employeeId: "EMP001",
        name: "First",
        passwordHash: "hashed",
        assignedArea: "Area A",
        contact: "010-0000-0000",
      });
      expect(() =>
        service.createDriver({
          employeeId: "emp001",
          name: "Second",
          passwordHash: "hashed",
          assignedArea: "Area B",
          contact: "010-1111-1111",
        })
      ).toThrow(ConflictError);
    });
  });

  describe("deactivateDriver", () => {
    it("sets active to false", () => {
      const driver = service.createDriver({
        employeeId: "EMP002",
        name: "Test",
        passwordHash: "hashed",
        assignedArea: "Area A",
        contact: "010-0000-0000",
      });
      const deactivated = service.deactivateDriver(driver.id);
      expect(deactivated.active).toBe(false);
    });

    it("throws NotFoundError for unknown driver", () => {
      expect(() => service.deactivateDriver(9999)).toThrow(NotFoundError);
    });
  });

  describe("createCamp (BR-7)", () => {
    it("creates a camp with valid input", () => {
      const camp = service.createCamp({ name: "Camp A", assignedArea: "Area A" });
      expect(camp.name).toBe("Camp A");
    });

    it("rejects case-insensitive duplicate camp name", () => {
      service.createCamp({ name: "Camp A", assignedArea: "Area A" });
      expect(() => service.createCamp({ name: "camp a", assignedArea: "Area B" })).toThrow(ConflictError);
    });
  });

  describe("deleteCamp", () => {
    it("removes the camp", () => {
      const camp = service.createCamp({ name: "Camp B", assignedArea: "Area B" });
      service.deleteCamp(camp.id);
      expect(service.getCampById(camp.id)).toBeNull();
    });
  });
});
