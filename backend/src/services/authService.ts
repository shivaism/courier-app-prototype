// Auth Component (application-design/components.md #2): shared login/JWT/bcrypt logic for
// both driver and admin actor types (Application Design Question 2).
// Implements BR-9.

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type Database from "better-sqlite3";
import type { ActorType, AdminUser } from "../domain/types.js";
import { AuthenticationError } from "../utils/errors.js";
import type { MasterDataService } from "./masterDataService.js";

const BCRYPT_ROUNDS = 10;
const DRIVER_SESSION_EXPIRY = "12h";
const ADMIN_SESSION_EXPIRY = "16h";

const JWT_SECRET = process.env.JWT_SECRET ?? "workshop-demo-secret-not-for-production";

export interface AuthTokenPayload {
  actorType: ActorType;
  actorId: number;
}

export interface LoginResult {
  token: string;
  actorType: ActorType;
  actorId: number;
  name: string;
}

function toAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  };
}

export class AuthService {
  constructor(private db: Database.Database, private masterData: MasterDataService) {}

  async hashPassword(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  }

  async loginDriver(employeeId: string, password: string): Promise<LoginResult> {
    const driver = this.masterData.getDriverByEmployeeId(employeeId);
    // Generic failure message regardless of which part was wrong (BR-9).
    if (!driver || !driver.active) {
      throw new AuthenticationError();
    }

    const valid = await bcrypt.compare(password, driver.passwordHash);
    if (!valid) {
      throw new AuthenticationError();
    }

    const token = jwt.sign({ actorType: "driver", actorId: driver.id }, JWT_SECRET, {
      expiresIn: DRIVER_SESSION_EXPIRY,
    });

    return { token, actorType: "driver", actorId: driver.id, name: driver.name };
  }

  async loginAdmin(username: string, password: string): Promise<LoginResult> {
    const admin = this.getAdminByUsername(username);
    if (!admin) {
      throw new AuthenticationError();
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new AuthenticationError();
    }

    const token = jwt.sign({ actorType: "admin", actorId: admin.id }, JWT_SECRET, {
      expiresIn: ADMIN_SESSION_EXPIRY,
    });

    return { token, actorType: "admin", actorId: admin.id, name: admin.username };
  }

  verifyToken(token: string): AuthTokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /** Drivers are rechecked on every protected request so deactivation revokes existing JWTs. */
  isActorActive(payload: AuthTokenPayload): boolean {
    if (payload.actorType === "driver") {
      return this.masterData.getDriverById(payload.actorId)?.active === true;
    }
    if (payload.actorType === "admin") {
      return this.getAdminById(payload.actorId) !== null;
    }
    return false;
  }

  createAdminUser(username: string, passwordHash: string): AdminUser {
    const result = this.db
      .prepare(`INSERT INTO admin_users (username, passwordHash) VALUES (?, ?)`)
      .run(username, passwordHash);
    return this.getAdminById(Number(result.lastInsertRowid))!;
  }

  getAdminById(id: number): AdminUser | null {
    const row = this.db.prepare(`SELECT * FROM admin_users WHERE id = ?`).get(id);
    return row ? toAdminUser(row) : null;
  }

  getAdminByUsername(username: string): AdminUser | null {
    const row = this.db.prepare(`SELECT * FROM admin_users WHERE username = ?`).get(username);
    return row ? toAdminUser(row) : null;
  }
}
