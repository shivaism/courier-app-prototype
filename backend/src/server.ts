// Entry point: wires DB, services, routes, and static frontend serving.
// Serves Customer/Driver/Admin apps directly from this single process
// (Application Design Question 2: backend serves frontend static files).

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, ensureDbDirExists, DB_PATH } from "./db/index.js";
import { createAppContext } from "./appContext.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createDeliveryRoutes } from "./routes/deliveryRoutes.js";
import { createMasterDataRoutes } from "./routes/masterDataRoutes.js";
import { createEventsRoutes } from "./routes/eventsRoutes.js";
import { createInquiryRoutes } from "./routes/inquiryRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_ROOT = path.resolve(__dirname, "../../frontend");

async function main() {
  ensureDbDirExists(DB_PATH);
  const db = createDatabase();
  const ctx = createAppContext(db);

  const seedResult = await ctx.seed.seedIfEmpty();
  if (seedResult.seeded) {
    console.log("Seed data created:", seedResult.counts);
  } else {
    console.log("Seed data already present, skipping.");
  }

  const app = express();
  app.use(express.json());

  // API routes
  app.use("/api", createAuthRoutes(ctx));
  app.use("/api", createDeliveryRoutes(ctx));
  app.use("/api", createMasterDataRoutes(ctx));
  app.use("/api", createEventsRoutes(ctx));
  app.use("/api", createInquiryRoutes(ctx));

  // Static frontend apps, served under their own URL paths.
  app.use("/customer", express.static(path.join(FRONTEND_ROOT, "customer")));
  app.use("/driver", express.static(path.join(FRONTEND_ROOT, "driver")));
  app.use("/admin", express.static(path.join(FRONTEND_ROOT, "admin")));

  app.get("/", (_req, res) => {
    res.redirect("/customer");
  });

  // Centralized error handler — catches anything not already handled in a route.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, () => {
    console.log(`Delivery Tracking backend listening on http://localhost:${PORT}`);
    console.log(`  Customer app: http://localhost:${PORT}/customer`);
    console.log(`  Driver app:   http://localhost:${PORT}/driver`);
    console.log(`  Admin app:    http://localhost:${PORT}/admin`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
