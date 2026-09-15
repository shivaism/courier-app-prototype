// SSE endpoint (SYS-3). Single shared Realtime component design (Application Design Question 3):
// one endpoint, channel-filtered, used by all 3 frontends.

import { Router } from "express";
import type { AppContext } from "../appContext.js";
import type { SseChannel } from "../services/realtimeService.js";

export function createEventsRoutes(ctx: AppContext): Router {
  const router = Router();

  // GET /api/events?channel=tracking&trackingNumber=DT-XXXXXXXX
  // GET /api/events?channel=driver&driverId=1
  // GET /api/events?channel=all
  router.get("/events", (req, res) => {
    const channelType = req.query.channel as string | undefined;

    let channel: SseChannel;
    if (channelType === "tracking") {
      const trackingNumber = req.query.trackingNumber as string | undefined;
      if (!trackingNumber) {
        res.status(400).json({ error: "trackingNumber is required for channel=tracking" });
        return;
      }
      channel = { type: "tracking", trackingNumber };
    } else if (channelType === "driver") {
      const driverId = Number(req.query.driverId);
      if (!driverId) {
        res.status(400).json({ error: "driverId is required for channel=driver" });
        return;
      }
      channel = { type: "driver", driverId };
    } else if (channelType === "all") {
      channel = { type: "all" };
    } else {
      res.status(400).json({ error: 'channel must be one of: "tracking", "driver", "all"' });
      return;
    }

    ctx.realtime.handleSseConnection(res, channel);
  });

  return router;
}
