// SQLite connection and schema setup.
// Uses better-sqlite3 (synchronous API) — appropriate for a single-process, demo-scale MVP.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = path.resolve(process.cwd());
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DB_DIR, "delivery-tracking.db");

export function createDatabase(dbPath: string = DB_PATH): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS camps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      assignedArea TEXT NOT NULL,
      latitude REAL NOT NULL DEFAULT 37.5665,
      longitude REAL NOT NULL DEFAULT 126.9780,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employeeId TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      assignedArea TEXT NOT NULL,
      contact TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackingNumber TEXT NOT NULL UNIQUE,
      productName TEXT NOT NULL,
      address TEXT NOT NULL,
      campId INTEGER NOT NULL REFERENCES camps(id),
      driverId INTEGER REFERENCES drivers(id),
      status TEXT NOT NULL DEFAULT 'intake',
      requestNote TEXT,
      isRedeliveryTarget INTEGER NOT NULL DEFAULT 0,
      failureReason TEXT,
      failureMemo TEXT,
      receiptMethod TEXT,
      proofOfDeliveryPhotoUrl TEXT,
      eta TEXT,
      intakeAt TEXT,
      pickupAt TEXT,
      lineHaulLoadedAt TEXT,
      arrivedAtCampAt TEXT,
      outForDeliveryAt TEXT,
      deliveredAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      futureRouteRef TEXT
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deliveryId INTEGER NOT NULL REFERENCES deliveries(id),
      status TEXT NOT NULL,
      changedAt TEXT NOT NULL DEFAULT (datetime('now')),
      actor TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_driverId ON deliveries(driverId);
    CREATE INDEX IF NOT EXISTS idx_deliveries_campId ON deliveries(campId);
    CREATE INDEX IF NOT EXISTS idx_status_history_deliveryId ON status_history(deliveryId);
  `);

  // Migration guard: add latitude/longitude to camps if this DB predates the map feature.
  const campColumns = db.prepare(`PRAGMA table_info(camps)`).all() as Array<{ name: string }>;
  const hasLatitude = campColumns.some((c) => c.name === "latitude");
  if (!hasLatitude) {
    db.exec(`
      ALTER TABLE camps ADD COLUMN latitude REAL NOT NULL DEFAULT 37.5665;
      ALTER TABLE camps ADD COLUMN longitude REAL NOT NULL DEFAULT 126.9780;
    `);
  }
}

export function ensureDbDirExists(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export { DB_PATH };
