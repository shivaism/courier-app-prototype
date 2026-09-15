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
      clauses.push("createdAt >= ?");
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      clauses.push("createdAt <= ?");
      params.push(filter.dateTo);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM deliveries ${where} ORDER BY createdAt DESC`).all(...params);
    return rows.map(toDelivery);
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
    if (!details.receiptMethod || !details.proofOfDeliveryPhotoUrl?.trim()) {
      throw new ValidationError("receiptMethod and proofOfDeliveryPhotoUrl are required to complete a delivery");
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
    if (!reason) {
      throw new ValidationError("failureReason is required");
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
      this.db
        .prepare(
          `UPDATE deliveries SET driverId = ?, status = 'out_for_delivery', isRedeliveryTarget = 0 WHERE id = ?`
        )
        .run(driverId, deliveryId);
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
