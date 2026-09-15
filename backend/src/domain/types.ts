// Domain types for the Delivery Tracking & Driver Console backend.
// Mirrors aidlc-docs/construction/backend-service/functional-design/domain-entities.md

export type DeliveryStatus =
  | "intake"
  | "pickup"
  | "line_haul_loaded"
  | "arrived_at_camp"
  | "out_for_delivery"
  | "delivered"
  | "failed";

// Ordered sequence used to enforce strict sequential transitions (BR-1).
// "failed" is a side-branch, reachable only from "out_for_delivery" (BR-4), and is
// intentionally excluded from this ordered array.
export const DELIVERY_STATUS_SEQUENCE: DeliveryStatus[] = [
  "intake",
  "pickup",
  "line_haul_loaded",
  "arrived_at_camp",
  "out_for_delivery",
  "delivered",
];

export type FailureReason = "recipient_absent" | "bad_address" | "receipt_refused" | "other";

export type ReceiptMethod = "in_person" | "at_door" | "security_desk" | "other";

export type ActorType = "driver" | "admin" | "system";

export interface Delivery {
  id: number;
  trackingNumber: string;
  productName: string;
  address: string;
  campId: number;
  driverId: number | null;
  status: DeliveryStatus;
  requestNote: string | null;
  isRedeliveryTarget: boolean;
  failureReason: FailureReason | null;
  failureMemo: string | null;
  receiptMethod: ReceiptMethod | null;
  proofOfDeliveryPhotoUrl: string | null;
  eta: string | null; // ISO datetime string, computed once at out_for_delivery (BR-6)
  intakeAt: string | null;
  pickupAt: string | null;
  lineHaulLoadedAt: string | null;
  arrivedAtCampAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  // Legacy placeholder column. The live map is now active but models routes in-memory via
  // LocationSimulatorService (road-snapped OSRM route, synthetic fallback), so this column
  // is retained only for schema compatibility and is intentionally unused.
  futureRouteRef: string | null;
}

export interface Driver {
  id: number;
  employeeId: string;
  name: string;
  passwordHash: string;
  assignedArea: string;
  contact: string;
  active: boolean;
  createdAt: string;
}

export interface Camp {
  id: number;
  name: string;
  assignedArea: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: number;
  deliveryId: number;
  status: DeliveryStatus;
  changedAt: string;
  actor: string; // e.g. "driver:EMP001", "admin:morgan", "system"
}

export interface AdminUser {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
}

// Generic SSE event envelope (BR-10 / Question 6 of application-design-plan.md)
// "locationUpdated" supports the optional real-time delivery location map extension
// (requirements.md Section 3.5 / constraints.md: mock-coordinate simulation, no real GPS).
export type DomainEventType = "statusChanged" | "assignmentChanged" | "deliveryFailed" | "locationUpdated";

export interface DomainEvent<T = unknown> {
  eventType: DomainEventType;
  trackingNumber: string;
  driverId?: number | null;
  payload: T;
}
