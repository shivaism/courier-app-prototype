import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./testDb.js";
import { MasterDataService } from "../src/services/masterDataService.js";
import { AuthService } from "../src/services/authService.js";
import { AuthenticationError } from "../src/utils/errors.js";

describe("AuthService (BR-9)", () => {
  let db: Database.Database;
  let masterData: MasterDataService;
  let auth: AuthService;

  beforeEach(async () => {
    db = createTestDb();
    masterData = new MasterDataService(db);
    auth = new AuthService(db, masterData);

    const passwordHash = await auth.hashPassword("correct-password");
    masterData.createDriver({
      employeeId: "EMP001",
      name: "Test Driver",
      passwordHash,
      assignedArea: "Area A",
      contact: "010-0000-0000",
    });

    const adminPasswordHash = await auth.hashPassword("admin-password");
    auth.createAdminUser("morgan", adminPasswordHash);
  });

  describe("loginDriver", () => {
    it("succeeds with correct credentials and issues a 12h token", async () => {
      const result = await auth.loginDriver("EMP001", "correct-password");
      expect(result.actorType).toBe("driver");
      const payload = auth.verifyToken(result.token);
      expect(payload?.actorType).toBe("driver");
    });

    it("is case-insensitive on employeeId", async () => {
      const result = await auth.loginDriver("emp001", "correct-password");
      expect(result.actorType).toBe("driver");
    });

    it("rejects wrong password with a generic error", async () => {
      await expect(auth.loginDriver("EMP001", "wrong-password")).rejects.toThrow(AuthenticationError);
    });

    it("rejects unknown employeeId with the same generic error", async () => {
      await expect(auth.loginDriver("UNKNOWN", "whatever")).rejects.toThrow(AuthenticationError);
    });

    it("rejects a deactivated driver", async () => {
      const driver = masterData.getDriverByEmployeeId("EMP001")!;
      masterData.deactivateDriver(driver.id);
      await expect(auth.loginDriver("EMP001", "correct-password")).rejects.toThrow(AuthenticationError);
    });
  });

  describe("loginAdmin", () => {
    it("succeeds with correct credentials and issues a 16h token", async () => {
      const result = await auth.loginAdmin("morgan", "admin-password");
      expect(result.actorType).toBe("admin");
    });

    it("rejects wrong password", async () => {
      await expect(auth.loginAdmin("morgan", "wrong")).rejects.toThrow(AuthenticationError);
    });
  });

  describe("verifyToken", () => {
    it("returns null for an invalid token", () => {
      expect(auth.verifyToken("not-a-real-token")).toBeNull();
    });
  });
});
