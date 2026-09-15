// Shared presentation/serialization utility (application-design/components.md, Question 6).
// Delivery/Auth services always work with full, untransformed domain data. Audience-specific
// shaping (address masking, driver last-name-only) happens ONLY here, at the API boundary.

import type { Delivery, Driver } from "../domain/types.js";

function maskAddress(address: string): string {
  // Simple masking: keep the first segment (street number/name), mask the rest.
  const parts = address.split(",");
  if (parts.length <= 1) {
    return address.length > 6 ? `${address.slice(0, 6)}***` : "***";
  }
  return `${parts[0].trim()}, ***`;
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// Fun, clearly-fictional cartoon avatar for the "driver card" on the live tracking map.
// Deliberately NOT a real person's photo/likeness — deterministically picked per driver id
// so the same driver always gets the same avatar within a session.
const DRIVER_AVATAR_EMOJIS = ["🧑‍🚀", "🦸", "🧑‍🎤", "🕶️", "😎", "🧑‍✈️", "🥷", "🧑‍🔧"];

function driverAvatarEmoji(driverId: number): string {
  return DRIVER_AVATAR_EMOJIS[driverId % DRIVER_AVATAR_EMOJIS.length];
}

export interface CustomerDeliveryView {
  trackingNumber: string;
  productName: string;
  address: string; // masked
  status: string;
  eta: string | null;
  requestNote: string | null;
  requestNoteEditable: boolean;
  driverLastName: string | null;
  driverAvatar: string | null; // fictional avatar emoji, not a real photo/likeness
  receiptMethod: string | null;
  proofOfDeliveryPhotoUrl: string | null;
  deliveredAt: string | null;
  statusTimestamps: {
    intakeAt: string | null;
    pickupAt: string | null;
    lineHaulLoadedAt: string | null;
    arrivedAtCampAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
  };
}

export interface DriverDeliveryView {
  id: number;
  trackingNumber: string;
  productName: string;
  address: string; // full, unmasked — driver needs the real address
  requestNote: string | null;
  status: string;
  isRedeliveryTarget: boolean;
  deliveryOrder: number | null; // 1-based stop sequence within the driver's route
  eta: string | null;
}

export interface AdminDeliveryView {
  id: number;
  trackingNumber: string;
  productName: string;
  address: string; // full
  campId: number;
  driverId: number | null;
  status: string;
  isRedeliveryTarget: boolean;
  failureReason: string | null;
  failureMemo: string | null;
  lastStatusChangeAt: string | null;
  outcomeAt: string | null;
  isDelayed: boolean;
  eta: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const NOTE_LOCKED_STATUSES = new Set(["out_for_delivery", "delivered", "failed"]);

export function toCustomerDeliveryView(delivery: Delivery, driver?: Driver | null): CustomerDeliveryView {
  return {
    trackingNumber: delivery.trackingNumber,
    productName: delivery.productName,
    address: maskAddress(delivery.address),
    status: delivery.status,
    eta: delivery.eta,
    requestNote: delivery.requestNote,
    requestNoteEditable: !NOTE_LOCKED_STATUSES.has(delivery.status),
    driverLastName: driver ? lastName(driver.name) : null,
    driverAvatar: driver ? driverAvatarEmoji(driver.id) : null,
    receiptMethod: delivery.receiptMethod,
    proofOfDeliveryPhotoUrl: delivery.proofOfDeliveryPhotoUrl,
    deliveredAt: delivery.deliveredAt,
    statusTimestamps: {
      intakeAt: delivery.intakeAt,
      pickupAt: delivery.pickupAt,
      lineHaulLoadedAt: delivery.lineHaulLoadedAt,
      arrivedAtCampAt: delivery.arrivedAtCampAt,
      outForDeliveryAt: delivery.outForDeliveryAt,
      deliveredAt: delivery.deliveredAt,
    },
  };
}

export function toDriverDeliveryView(delivery: Delivery, deliveryOrder: number | null = null): DriverDeliveryView {
  return {
    id: delivery.id,
    trackingNumber: delivery.trackingNumber,
    productName: delivery.productName,
    address: delivery.address,
    requestNote: delivery.requestNote,
    status: delivery.status,
    isRedeliveryTarget: delivery.isRedeliveryTarget,
    deliveryOrder,
    eta: delivery.eta,
  };
}

export function toAdminDeliveryView(
  delivery: Delivery,
  meta: { lastStatusChangeAt?: string | null; outcomeAt?: string | null; isDelayed?: boolean } = {}
): AdminDeliveryView {
  return {
    id: delivery.id,
    trackingNumber: delivery.trackingNumber,
    productName: delivery.productName,
    address: delivery.address,
    campId: delivery.campId,
    driverId: delivery.driverId,
    status: delivery.status,
    isRedeliveryTarget: delivery.isRedeliveryTarget,
    failureReason: delivery.failureReason,
    failureMemo: delivery.failureMemo,
    lastStatusChangeAt: meta.lastStatusChangeAt ?? null,
    outcomeAt: meta.outcomeAt ?? null,
    isDelayed: meta.isDelayed ?? false,
    eta: delivery.eta,
    deliveredAt: delivery.deliveredAt,
    createdAt: delivery.createdAt,
  };
}
