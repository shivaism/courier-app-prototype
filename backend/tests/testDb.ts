// Shared helper for tests: creates an in-memory SQLite database with the schema applied.

import Database from "better-sqlite3";
import { createDatabase } from "../src/db/index.js";

export function createTestDb(): Database.Database {
  return createDatabase(":memory:");
}
