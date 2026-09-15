// Delivery API routes. Covers customer lookup/tracking/notes (CUST-1,2,3), driver list/status/
// failure (DRV-2,3,4), and admin monitoring/assignment/history/manual-creation (ADM-2,3,5, SYS-2).

import { Router } from "express";
import type { AppContext } from "../appContext.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import {
  toCustomerDeliveryView,
  toDriverDeliveryView,
  toAdminDeliveryView,
} from "../presenters/deliveryPresenters.js";
import type { DeliveryStatus, FailureReason, ReceiptMethod } from "../domain/types.js";

function handleServiceError(err: unknown, res: import("express").Response): void {
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

export function createDeliveryRoutes(ctx: AppContext): Router {
  const router = Router();
  const driverOnly = requireAuth(ctx.auth, ["driver"]);
  const adminOnly = requireAuth(ctx.auth, ["admin"]);
  const driverOrAdmin = requireAuth(ctx.auth, ["driver", "admin"]);
  const adminView = (delivery: import("../domain/types.js").Delivery) =>
    toAdminDeliveryView(delivery, ctx.delivery.getOperationalMeta(delivery.id));

  // --- Customer routes (public, no auth — identified only by tracking number) ---

  // CUST-1: lookup by tracking number
  router.get("/deliveries/lookup/:trackingNumber", (req, res) => {
    const delivery = ctx.delivery.getDeliveryByTrackingNumber(req.params.trackingNumber);
    if (!delivery) {
      res.status(404).json({ error: "Tracking number not found" });
      return;
    }
    const driver = delivery.driverId ? ctx.masterData.getDriverById(delivery.driverId) : null;
    res.json(toCustomerDeliveryView(delivery, driver));
  });

  // CUST-2: status history timeline for the customer view
  router.get("/deliveries/lookup/:trackingNumber/history", (req, res) => {
    const delivery = ctx.delivery.getDeliveryByTrackingNumber(req.params.trackingNumber);
    if (!delivery) {
      res.status(404).json({ error: "Tracking number not found" });
      return;
    }
    const history = ctx.delivery.getStatusHistory(delivery.id);
    res.json(history);
  });

  // Optional real-time map extension (requirements.md 3.5/3.4.1): current simulated
  // truck position + route for the customer map view. Returns 204 if not currently
  // out_for_delivery (nothing to show on the map yet, or delivery is already done).
  router.get("/deliveries/lookup/:trackingNumber/location", (req, res) => {
    const delivery = ctx.delivery.getDeliveryByTrackingNumber(req.params.trackingNumber);
    if (!delivery) {
      res.status(404).json({ error: "Tracking number not found" });
      return;
    }
    const snapshot = ctx.locationSimulator.getSnapshot(delivery.trackingNumber);
    if (!snapshot) {
      res.status(204).send();
      return;
    }
    res.json(snapshot);
  });

  // CUST-3: update request note (rejected by service if locked, BR-3)
  router.patch("/deliveries/lookup/:trackingNumber/note", (req, res) => {
    const { note } = req.body ?? {};
    if (typeof note !== "string") {
      res.status(400).json({ error: "note is required and must be a string" });
      return;
    }
    try {
      const updated = ctx.delivery.updateRequestNote(req.params.trackingNumber, note);
      res.json(toCustomerDeliveryView(updated));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // --- Driver routes (driver-only auth) ---

  // DRV-2: assigned delivery list, filterable by status
  router.get("/driver/deliveries", driverOnly, (req, res) => {
    const driverId = req.actor!.actorId;
    const status = req.query.status as DeliveryStatus | undefined;
    // Delivery order is the driver's stop sequence: oldest-assigned first (FR-B9). The order
    // is computed over the driver's whole route so numbers stay stable under status filters.
    const routeOrder = new Map(
      ctx.delivery
        .listDeliveries({ driverId })
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
        .map((delivery, index) => [delivery.id, index + 1])
    );
    const deliveries = ctx.delivery
      .listDeliveries({ driverId, status })
      .slice()
      .sort((a, b) => (routeOrder.get(a.id) ?? 0) - (routeOrder.get(b.id) ?? 0));
    res.json(deliveries.map((d) => toDriverDeliveryView(d, routeOrder.get(d.id) ?? null)));
  });

  router.get("/driver/deliveries/:id", driverOnly, (req, res) => {
    try {
      const delivery = ctx.delivery.getDeliveryForDriver(Number(req.params.id), req.actor!.actorId);
      res.json(toDriverDeliveryView(delivery));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // DRV-3: advance status
  router.patch("/driver/deliveries/:id/status", driverOnly, (req, res) => {
    const { status } = req.body ?? {};
    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }
    try {
      ctx.delivery.getDeliveryForDriver(Number(req.params.id), req.actor!.actorId);
      const updated = ctx.delivery.updateStatus(
        Number(req.params.id),
        status as DeliveryStatus,
        `driver:${req.actor!.actorId}`
      );
      res.json(toDriverDeliveryView(updated));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // DRV-3: complete delivery
  router.post("/driver/deliveries/:id/complete", driverOnly, (req, res) => {
    const { receiptMethod, proofOfDeliveryPhotoUrl } = req.body ?? {};
    try {
      ctx.delivery.getDeliveryForDriver(Number(req.params.id), req.actor!.actorId);
      const updated = ctx.delivery.completeDelivery(
        Number(req.params.id),
        { receiptMethod: receiptMethod as ReceiptMethod, proofOfDeliveryPhotoUrl },
        `driver:${req.actor!.actorId}`
      );
      res.json(toDriverDeliveryView(updated));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // DRV-4: report failure
  router.post("/driver/deliveries/:id/fail", driverOnly, (req, res) => {
    const { reason, memo } = req.body ?? {};
    try {
      ctx.delivery.getDeliveryForDriver(Number(req.params.id), req.actor!.actorId);
      const updated = ctx.delivery.reportFailure(
        Number(req.params.id),
        reason as FailureReason,
        memo,
        `driver:${req.actor!.actorId}`
      );
      res.json(toDriverDeliveryView(updated));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // --- Admin routes (admin-only auth) ---

  // ADM-2 / ADM-5: monitoring dashboard + history list, filterable
  router.get("/admin/deliveries", adminOnly, (req, res) => {
    const { status, campId, driverId, dateFrom, dateTo, history } = req.query;
    const historyOnly = history === "true";
    const normalizedDateFrom = dateFrom ? `${String(dateFrom)}T00:00:00.000Z` : undefined;
    const normalizedDateTo = dateTo ? `${String(dateTo)}T23:59:59.999Z` : undefined;
    const deliveries = ctx.delivery.listDeliveries({
      status: status as DeliveryStatus | undefined,
      campId: campId ? Number(campId) : undefined,
      driverId: driverId ? Number(driverId) : undefined,
      dateFrom: historyOnly ? normalizedDateFrom : (dateFrom as string | undefined),
      dateTo: historyOnly ? normalizedDateTo : (dateTo as string | undefined),
      historyOnly,
    });
    res.json(deliveries.map(adminView));
  });

  // ADM-3: unassigned / re-delivery-target list
  router.get("/admin/deliveries/unassigned", adminOnly, (_req, res) => {
    const deliveries = ctx.delivery.listUnassignedDeliveries();
    res.json(deliveries.map(adminView));
  });

  router.get("/admin/deliveries/:id/history", adminOnly, (req, res) => {
    const history = ctx.delivery.getStatusHistory(Number(req.params.id));
    res.json(history);
  });

  // ADM-3: assign / reassign
  router.post("/admin/deliveries/:id/assign", adminOnly, (req, res) => {
    const { driverId } = req.body ?? {};
    if (!driverId) {
      res.status(400).json({ error: "driverId is required" });
      return;
    }
    try {
      const updated = ctx.delivery.assignDriver(Number(req.params.id), Number(driverId), `admin:${req.actor!.actorId}`);
      res.json(adminView(updated));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // SYS-2: manual delivery creation via Admin UI
  router.post("/admin/deliveries", adminOnly, (req, res) => {
    const { productName, address, campId, requestNote } = req.body ?? {};
    try {
      const created = ctx.delivery.createDelivery({ productName, address, campId: Number(campId), requestNote });
      res.status(201).json(adminView(created));
    } catch (err) {
      handleServiceError(err, res);
    }
  });

  // Shared: either driver or admin can look up a single delivery by id (e.g., detail view)
  router.get("/deliveries/:id", driverOrAdmin, (req, res) => {
    const delivery = ctx.delivery.getDeliveryById(Number(req.params.id));
    if (!delivery) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (req.actor!.actorType === "driver") {
      try {
        const owned = ctx.delivery.getDeliveryForDriver(delivery.id, req.actor!.actorId);
        res.json(toDriverDeliveryView(owned));
      } catch (err) {
        handleServiceError(err, res);
      }
    } else {
      res.json(adminView(delivery));
    }
  });

  return router;
}
