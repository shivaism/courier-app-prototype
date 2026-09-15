// Auth API routes: driver login (DRV-1) and admin login (ADM-1).

import { Router } from "express";
import type { AppContext } from "../appContext.js";
import { AuthenticationError } from "../utils/errors.js";

export function createAuthRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post("/auth/driver/login", async (req, res) => {
    const { employeeId, password } = req.body ?? {};
    if (!employeeId || !password) {
      res.status(400).json({ error: "employeeId and password are required" });
      return;
    }

    try {
      const result = await ctx.auth.loginDriver(employeeId, password);
      res.json(result);
    } catch (err) {
      if (err instanceof AuthenticationError) {
        res.status(401).json({ error: "Invalid employee ID or password" });
        return;
      }
      throw err;
    }
  });

  router.post("/auth/admin/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    try {
      const result = await ctx.auth.loginAdmin(username, password);
      res.json(result);
    } catch (err) {
      if (err instanceof AuthenticationError) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }
      throw err;
    }
  });

  return router;
}
