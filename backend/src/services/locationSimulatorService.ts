// Location Simulator (optional extension component, requirements.md Section 3.5 / 3.4.1).
// Interpolates a mock delivery-vehicle position while a delivery is "out_for_delivery" and
// pushes updates over the existing SSE channel via the shared event bus (BR-10).
//
// Route source, in priority order:
//   1. A real road-snapped route from the public no-API-key OSRM routing service, so the
//      vehicle follows actual streets (see utils/geo.ts fetchRoadRoute).
//   2. A deterministic synthetic "street grid" fallback when routing is unreachable, so the
//      demo still works offline (see utils/geo.ts deriveStreetRoute).
//
// Per constraints.md: this uses NO real GPS hardware and NO paid/key-issuance map API. Both
// the origin camp coordinates and the derived destination are mock data standing in for a
// geocoded recipient address, so no real delivery address is sent to any third party.
//
// A failed delivery stops simulation; reassigning it (a fresh re-delivery attempt) republishes
// a statusChanged event, which restarts simulation with a new attempt timestamp and ETA.

import type Database from "better-sqlite3";
import { eventBus } from "../events/eventBus.js";
import { deriveDestination, deriveStreetRoute, fetchRoadRoute, positionAlongPath, type LatLng } from "../utils/geo.js";
import type { Delivery, DomainEvent } from "../domain/types.js";

const TICK_INTERVAL_MS = 1200;

interface SimulatedRoute {
  trackingNumber: string;
  driverId: number | null;
  waypoints: LatLng[];
  startedAtMs: number;
  etaMs: number;
}

export interface LocationSnapshot {
  position: LatLng;
  heading: number;
  progress: number;
  segmentIndex: number;
  etaRemainingSeconds: number;
  route: { waypoints: LatLng[] };
}

export class LocationSimulatorService {
  private routes: Map<number, SimulatedRoute> = new Map(); // keyed by delivery id
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private db: Database.Database) {}

  start(): void {
    if (this.timer) return;

    // React to status changes: start simulating on out_for_delivery, stop on delivered/failed.
    eventBus.on("domainEvent", (event: DomainEvent<any>) => {
      if (event.eventType === "statusChanged") {
        const status = event.payload?.status;
        if (status === "out_for_delivery") {
          this.startSimulating(event.trackingNumber);
        } else if (status === "delivered") {
          this.stopSimulating(event.trackingNumber);
        }
      } else if (event.eventType === "deliveryFailed") {
        this.stopSimulating(event.trackingNumber);
      }
    });

    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);

    // Pick up any deliveries that were already out_for_delivery before this process started
    // (e.g., after a restart), so the map isn't empty until the next status change.
    this.resumeInFlightDeliveries();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resumeInFlightDeliveries(): void {
    const rows = this.db.prepare(`SELECT * FROM deliveries WHERE status = 'out_for_delivery'`).all();
    for (const row of rows as any[]) {
      void this.beginRouteForDelivery(this.toDelivery(row));
    }
  }

  private startSimulating(trackingNumber: string): void {
    const row = this.db.prepare(`SELECT * FROM deliveries WHERE trackingNumber = ?`).get(trackingNumber);
    if (!row) return;
    void this.beginRouteForDelivery(this.toDelivery(row as any));
  }

  private async beginRouteForDelivery(delivery: Delivery): Promise<void> {
    if (!delivery.outForDeliveryAt || !delivery.eta) return;

    const camp = this.db.prepare(`SELECT * FROM camps WHERE id = ?`).get(delivery.campId) as
      | { latitude: number; longitude: number }
      | undefined;
    if (!camp) return;

    const origin: LatLng = { lat: camp.latitude, lng: camp.longitude };
    const destination = deriveDestination(origin, delivery.trackingNumber);

    // Prefer a real road-snapped route (OSRM); fall back to the synthetic street-grid
    // route if the routing service is unreachable, so the demo keeps working offline.
    const roadWaypoints = await fetchRoadRoute(origin, destination);
    const waypoints = roadWaypoints ?? deriveStreetRoute(origin, destination, delivery.trackingNumber);

    // Guard against the delivery having moved on (delivered/failed) while we were
    // awaiting the routing request.
    const current = this.db.prepare(`SELECT status FROM deliveries WHERE id = ?`).get(delivery.id) as
      | { status: string }
      | undefined;
    if (!current || current.status !== "out_for_delivery") return;

    this.routes.set(delivery.id, {
      trackingNumber: delivery.trackingNumber,
      driverId: delivery.driverId,
      waypoints,
      startedAtMs: new Date(delivery.outForDeliveryAt).getTime(),
      etaMs: new Date(delivery.eta).getTime(),
    });
  }

  private stopSimulating(trackingNumber: string): void {
    for (const [deliveryId, route] of this.routes.entries()) {
      if (route.trackingNumber === trackingNumber) {
        this.routes.delete(deliveryId);
      }
    }
  }

  /**
   * Returns a current snapshot for a tracking number, or null if that delivery isn't
   * currently being simulated (not out_for_delivery, or unknown). Used so the customer map
   * can render an initial position/route immediately on load rather than waiting for the
   * next simulator tick.
   */
  getSnapshot(trackingNumber: string): LocationSnapshot | null {
    const route = [...this.routes.values()].find((r) => r.trackingNumber === trackingNumber);
    if (!route) return null;
    return this.computeSnapshot(route);
  }

  private computeSnapshot(route: SimulatedRoute): LocationSnapshot {
    const now = Date.now();
    const totalMs = route.etaMs - route.startedAtMs;
    const elapsedMs = now - route.startedAtMs;
    // Clamp just short of 1 so the marker doesn't visually sit exactly on the destination
    // before the driver has actually marked it delivered.
    const t = totalMs > 0 ? Math.min(0.97, Math.max(0, elapsedMs / totalMs)) : 0.97;

    const { position, heading, segmentIndex } = positionAlongPath(route.waypoints, t);
    const remainingMs = Math.max(0, route.etaMs - now);

    return {
      position,
      heading,
      progress: t,
      segmentIndex,
      etaRemainingSeconds: Math.round(remainingMs / 1000),
      route: { waypoints: route.waypoints },
    };
  }

  private tick(): void {
    for (const route of this.routes.values()) {
      const snapshot = this.computeSnapshot(route);

      eventBus.publish({
        eventType: "locationUpdated",
        trackingNumber: route.trackingNumber,
        driverId: route.driverId,
        payload: snapshot,
      });
    }
  }

  private toDelivery(row: any): Delivery {
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
}
