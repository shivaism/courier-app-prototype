// Geo helper functions for the mock-coordinate delivery location simulation (optional extension,
// requirements.md Section 3.5 / constraints.md: "mock-coordinate-based real-time movement" using
// no real GPS hardware and no paid/key-issuance map API).

export interface LatLng {
  lat: number;
  lng: number;
}

// Simple deterministic string hash (djb2-style) — used so the same tracking number always
// derives the same simulated destination/route without needing to persist extra columns.
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Deterministically derives a plausible "delivery address" point a few km from the camp,
 * based on the tracking number. This stands in for real geocoding (out of scope per
 * constraints.md — no address validation / geocoding API integration).
 */
export function deriveDestination(origin: LatLng, trackingNumber: string): LatLng {
  const hash = hashString(trackingNumber);
  const angleDegrees = hash % 360;
  const angle = (angleDegrees * Math.PI) / 180;
  const distanceKm = 1.5 + ((hash >>> 8) % 30) / 10; // 1.5km - 4.4km from camp

  const deltaLat = (distanceKm / 111) * Math.cos(angle);
  const deltaLng = (distanceKm / (111 * Math.cos((origin.lat * Math.PI) / 180))) * Math.sin(angle);

  return { lat: origin.lat + deltaLat, lng: origin.lng + deltaLng };
}

// Public, free, no-API-key road-routing service (OSRM's demo server) — used to snap the
// mock camp->destination trip onto real streets so the simulated vehicle follows actual
// roads instead of a straight/synthetic line. This is still NOT real GPS tracking (no
// hardware, no live vehicle data) — it's a routing lookup for two already-mocked points,
// consistent with constraints.md's allowance for mock-coordinate-based movement.
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TIMEOUT_MS = 4000;

export async function fetchRoadRoute(origin: LatLng, destination: LatLng): Promise<LatLng[] | null> {
  const url = `${OSRM_BASE_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
    };
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    // GeoJSON coordinates are [lng, lat] — flip to our {lat, lng} convention.
    return coordinates.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    // Network failure, timeout, or malformed response — caller falls back to the
    // synthetic street-grid route below so the demo still works offline.
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * FALLBACK ONLY (used when fetchRoadRoute can't reach the routing service, e.g. no network).
 * Derives a "street grid" style route between origin and destination: a sequence of
 * waypoints that move along one axis (lat OR lng) at a time, turning at each waypoint —
 * mimicking a vehicle following city blocks/streets rather than a straight/curved line
 * through open space. Deterministic per tracking number.
 */
export function deriveStreetRoute(origin: LatLng, destination: LatLng, trackingNumber: string): LatLng[] {
  const hash = hashString(trackingNumber);
  const numSegments = 4 + (hash % 3); // 4-6 turns, feels like a real short city route

  const waypoints: LatLng[] = [{ ...origin }];
  let current = { ...origin };
  let remainingLat = destination.lat - origin.lat;
  let remainingLng = destination.lng - origin.lng;

  for (let i = 0; i < numSegments; i++) {
    const isLast = i === numSegments - 1;
    // Alternate movement axis so the path looks like turning from one street onto another,
    // rather than moving diagonally. Use unsigned right-shift (>>>) — hash can exceed 2^31,
    // and a signed shift (>>) would produce negative numbers here, corrupting the axis
    // choice and the fraction below.
    const moveOnLatAxis = (hash >>> i) % 2 === 0;
    const fraction = isLast ? 1 : 0.3 + ((hash >>> (i * 3)) % 40) / 100; // 0.3 - 0.7 of what's left

    if (moveOnLatAxis) {
      const moveLat = remainingLat * fraction;
      current = { lat: current.lat + moveLat, lng: current.lng };
      remainingLat -= moveLat;
    } else {
      const moveLng = remainingLng * fraction;
      current = { lat: current.lat, lng: current.lng + moveLng };
      remainingLng -= moveLng;
    }
    waypoints.push({ ...current });
  }

  // Snap the final waypoint exactly onto the destination (removes any residual drift
  // from the alternating-axis approach above).
  waypoints[waypoints.length - 1] = { ...destination };
  return waypoints;
}

function planarDistance(a: LatLng, b: LatLng): number {
  return Math.sqrt((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2);
}

/**
 * Given a multi-segment waypoint path and a progress fraction (0-1) of the *total path
 * length* (not per-segment), returns the interpolated position and the heading of the
 * segment currently being traveled (so a vehicle icon can snap to face each new street
 * as it turns a corner, rather than smoothly rotating through open space).
 */
export function positionAlongPath(
  waypoints: LatLng[],
  t: number
): { position: LatLng; heading: number; segmentIndex: number } {
  const clampedT = Math.min(1, Math.max(0, t));

  const segmentLengths: number[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    segmentLengths.push(planarDistance(waypoints[i], waypoints[i + 1]));
  }
  const totalLength = segmentLengths.reduce((sum, len) => sum + len, 0);
  const targetDistance = clampedT * totalLength;

  let accumulated = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    const isLastSegment = i === segmentLengths.length - 1;

    if (accumulated + segmentLength >= targetDistance || isLastSegment) {
      const segmentT = segmentLength > 0 ? (targetDistance - accumulated) / segmentLength : 1;
      const clampedSegmentT = Math.min(1, Math.max(0, segmentT));
      const from = waypoints[i];
      const to = waypoints[i + 1];

      const position: LatLng = {
        lat: from.lat + (to.lat - from.lat) * clampedSegmentT,
        lng: from.lng + (to.lng - from.lng) * clampedSegmentT,
      };

      return { position, heading: bearingBetween(from, to), segmentIndex: i };
    }
    accumulated += segmentLength;
  }

  // Fallback (t >= 1 or a degenerate single-point path): sit at the final waypoint.
  const last = waypoints[waypoints.length - 1];
  const secondLast = waypoints[waypoints.length - 2] ?? last;
  return {
    position: last,
    heading: bearingBetween(secondLast, last),
    segmentIndex: Math.max(0, waypoints.length - 2),
  };
}

export function bearingBetween(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
