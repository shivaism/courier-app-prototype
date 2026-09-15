// Express middleware for JWT verification, used on all driver/admin-protected routes.

import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../services/authService.js";
import type { ActorType } from "../domain/types.js";

declare module "express-serve-static-core" {
  interface Request {
    actor?: { actorType: ActorType; actorId: number };
  }
}

export function requireAuth(authService: AuthService, allowedActorTypes: ActorType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or malformed Authorization header" });
      return;
    }

    const token = header.slice("Bearer ".length);
    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    if (!allowedActorTypes.includes(payload.actorType)) {
      res.status(403).json({ error: "Not authorized for this resource" });
      return;
    }

    if (!authService.isActorActive(payload)) {
      res.status(401).json({ error: "Account is inactive or no longer available" });
      return;
    }

    req.actor = payload;
    next();
  };
}
