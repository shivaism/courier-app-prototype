// Master Data API routes: driver and camp management (ADM-4). Admin-only.

import { Router } from "express";
import type { AppContext } from "../appContext.js";
import { requireAuth } from "../middleware/auth.js";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";

function handleServiceError(err: unknown, res: import("express").Response): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  throw err;
}

export function createMasterDataRoutes(ctx: AppContext): Router {
  const router = Router();
  const adminOnly = requireAuth(ctx.auth, ["admin"]);

  // --- Drivers ---

  router.get("/admin/drivers", adminOnly, (_req, res) => {
    res.json(ctx.masterData.listDrivers().map(({ passwordHash, ...rest }) => rest));
  });

  router.post("/admin/drivers", adminOnly, async (req, res) => {
    const { employeeId, name, assignedArea, contact, password } = req.body ?? {};
    if (!password) {
      res.status(400).json({ error: "password is required" });
      return;
    }
    try {
      const passwordHash = await ctx.auth.hashPassword(password);
      const driver = ctx.masterData.createDriver({ employeeId, name, assignedArea, contact, passwordHash });
      const { passwordHash: _omit, ...safeDriver } = driver;
      res.status(201).json(safeDriver);
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  router.patch("/admin/drivers/:id", adminOnly, (req, res) => {
    try {
      const driver = ctx.masterData.updateDriver(Number(req.params.id), req.body ?? {});
      const { passwordHash, ...safeDriver } = driver;
      res.json(safeDriver);
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  router.post("/admin/drivers/:id/deactivate", adminOnly, (req, res) => {
    try {
      const driver = ctx.masterData.deactivateDriver(Number(req.params.id));
      const { passwordHash, ...safeDriver } = driver;
      res.json(safeDriver);
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // --- Camps ---

  router.get("/admin/camps", adminOnly, (_req, res) => {
    res.json(ctx.masterData.listCamps());
  });

  router.post("/admin/camps", adminOnly, (req, res) => {
    const { name, assignedArea } = req.body ?? {};
    try {
      const camp = ctx.masterData.createCamp({ name, assignedArea });
      res.status(201).json(camp);
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  router.patch("/admin/camps/:id", adminOnly, (req, res) => {
    try {
      const camp = ctx.masterData.updateCamp(Number(req.params.id), req.body ?? {});
      res.json(camp);
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  router.delete("/admin/camps/:id", adminOnly, (req, res) => {
    try {
      ctx.masterData.deleteCamp(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  return router;
}
