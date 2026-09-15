// Minimal customer-inquiry endpoints: public submission (identified only by tracking
// number, matching the customer app's no-login model) plus an admin-only list/resolve pair
// for the ops console.

import { Router } from "express";
import type { AppContext } from "../appContext.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

export function createInquiryRoutes(ctx: AppContext): Router {
  const router = Router();
  const adminOnly = requireAuth(ctx.auth, ["admin"]);

  // Public: a customer submits a question tied to their tracking number.
  router.post("/inquiries", (req, res) => {
    const { trackingNumber, message } = req.body ?? {};
    try {
      const inquiry = ctx.inquiries.createInquiry({ trackingNumber, message });
      res.status(201).json(inquiry);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // Admin: full inbox, optionally filtered to open/resolved.
  router.get("/admin/inquiries", adminOnly, (req, res) => {
    const status = req.query.status as "open" | "resolved" | undefined;
    res.json(ctx.inquiries.listInquiries(status));
  });

  // Admin: reply to and close out an inquiry.
  router.post("/admin/inquiries/:id/resolve", adminOnly, (req, res) => {
    const { reply } = req.body ?? {};
    try {
      const inquiry = ctx.inquiries.resolveInquiry(Number(req.params.id), reply);
      res.json(inquiry);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
