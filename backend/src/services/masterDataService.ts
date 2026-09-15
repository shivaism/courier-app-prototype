// Master Data Component (application-design/components.md #3): Driver and Camp CRUD + validation.
// Implements BR-7 (case-insensitive duplicate checks, required-field validation).

import type Database from "better-sqlite3";
import type { Driver, Camp } from "../domain/types.js";
import { ValidationError, ConflictError, NotFoundError } from "../utils/errors.js";

export interface CreateDriverInput {
  employeeId: string;
  name: string;
  passwordHash: string;
  assignedArea: string;
  contact: string;
}

export interface UpdateDriverInput {
  name?: string;
  assignedArea?: string;
  contact?: string;
}

export interface CreateCampInput {
  name: string;
  assignedArea: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateCampInput {
  name?: string;
  assignedArea?: string;
  latitude?: number;
  longitude?: number;
}

// Default to central Seoul if no coordinates are supplied (keeps existing camp-creation
// callers/tests working unchanged while enabling the map feature for new camps).
const DEFAULT_LATITUDE = 37.5665;
const DEFAULT_LONGITUDE = 126.978;

function toDriver(row: any): Driver {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    passwordHash: row.passwordHash,
    assignedArea: row.assignedArea,
    contact: row.contact,
    active: !!row.active,
    createdAt: row.createdAt,
  };
}

function toCamp(row: any): Camp {
  return {
    id: row.id,
    name: row.name,
    assignedArea: row.assignedArea,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt,
  };
}

export class MasterDataService {
  constructor(private db: Database.Database) {}

  // --- Driver operations ---

  createDriver(input: CreateDriverInput): Driver {
    if (!input.employeeId?.trim() || !input.name?.trim() || !input.assignedArea?.trim() || !input.contact?.trim()) {
      throw new ValidationError("employeeId, name, assignedArea, and contact are required");
    }

    const existing = this.getDriverByEmployeeId(input.employeeId);
    if (existing) {
      throw new ConflictError(`A driver with employeeId "${input.employeeId}" already exists`);
    }

    const result = this.db
      .prepare(
        `INSERT INTO drivers (employeeId, name, passwordHash, assignedArea, contact, active)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(input.employeeId, input.name, input.passwordHash, input.assignedArea, input.contact);

    return this.getDriverById(Number(result.lastInsertRowid))!;
  }

  updateDriver(driverId: number, input: UpdateDriverInput): Driver {
    const driver = this.getDriverById(driverId);
    if (!driver) throw new NotFoundError(`Driver ${driverId} not found`);

    const name = input.name ?? driver.name;
    const assignedArea = input.assignedArea ?? driver.assignedArea;
    const contact = input.contact ?? driver.contact;
    if (!name.trim() || !assignedArea.trim() || !contact.trim()) {
      throw new ValidationError("name, assignedArea, and contact cannot be empty");
    }

    this.db
      .prepare(`UPDATE drivers SET name = ?, assignedArea = ?, contact = ? WHERE id = ?`)
      .run(name, assignedArea, contact, driverId);

    return this.getDriverById(driverId)!;
  }

  deactivateDriver(driverId: number): Driver {
    const driver = this.getDriverById(driverId);
    if (!driver) throw new NotFoundError(`Driver ${driverId} not found`);

    this.db.prepare(`UPDATE drivers SET active = 0 WHERE id = ?`).run(driverId);
    return this.getDriverById(driverId)!;
  }

  getDriverById(driverId: number): Driver | null {
    const row = this.db.prepare(`SELECT * FROM drivers WHERE id = ?`).get(driverId);
    return row ? toDriver(row) : null;
  }

  // Case-insensitive lookup (BR-7).
  getDriverByEmployeeId(employeeId: string): Driver | null {
    const row = this.db
      .prepare(`SELECT * FROM drivers WHERE employeeId = ? COLLATE NOCASE`)
      .get(employeeId);
    return row ? toDriver(row) : null;
  }

  listDrivers(): Driver[] {
    const rows = this.db.prepare(`SELECT * FROM drivers ORDER BY name ASC`).all();
    return rows.map(toDriver);
  }

  // --- Camp operations ---

  createCamp(input: CreateCampInput): Camp {
    if (!input.name?.trim() || !input.assignedArea?.trim()) {
      throw new ValidationError("name and assignedArea are required");
    }

    const existing = this.getCampByName(input.name);
    if (existing) {
      throw new ConflictError(`A camp named "${input.name}" already exists`);
    }

    const result = this.db
      .prepare(`INSERT INTO camps (name, assignedArea, latitude, longitude) VALUES (?, ?, ?, ?)`)
      .run(
        input.name,
        input.assignedArea,
        input.latitude ?? DEFAULT_LATITUDE,
        input.longitude ?? DEFAULT_LONGITUDE
      );

    return this.getCampById(Number(result.lastInsertRowid))!;
  }

  updateCamp(campId: number, input: UpdateCampInput): Camp {
    const camp = this.getCampById(campId);
    if (!camp) throw new NotFoundError(`Camp ${campId} not found`);

    const name = input.name ?? camp.name;
    const assignedArea = input.assignedArea ?? camp.assignedArea;
    const latitude = input.latitude ?? camp.latitude;
    const longitude = input.longitude ?? camp.longitude;
    if (!name.trim() || !assignedArea.trim()) {
      throw new ValidationError("name and assignedArea cannot be empty");
    }
    const duplicate = this.getCampByName(name);
    if (duplicate && duplicate.id !== campId) {
      throw new ConflictError(`A camp named "${name}" already exists`);
    }

    this.db
      .prepare(`UPDATE camps SET name = ?, assignedArea = ?, latitude = ?, longitude = ? WHERE id = ?`)
      .run(name, assignedArea, latitude, longitude, campId);
    return this.getCampById(campId)!;
  }

  deleteCamp(campId: number): void {
    const camp = this.getCampById(campId);
    if (!camp) throw new NotFoundError(`Camp ${campId} not found`);

    const references = this.db.prepare(`SELECT COUNT(*) AS count FROM deliveries WHERE campId = ?`).get(campId) as {
      count: number;
    };
    if (references.count > 0) {
      throw new ConflictError("Camp cannot be deleted while deliveries reference it");
    }
    this.db.prepare(`DELETE FROM camps WHERE id = ?`).run(campId);
  }

  getCampById(campId: number): Camp | null {
    const row = this.db.prepare(`SELECT * FROM camps WHERE id = ?`).get(campId);
    return row ? toCamp(row) : null;
  }

  // Case-insensitive lookup (BR-7).
  getCampByName(name: string): Camp | null {
    const row = this.db.prepare(`SELECT * FROM camps WHERE name = ? COLLATE NOCASE`).get(name);
    return row ? toCamp(row) : null;
  }

  listCamps(): Camp[] {
    const rows = this.db.prepare(`SELECT * FROM camps ORDER BY name ASC`).all();
    return rows.map(toCamp);
  }
}
