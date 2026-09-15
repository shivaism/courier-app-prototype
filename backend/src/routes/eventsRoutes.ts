// SSE endpoints. Customer tracking streams are capability-scoped by tracking number.
// Driver/admin streams require a short-lived one-use ticket minted from a valid JWT.

import { Router } from "express";
import type { AppContext } from "../appContext.js";
import { requireAuth } from "../middleware/auth.js";
import type { SseChannel } from "../services/realtimeService.js";

export function createEventsRoutes(ctx: AppContext): Router {
  const router = Router();
  const driverOrAdmin = requireAuth(ctx.auth, ["driver", "admin"]);

  // Native EventSource cannot send Authorization headers. Authenticated clients mint a
  // one-use ticket first; its channel is inferred from the JWT and cannot be chosen by the
  // caller (prevents drivers subscribing as another driver or to the admin-wide channel).
  router.post("/events/ticket", driverOrAdmin, (req, res) => {
    const actor = req.actor!;
    const channel: SseChannel =
      actor.actorType === "admin" ? { type: "all" } : { type: "driver", driverId: actor.actorId };
    res.status(201).json(ctx.sseTickets.mint(channel));
  });

  // Public recipient capability channel:
  // GET /api/events?channel=tracking&trackingNumber=DT-XXXXXXXX
  // Privileged channel:
  // GET /api/events?ticket=<one-use-ticket>
  router.get("/events", (req, res) => {
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : null;
    if (ticket) {
      const channel = ctx.sseTickets.consume(ticket);
      if (!channel) {
        res.status(401).json({ error: "Invalid or expired realtime ticket" });
        return;
      }
      ctx.realtime.handleSseConnection(res, channel);
      return;
    }

    const channelType = req.query.channel as string | undefined;
    if (channelType !== "tracking") {
      res.status(401).json({ error: "A realtime ticket is required for privileged channels" });
      return;
    }

    const trackingNumber = req.query.trackingNumber as string | undefined;
    if (!trackingNumber || !ctx.delivery.getDeliveryByTrackingNumber(trackingNumber)) {
      res.status(404).json({ error: "Tracking number not found" });
      return;
    }

    ctx.realtime.handleSseConnection(res, { type: "tracking", trackingNumber });
  });

  return router;
}
