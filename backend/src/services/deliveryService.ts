// Delivery Component (application-design/components.md #1): core lifecycle, assignment,
// request notes, failure handling, status history.
// Implements BR-1 through BR-6, plus the create/list/lookup workflows from business-logic-model.md.

import type Database from "better-sqlite3";
import {
  DELIVERY_STATUS_SEQUENCE,
  type Delivery,
  type DeliveryStatus,
  type FailureReason,
  type ReceiptMethod,
  type StatusHistoryEntry,
} from "../domain/types.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { generateUniqueTrackingNumber } from "../utils/trackingNumber.js";
import { eventBus } from "../events/eventBus.js";
import type { MasterDataService } from "./masterDataService.js";

// Fixed ETA offset (BR-6): a simple, static computed value, not a real-time recalculation engine.
const ETA_OFFSET_HOURS = 2;
const MAX_NOTE_LENGTH = 500;
const MAX_MEMO_LENGTH = 300;
const ALLOWED_RECEIPT_METHODS = new Set<ReceiptMethod>(["in_person", "at_door", "security_desk", "other"]);
const ALLOWED_FAILURE_REASONS = new Set<FailureReason>([
  "recipient_absent",
  "bad_address",
  "receipt_refused",
  "other",
]);

export interface CreateDeliveryInput {
  productName: string;
  address: string;
  campId: number;
  requestNote?: string;
}

export interface DeliveryFilter {
  status?: DeliveryStatus;
  campId?: number;
  driverId?: number;
  dateFrom?: string;
  dateTo?: string;
  historyOnly?: boolean;
}

export interface DeliveryOperationalMeta {
  lastStatusChangeAt: string | null;
  outcomeAt: string | null;
  isDelayed: boolean;
}

function toDelivery(row: any): Delivery {
  return {
    id: row.id,
    trackingNumber: row.trackingNumber,
    productName: row.productName,
    address: row.address,
    campId: row.campId,
    driverId: row.driverId,
    status: row.status,
    requestNote: row.requestNote,
    isRedeliveryTarget: !!row.isRedeliveryTarget,
    failureReason: row.failureReason,
    failureMemo: row.failureMemo,
    receiptMethod: row.receiptMethod,
    proofOfDeliveryPhotoUrl: row.proofOfDeliveryPhotoUrl,
    eta: row.eta,
    intakeAt: row.intakeAt,
    pickupAt: row.pickupAt,
    lineHaulLoadedAt: row.lineHaulLoadedAt,
    arrivedAtCampAt: row.arrivedAtCampAt,
    outForDeliveryAt: row.outForDeliveryAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    futureRouteRef: row.futureRouteRef,
  };
}

// Maps each status to the Delivery column that stores its timestamp (BR-1).
const STATUS_TIMESTAMP_COLUMN: Record<DeliveryStatus, string | null> = {
  intake: "intakeAt",
  pickup: "pickupAt",
  line_haul_loaded: "lineHaulLoadedAt",
  arrived_at_camp: "arrivedAtCampAt",
  out_for_delivery: "outForDeliveryAt",
  delivered: "deliveredAt",
  failed: null, // failed has no dedicated timestamp column; recorded via status_history
};

// Statuses at/after which the request note becomes read-only (BR-3).
const NOTE_LOCKED_STATUSES: DeliveryStatus[] = ["out_for_delivery", "delivered", "failed"];

export class DeliveryService {
  constructor(private db: Database.Database, private masterData: MasterDataService) {}

  createDelivery(input: CreateDeliveryInput): Delivery {
    if (!input.productName?.trim() || !input.address?.trim() || !input.campId) {
      throw new ValidationError("productName, address, and campId are required");
    }
    if (input.requestNote && input.requestNote.length > MAX_NOTE_LENGTH) {
      throw new ValidationError(`requestNote must be ${MAX_NOTE_LENGTH} characters or fewer`);
    }

    const camp = this.masterData.getCampById(input.campId);
    if (!camp) {
      throw new ValidationError(`Camp ${input.campId} does not exist`);
    }

    const trackingNumber = generateUniqueTrackingNumber(
      (candidate) => this.getDeliveryByTrackingNumber(candidate) !== null
    );

    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `INSERT INTO deliveries (trackingNumber, productName, address, campId, status, requestNote, intakeAt, createdAt)
         VALUES (?, ?, ?, ?, 'intake', ?, ?, ?)`
      )
      .run(trackingNumber, input.productName, input.address, input.campId, input.requestNote ?? null, now, now);

    const deliveryId = Number(result.lastInsertRowid);
    this.writeStatusHistory(deliveryId, "intake", "system");

    return this.getDeliveryById(deliveryId)!;
  }

  getDeliveryById(id: number): Delivery | null {
    const row = this.db.prepare(`SELECT * FROM deliveries WHERE id = ?`).get(id);
    return row ? toDelivery(row) : null;
  }

  getDeliveryByTrackingNumber(trackingNumber: string): Delivery | null {
    const row = this.db
      .prepare(`SELECT * FROM deliveries WHERE trackingNumber = ? COLLATE NOCASE`)
      .get(trackingNumber);
    return row ? toDelivery(row) : null;
  }

  listDeliveries(filter: DeliveryFilter = {}): Delivery[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const outcomeExpression = `COALESCE(deliveredAt, (
      SELECT MAX(sh.changedAt) FROM status_history sh
      WHERE sh.deliveryId = deliveries.id AND sh.status = 'failed'
    ))`;

    if (filter.historyOnly) {
      clauses.push("status IN ('delivered', 'failed')");
    }
    if (filter.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    if (filter.campId) {
      clauses.push("campId = ?");
      params.push(filter.campId);
    }
    if (filter.driverId) {
      clauses.push("driverId = ?");
      params.push(filter.driverId);
    }
    if (filter.dateFrom) {
      clauses.push(`${filter.historyOnly ? outcomeExpression : "createdAt"} >= ?`);
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      clauses.push(`${filter.historyOnly ? outcomeExpression : "createdAt"} <= ?`);
      params.push(filter.dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const orderBy = filter.historyOnly ? `${outcomeExpression} DESC` : "createdAt DESC";
    const rows = this.db.prepare(`SELECT * FROM deliveries ${where} ORDER BY ${orderBy}`).all(...params);
    return rows.map(toDelivery);
  }

  getOperationalMeta(deliveryId: number): DeliveryOperationalMeta {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

    const latest = this.db
      .prepare(`SELECT changedAt FROM status_history WHERE deliveryId = ? ORDER BY changedAt DESC, id DESC LIMIT 1`)
      .get(deliveryId) as { changedAt: string } | undefined;
    const failedOutcome = this.db
      .prepare(`SELECT changedAt FROM status_history WHERE deliveryId = ? AND status = 'failed' ORDER BY changedAt DESC, id DESC LIMIT 1`)
      .get(deliveryId) as { changedAt: string } | undefined;

    const outcomeAt = delivery.status === "delivered" ? delivery.deliveredAt : delivery.status === "failed" ? failedOutcome?.changedAt ?? null : null;
    const isDelayed =
      delivery.status === "out_for_delivery" && !!delivery.eta && new Date(delivery.eta).getTime() < Date.now();

    return {
      lastStatusChangeAt: latest?.changedAt ?? null,
      outcomeAt,
      isDelayed,
    };
  }

  getDeliveryForDriver(deliveryId: number, driverId: number): Delivery {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery || delivery.driverId !== driverId) {
      // Use not-found semantics so IDs cannot be used to probe another driver's workload.
      throw new NotFoundError(`Delivery ${deliveryId} not found`);
    }
    return delivery;
  }

  listUnassignedDeliveries(): Delivery[] {
    const rows = this.db
      .prepare(`SELECT * FROM deliveries WHERE driverId IS NULL OR status = 'failed' ORDER BY createdAt ASC`)
      .all();
    return rows.map(toDelivery);
  }

  /**
   * Advance delivery status by exactly one step in the defined sequence (BR-1).
   * Computes ETA when reaching out_for_delivery (BR-6).
   */
  updateStatus(deliveryId: number, newStatus: DeliveryStatus, actor: string): Delivery {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

    this.assertValidSequentialTransition(delivery.status, newStatus);

    const now = new Date().toISOString();
    const timestampColumn = STATUS_TIMESTAMP_COLUMN[newStatus];

    let eta = delivery.eta;
    if (newStatus === "out_for_delivery") {
      const etaDate = new Date(now);
      etaDate.setHours(etaDate.getHours() + ETA_OFFSET_HOURS);
      eta = etaDate.toISOString();
    }

    if (timestampColumn) {
      this.db
        .prepare(`UPDATE deliveries SET status = ?, ${timestampColumn} = ?, eta = ? WHERE id = ?`)
        .run(newStatus, now, eta, deliveryId);
    } else {
      this.db.prepare(`UPDATE deliveries SET status = ?, eta = ? WHERE id = ?`).run(newStatus, eta, deliveryId);
    }

    this.writeStatusHistory(deliveryId, newStatus, actor);

    const updated = this.getDeliveryById(deliveryId)!;
    eventBus.publish({
      eventType: "statusChanged",
      trackingNumber: updated.trackingNumber,
      driverId: updated.driverId,
      payload: { status: updated.status, eta: updated.eta },
    });

    return updated;
  }

  /**
   * Mark delivery as delivered, requiring completion details (BR-2).
   */
  completeDelivery(
    deliveryId: number,
    details: { receiptMethod: ReceiptMethod; proofOfDeliveryPhotoUrl: string },
    actor: string
  ): Delivery {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

    if (delivery.status !== "out_for_delivery") {
      throw new ValidationError(
        `Delivery must be "out_for_delivery" to complete (current status: ${delivery.status})`
      );
    }
    if (!ALLOWED_RECEIPT_METHODS.has(details.receiptMethod)) {
      throw new ValidationError("receiptMethod must be one of: in_person, at_door, security_desk, other");
    }
    if (!details.proofOfDeliveryPhotoUrl?.trim()) {
      throw new ValidationError("proofOfDeliveryPhotoUrl is required to complete a delivery");
    }
    let proofUrl: URL;
    try {
      proofUrl = new URL(details.proofOfDeliveryPhotoUrl);
    } catch {
      throw new ValidationError("proofOfDeliveryPhotoUrl must be a valid HTTP(S) URL");
    }
    if (!['http:', 'https:'].includes(proofUrl.protocol)) {
      throw new ValidationError("proofOfDeliveryPhotoUrl must use HTTP or HTTPS");
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE deliveries
         SET status = 'delivered', deliveredAt = ?, receiptMethod = ?, proofOfDeliveryPhotoUrl = ?
         WHERE id = ?`
      )
      .run(now, details.receiptMethod, details.proofOfDeliveryPhotoUrl, deliveryId);

    this.writeStatusHistory(deliveryId, "delivered", actor);

    const updated = this.getDeliveryById(deliveryId)!;
    eventBus.publish({
      eventType: "statusChanged",
      trackingNumber: updated.trackingNumber,
      driverId: updated.driverId,
      payload: { status: updated.status, receiptMethod: updated.receiptMethod },
    });

    return updated;
  }

  /**
   * Record a delivery failure and flag as re-delivery target (BR-4).
   */
  reportFailure(
    deliveryId: number,
    reason: FailureReason,
    memo: string | undefined,
    actor: string
  ): Delivery {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

    if (delivery.status !== "out_for_delivery") {
      throw new ValidationError(
        `Delivery must be "out_for_delivery" to report a failure (current status: ${delivery.status})`
      );
    }
    if (!ALLOWED_FAILURE_REASONS.has(reason)) {
      throw new ValidationError("failureReason must be one of: recipient_absent, bad_address, receipt_refused, other");
    }
    if (memo && memo.length > MAX_MEMO_LENGTH) {
      throw new ValidationError(`failureMemo must be ${MAX_MEMO_LENGTH} characters or fewer`);
    }

    this.db
      .prepare(
        `UPDATE deliveries
         SET status = 'failed', isRedeliveryTarget = 1, failureReason = ?, failureMemo = ?
         WHERE id = ?`
      )
      .run(reason, memo ?? null, deliveryId);

    this.writeStatusHistory(deliveryId, "failed", actor);

    const updated = this.getDeliveryById(deliveryId)!;
    eventBus.publish({
      eventType: "deliveryFailed",
      trackingNumber: updated.trackingNumber,
      driverId: updated.driverId,
      payload: { failureReason: updated.failureReason, failureMemo: updated.failureMemo },
    });

    return updated;
  }

  /**
   * Update the customer request note, enforcing the edit lockout (BR-3).
   */
  updateRequestNote(trackingNumber: string, note: string): Delivery {
    const delivery = this.getDeliveryByTrackingNumber(trackingNumber);
    if (!delivery) throw new NotFoundError(`Delivery with tracking number ${trackingNumber} not found`);

    if (note.length > MAX_NOTE_LENGTH) {
      throw new ValidationError(`requestNote must be ${MAX_NOTE_LENGTH} characters or fewer`);
    }

    if (NOTE_LOCKED_STATUSES.includes(delivery.status)) {
      throw new ValidationError(
        `Request note can no longer be edited — delivery status is "${delivery.status}"`
      );
    }

    this.db.prepare(`UPDATE deliveries SET requestNote = ? WHERE id = ?`).run(note, delivery.id);
    return this.getDeliveryById(delivery.id)!;
  }

  /**
   * Assign or reassign a delivery to a driver (BR-5). Resets a failed delivery back to
   * out_for_delivery per BR-4's re-delivery flow.
   */
  assignDriver(deliveryId: number, driverId: number, actor: string): Delivery {
    const delivery = this.getDeliveryById(deliveryId);
    if (!delivery) throw new NotFoundError(`Delivery ${deliveryId} not found`);

    const driver = this.masterData.getDriverById(driverId);
    if (!driver || !driver.active) {
      throw new ValidationError(`Driver ${driverId} does not exist or is not active`);
    }

    const wasFailed = delivery.status === "failed";

    if (wasFailed) {
      const now = new Date().toISOString();
      const etaDate = new Date(now);
      etaDate.setHours(etaDate.getHours() + ETA_OFFSET_HOURS);
      this.db
        .prepare(
          `UPDATE deliveries
           SET driverId = ?, status = 'out_for_delivery', isRedeliveryTarget = 0,
               failureReason = NULL, failureMemo = NULL, outForDeliveryAt = ?, eta = ?
           WHERE id = ?`
        )
        .run(driverId, now, etaDate.toISOString(), deliveryId);
      this.writeStatusHistory(deliveryId, "out_for_delivery", actor);
    } else {
      this.db.prepare(`UPDATE deliveries SET driverId = ? WHERE id = ?`).run(driverId, deliveryId);
    }

    const updated = this.getDeliveryById(deliveryId)!;
    eventBus.publish({
      eventType: "assignmentChanged",
      trackingNumber: updated.trackingNumber,
      driverId: updated.driverId,
      payload: { driverId: updated.driverId, status: updated.status },
    });
    if (wasFailed) {
      // A failed-delivery reassignment is also a fresh out-for-delivery attempt. Publishing
      // statusChanged restarts the location simulator and refreshes recipient ETA/map state.
      eventBus.publish({
        eventType: "statusChanged",
        trackingNumber: updated.trackingNumber,
        driverId: updated.driverId,
        payload: { status: updated.status, eta: updated.eta, redeliveryAttempt: true },
      });
    }

    return updated;
  }

  getStatusHistory(deliveryId: number): StatusHistoryEntry[] {
    const rows = this.db
      .prepare(`SELECT * FROM status_history WHERE deliveryId = ? ORDER BY changedAt ASC`)
      .all(deliveryId);
    return rows.map((row: any) => ({
      id: row.id,
      deliveryId: row.deliveryId,
      status: row.status,
      changedAt: row.changedAt,
      actor: row.actor,
    }));
  }

  private writeStatusHistory(deliveryId: number, status: DeliveryStatus, actor: string): void {
    this.db
      .prepare(`INSERT INTO status_history (deliveryId, status, actor) VALUES (?, ?, ?)`)
      .run(deliveryId, status, actor);
  }

  /**
   * BR-1: status must move strictly forward, one step at a time. "failed" is only reachable
   * from "out_for_delivery" and is handled by reportFailure(), not this generic transition path.
   */
  private assertValidSequentialTransition(current: DeliveryStatus, next: DeliveryStatus): void {
    if (next === "failed") {
      throw new ValidationError('Use reportFailure() to transition a delivery to "failed"');
    }

    const currentIndex = DELIVERY_STATUS_SEQUENCE.indexOf(current);
    const nextIndex = DELIVERY_STATUS_SEQUENCE.indexOf(next);

    if (currentIndex === -1 || nextIndex === -1) {
      throw new ValidationError(`Invalid status value: ${next}`);
    }
    if (nextIndex !== currentIndex + 1) {
      throw new ValidationError(
        `Cannot transition from "${current}" to "${next}" — status must advance one step at a time`
      );
    }
  }
}
