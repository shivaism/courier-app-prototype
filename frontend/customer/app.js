// Customer App — implements CUST-1 (lookup), CUST-2 (real-time timeline via SSE),
// CUST-3 (request note), CUST-4 (recent-lookups history via localStorage).

const API_BASE = "/api";
const HISTORY_STORAGE_KEY = "deliveryTracker.recentLookups";

const STAGE_ORDER = [
  { key: "intake", label: "Parcel received", timestampField: "intakeAt" },
  { key: "pickup", label: "Collected from sender", timestampField: "pickupAt" },
  { key: "line_haul_loaded", label: "In transit between hubs", timestampField: "lineHaulLoadedAt" },
  { key: "arrived_at_camp", label: "Arrived at local hub", timestampField: "arrivedAtCampAt" },
  { key: "out_for_delivery", label: "Out for delivery", timestampField: "outForDeliveryAt" },
  { key: "delivered", label: "Delivered", timestampField: "deliveredAt" },
];

// Human-facing status wording for the hero headline.
const STATUS_TEXT = {
  intake: "Parcel received",
  pickup: "Collected",
  line_haul_loaded: "In transit",
  arrived_at_camp: "At local hub",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Delivery attempt failed",
};

const el = {
  lookupForm: document.getElementById("lookup-form"),
  trackingInput: document.getElementById("tracking-number-input"),
  lookupError: document.getElementById("lookup-error"),
  resultSection: document.getElementById("result-section"),
  statusBadge: document.getElementById("status-badge"),
  trackingDisplay: document.getElementById("tracking-number-display"),
  productName: document.getElementById("product-name"),
  address: document.getElementById("delivery-address"),
  eta: document.getElementById("delivery-eta"),
  driverName: document.getElementById("driver-name"),
  driverTile: document.getElementById("driver-tile"),
  heroEta: document.getElementById("hero-eta"),
  etaCountdownLabel: document.getElementById("eta-countdown-label"),
  etaCountdownDetail: document.getElementById("eta-countdown-detail"),
  timeline: document.getElementById("timeline"),
  completionPanel: document.getElementById("completion-panel"),
  completionTime: document.getElementById("completion-time"),
  receiptMethod: document.getElementById("receipt-method"),
  podPhoto: document.getElementById("pod-photo"),
  noteForm: document.getElementById("note-form"),
  noteSelect: document.getElementById("note-select"),
  noteTextarea: document.getElementById("note-textarea"),
  noteFeedback: document.getElementById("note-feedback"),
  noteReadonlyView: document.getElementById("note-readonly-view"),
  noteReadonlyText: document.getElementById("note-readonly-text"),
  inquiryForm: document.getElementById("inquiry-form"),
  inquiryMessage: document.getElementById("inquiry-message"),
  inquiryFeedback: document.getElementById("inquiry-feedback"),
  lookupLoading: document.getElementById("lookup-loading"),
  lookupButton: document.querySelector('#lookup-form button[type="submit"]'),
  connectionStatus: document.getElementById("connection-status"),
  liveRegion: document.getElementById("delivery-live-region"),
  historyList: document.getElementById("history-list"),
  historyEmptyMessage: document.getElementById("history-empty-message"),
};

let currentEventSource = null;
let currentTrackingNumber = null;
let map = null;
let vehicleMarker = null;
let routeLine = null;
let routeGlow = null;
let originMarker = null;
let destinationMarker = null;
let etaCountdownTimer = null;
let etaTargetMs = null;
// Terminal states (delivered/failed) pin a STATIC value into the hero ETA slot. A location
// snapshot still in flight when the parcel completes must not resurrect the ticking
// countdown and overwrite "Delivered at …", so terminal rendering latches this flag.
let heroEtaLocked = false;
let hasCenteredOnVehicle = false;
let isFollowingVehicle = false;
let lastHeading = 0; // accumulated rotation in degrees, not clamped to 0-360 (see shortestRotation)
// Monotonic lookup token: guards against a slow/failed earlier lookup applying its results
// (or its SSE events) after the user has already started tracking a different delivery.
let lookupGeneration = 0;
let lastAnnouncedStatus = null;

const mapEl = {
  section: document.getElementById("live-map-section"),
  canvas: document.getElementById("live-map-canvas"),
  progress: document.getElementById("live-map-progress"),
  fallback: document.getElementById("live-map-fallback"),
  etaCountdown: document.getElementById("live-map-eta-countdown"),
  progressFill: document.getElementById("live-map-progress-fill"),
  driverAvatar: document.getElementById("live-map-driver-avatar"),
  driverName: document.getElementById("live-map-driver-name"),
  driverSub: document.getElementById("live-map-driver-sub"),
  productName: document.getElementById("live-map-product-name"),
  adCard: document.getElementById("live-map-ad-card"),
};

// Ticket marketplace link for the explicitly-labeled "Sponsored" ad card. This is a generic
// placeholder search URL, not tied to any specific real performer, to avoid implying an
// endorsement or using anyone's real identity/likeness.
const AD_TICKET_URL = "https://www.ticketmaster.com/search?q=kpop%20concert";
mapEl.adCard.href = AD_TICKET_URL;

// --- CUST-4: Recent lookups (localStorage) ---

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function recordLookup(trackingNumber, status) {
  const history = getHistory().filter((h) => h.trackingNumber !== trackingNumber);
  history.unshift({ trackingNumber, status, lookedUpAt: new Date().toISOString(), stale: false });
  saveHistory(history.slice(0, 20)); // cap history length
  renderHistory();
}

/**
 * Refreshes the stored status of each recent lookup on page load so returning visitors do
 * not see a delivery still labelled "In progress" after it has already completed. Entries
 * are preserved (and marked last-known) if the refresh fails, so local history is never
 * lost because of a transient network problem.
 */
async function refreshRecentLookupStatuses() {
  const history = getHistory();
  if (history.length === 0) return;

  const refreshed = await Promise.all(
    history.map(async (item) => {
      try {
        const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(item.trackingNumber)}`);
        if (res.status === 404) return { ...item, missing: true, stale: false };
        if (!res.ok) return { ...item, stale: true };
        const delivery = await res.json();
        return { ...item, status: delivery.status, stale: false, missing: false };
      } catch {
        return { ...item, stale: true };
      }
    })
  );

  saveHistory(refreshed);
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  el.historyList.innerHTML = "";
  el.historyEmptyMessage.hidden = history.length > 0;

  for (const item of history) {
    const li = document.createElement("li");

    // Rendered as a <button> so it is reachable and activatable by keyboard and announced
    // as an interactive control by assistive technology.
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item-button";
    button.dataset.testid = `recent-lookup-item-${item.trackingNumber}`;

    const label = document.createElement("span");
    label.textContent = item.trackingNumber;

    const badge = document.createElement("span");
    const isCompleted = item.status === "delivered" || item.status === "failed";
    const badgeText = item.missing
      ? "Not found"
      : isCompleted
        ? item.status === "failed"
          ? "Delivery failed"
          : "Delivered"
        : "In progress";
    badge.className = `history-badge ${isCompleted ? "completed" : ""} ${item.stale ? "stale" : ""}`.trim();
    badge.textContent = item.stale ? `${badgeText} (last known)` : badgeText;

    button.append(label, badge);
    button.setAttribute("aria-label", `Track ${item.trackingNumber} — ${badge.textContent}`);
    button.addEventListener("click", () => {
      el.trackingInput.value = item.trackingNumber;
      performLookup(item.trackingNumber);
    });

    li.appendChild(button);
    el.historyList.appendChild(li);
  }
}

// --- CUST-1: Lookup ---

el.lookupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const trackingNumber = el.trackingInput.value.trim();
  if (!trackingNumber) return;
  performLookup(trackingNumber);
});

async function performLookup(trackingNumber) {
  hideError();
  // Close any previous stream before the request starts, so a failed or slow new lookup can
  // never leave the previous delivery's events driving the UI.
  closeEventStream();
  resetMapForNewLookup();
  setConnectionState("idle");

  const generation = ++lookupGeneration;
  setLookupBusy(true);

  try {
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}`);
    if (generation !== lookupGeneration) return; // superseded by a newer lookup

    if (res.status === 404) {
      showError("Tracking number not found. Please check and try again.");
      el.resultSection.hidden = true;
      return;
    }
    if (!res.ok) {
      showError("Something went wrong looking up your delivery. Please try again.");
      return;
    }
    const delivery = await res.json();
    if (generation !== lookupGeneration) return;

    currentTrackingNumber = delivery.trackingNumber;
    lastAnnouncedStatus = null;
    renderDelivery(delivery);
    recordLookup(delivery.trackingNumber, delivery.status);
    await refreshMapSnapshot(delivery.trackingNumber, generation);
    if (generation !== lookupGeneration) return;
    subscribeToUpdates(delivery.trackingNumber, generation);
  } catch (error) {
    if (generation === lookupGeneration) {
      // fetch() rejects with TypeError only for genuine transport failures. Anything else
      // (e.g. a bug thrown while rendering) must NOT be reported as a connection problem —
      // that sends users off checking their wifi for a fault that is entirely ours. Always
      // surface the real error to the console so the cause is diagnosable.
      console.error("Delivery lookup failed:", error);
      showError(
        error instanceof TypeError
          ? "Network error — please check your connection and try again."
          : "Something went wrong displaying your delivery. Please try again."
      );
    }
  } finally {
    if (generation === lookupGeneration) setLookupBusy(false);
  }
}

function setLookupBusy(busy) {
  el.lookupLoading.hidden = !busy;
  if (el.lookupButton) el.lookupButton.disabled = busy;
}

function setConnectionState(state) {
  el.connectionStatus.dataset.state = state;
  el.connectionStatus.textContent =
    state === "live" ? "Live" : state === "reconnecting" ? "Reconnecting…" : state === "offline" ? "Offline" : "";
}

function announce(message) {
  el.liveRegion.textContent = message;
}

function showError(message) {
  el.lookupError.textContent = message;
  el.lookupError.hidden = false;
}

function hideError() {
  el.lookupError.hidden = true;
}

// --- Rendering ---

function renderDelivery(delivery) {
  el.resultSection.hidden = false;
  el.statusBadge.textContent = STATUS_TEXT[delivery.status] || delivery.status.replace(/_/g, " ");
  el.statusBadge.dataset.status = delivery.status;
  el.trackingDisplay.textContent = delivery.trackingNumber;
  el.productName.textContent = delivery.productName;
  el.address.textContent = delivery.address;
  el.eta.textContent = delivery.eta ? new Date(delivery.eta).toLocaleString() : "Not yet available";

  renderHeroEta(delivery);

  // The courier tile is shown/hidden as a whole so the tile grid never leaves a gap.
  if (delivery.driverLastName) {
    el.driverTile.hidden = false;
    el.driverName.textContent = delivery.driverLastName;
  } else {
    el.driverTile.hidden = true;
  }

  renderTimeline(delivery);
  updateDriverCard(delivery);

  // Announce meaningful status transitions once (WCAG 4.1.3) without stealing focus.
  if (delivery.status !== lastAnnouncedStatus) {
    lastAnnouncedStatus = delivery.status;
    announce(`Delivery ${delivery.trackingNumber} status: ${delivery.status.replace(/_/g, " ")}`);
  }

  if (delivery.status === "delivered") {
    el.completionPanel.hidden = false;
    el.completionTime.textContent = delivery.deliveredAt
      ? new Date(delivery.deliveredAt).toLocaleString()
      : "";
    el.receiptMethod.textContent = (delivery.receiptMethod || "").replace(/_/g, " ");
    if (delivery.proofOfDeliveryPhotoUrl) {
      el.podPhoto.src = delivery.proofOfDeliveryPhotoUrl;
      el.podPhoto.hidden = false;
    } else {
      el.podPhoto.hidden = true;
    }
  } else {
    el.completionPanel.hidden = true;
  }

  // CUST-3: note editability — show ONLY the editable form while the note can still be
  // changed, and ONLY the read-only view once it's locked (out for delivery or later).
  // Previously the form was always shown but disabled, which could look like a UI bug
  // (dropdown/textarea visible but unresponsive) rather than a clear "this is now locked"
  // state — showing/hiding the two views entirely avoids that false impression.
  const editable = delivery.requestNoteEditable;

  if (editable) {
    el.noteForm.hidden = false;
    el.noteReadonlyView.hidden = true;
    el.noteTextarea.value = delivery.requestNote || "";
    el.noteSelect.value = "";
    el.noteFeedback.hidden = true;
    el.noteForm.dataset.trackingNumber = delivery.trackingNumber;
  } else {
    el.noteForm.hidden = true;
    el.noteReadonlyView.hidden = false;
    el.noteReadonlyText.textContent = delivery.requestNote
      ? delivery.requestNote
      : "No delivery instructions were left for this order.";
  }
}

function renderTimeline(delivery) {
  el.timeline.innerHTML = "";
  const isFailed = delivery.status === "failed";

  // "failed" is a side-branch, not a stage in STAGE_ORDER. For failed deliveries, derive the
  // last stage actually reached from its recorded timestamps so completed progress still
  // renders correctly instead of collapsing to "nothing completed".
  let currentIndex;
  if (isFailed) {
    currentIndex = -1;
    STAGE_ORDER.forEach((stage, index) => {
      if (delivery.statusTimestamps?.[stage.timestampField]) currentIndex = index;
    });
  } else {
    currentIndex = STAGE_ORDER.findIndex((s) => s.key === delivery.status);
  }

  STAGE_ORDER.forEach((stage, index) => {
    const li = document.createElement("li");
    li.dataset.testid = `timeline-stage-${stage.key}`;

    const isCompleted = index < currentIndex || (index === currentIndex && !isFailed);
    const isCurrent = index === currentIndex && !isFailed;

    if (isCompleted || (isFailed && index <= currentIndex)) li.classList.add("completed");
    if (isCurrent) li.classList.add("current");

    const label = document.createElement("span");
    label.textContent = stage.label;
    li.appendChild(label);

    const timestamp = delivery.statusTimestamps?.[stage.timestampField];
    if (timestamp) {
      const time = document.createElement("span");
      time.className = "stage-time";
      time.textContent = new Date(timestamp).toLocaleString();
      li.appendChild(time);
    }

    el.timeline.appendChild(li);
  });

  if (delivery.status === "failed") {
    const li = document.createElement("li");
    li.classList.add("current", "timeline-failed");
    li.dataset.testid = "timeline-stage-failed";
    const label = document.createElement("span");
    label.textContent = "Delivery attempt failed";
    const note = document.createElement("span");
    note.className = "stage-time";
    note.textContent = "A re-delivery will be scheduled";
    li.append(label, note);
    el.timeline.appendChild(li);
  }
}

// --- Optional extension: inline live tracking map (Uber-Eats-style) ---
// Shown automatically on the tracking page as soon as a delivery is "out for delivery" —
// no button click required. Mock-coordinate simulation only (no real GPS, no paid map API)
// — Leaflet + CARTO's no-API-key "Voyager" tile set, styled to feel Google-Maps-like (clean,
// light, legible). The vehicle moves along a deterministic "street grid" route (turns at
// corners between ticks) rather than a smooth curve through open space, so it reads as
// moving from one street onto another.

// Dark basemap (CARTO "dark_all", still no API key) so the map integrates with the dark
// theme instead of glaring against it, and the route/vehicle read as the brightest elements.
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

let latestSnapshot = null;

function showLiveMapSection() {
  if (!mapEl.section.hidden) return; // already visible, nothing to do
  mapEl.section.hidden = false;
  hasCenteredOnVehicle = false;
  ensureMap();
  // Leaflet needs a layout pass before it can correctly size itself in a freshly-unhidden container.
  setTimeout(() => map && map.invalidateSize(), 50);
}

function ensureMap() {
  if (map) return map;

  map = L.map(mapEl.canvas, {
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    subdomains: "abcd",
  }).addTo(map);

  // If the user manually drags the map, stop auto-following the vehicle so we don't
  // fight their interaction. Re-tapping the vehicle marker resumes following.
  map.on("dragstart", () => {
    isFollowingVehicle = false;
  });

  return map;
}

// Custom SVG car icon, drawn pointing due "up" (north / 0 degrees) by default. Using our
// own SVG (rather than a font emoji like 🏎️) guarantees we know its exact default facing
// direction, so rotating it to match the direction of travel never ends up looking reversed.
const CAR_SVG = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="carBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c7d2fe"/>
      <stop offset="0.5" stop-color="#818cf8"/>
      <stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <g>
    <ellipse cx="12" cy="11" rx="8.5" ry="10.5" fill="#6366f1" opacity="0.22"/>
    <rect x="6.6" y="2" width="10.8" height="16.4" rx="3.6" fill="url(#carBody)" stroke="#1e1b4b" stroke-width="0.7"/>
    <rect x="8" y="4.1" width="8" height="4.6" rx="1.5" fill="#0b1120" opacity="0.82"/>
    <rect x="8.4" y="10.4" width="7.2" height="3.4" rx="1.2" fill="#0b1120" opacity="0.5"/>
    <circle cx="8.4" cy="3.5" r="1.15" fill="#fef9c3"/>
    <circle cx="15.6" cy="3.5" r="1.15" fill="#fef9c3"/>
    <rect x="6" y="15.4" width="12" height="2.4" rx="1.1" fill="#0f172a"/>
    <circle cx="8.4" cy="18.1" r="1.5" fill="#0f172a"/>
    <circle cx="15.6" cy="18.1" r="1.5" fill="#0f172a"/>
    <polygon points="12,0.2 9.7,3 14.3,3" fill="#a5b4fc"/>
  </g>
</svg>`;

function buildVehicleIcon() {
  return L.divIcon({
    className: "vehicle-icon-wrapper",
    html: `<div class="vehicle-inner">${CAR_SVG}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/**
 * Returns a new rotation value, expressed as `previousAccumulated + delta`, that takes the
 * SHORTEST angular path from the previous heading to the new target heading (e.g., turning
 * from 350deg to 10deg should rotate +20deg forward, not -340deg backward). Without this,
 * a CSS transition across a 0/360-degree wraparound would spin the car almost all the way
 * around, which visually reads as the car "reversing" direction for a moment.
 */
function shortestRotation(previousAccumulated, targetHeading) {
  const normalizedPrevious = ((previousAccumulated % 360) + 360) % 360;
  let delta = ((targetHeading - normalizedPrevious + 540) % 360) - 180;
  return previousAccumulated + delta;
}

// Rotates the already-mounted marker's inner element in place. Deliberately NOT using
// Leaflet's marker.setIcon() here — that destroys and recreates the marker's DOM element
// on every call, which would reset (and visually break) the CSS position/rotation
// transitions that make the car glide and turn smoothly instead of snapping/jumping.
function setVehicleHeading(headingDegrees) {
  if (!vehicleMarker) return;
  const iconEl = vehicleMarker.getElement();
  const innerEl = iconEl?.querySelector(".vehicle-inner");
  if (innerEl) {
    innerEl.style.transform = `rotate(${headingDegrees}deg)`;
  }
}

function renderRoute(snapshot) {
  latestSnapshot = snapshot;
  showLiveMapSection();

  updateEtaAndProgress(snapshot);
  ensureMap();

  const waypoints = snapshot.route.waypoints;
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const vehicleLatLng = [snapshot.position.lat, snapshot.position.lng];

  if (!routeLine) {
    const linePoints = waypoints.map((p) => [p.lat, p.lng]);

    // Two stacked polylines: a soft wide "glow" beneath a bright core, so the route reads
    // clearly as the focal element on the dark basemap.
    routeGlow = L.polyline(linePoints, {
      color: "#6366f1",
      weight: 13,
      opacity: 0.2,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(map);

    routeLine = L.polyline(linePoints, {
      color: "#a5b4fc",
      weight: 4,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    originMarker = L.circleMarker([origin.lat, origin.lng], {
      radius: 6,
      color: "#ffffff",
      fillColor: "#10b981",
      fillOpacity: 1,
      weight: 2,
    })
      .addTo(map)
      .bindPopup("Departure hub");

    destinationMarker = L.circleMarker([destination.lat, destination.lng], {
      radius: 6,
      color: "#ffffff",
      fillColor: "#f43f5e",
      fillOpacity: 1,
      weight: 2,
    })
      .addTo(map)
      .bindPopup("Your delivery address");
  }

  if (!vehicleMarker) {
    vehicleMarker = L.marker(vehicleLatLng, { icon: buildVehicleIcon() })
      .addTo(map)
      .bindPopup("Your delivery is on the way")
      .on("click", () => {
        isFollowingVehicle = true;
        map.panTo(vehicleMarker.getLatLng(), { animate: true });
      });
    // Set initial heading once the marker's DOM element exists.
    setTimeout(() => setVehicleHeading(snapshot.heading), 0);
    lastHeading = snapshot.heading;
  } else {
    // setLatLng triggers Leaflet's internal transform update on the marker's existing DOM
    // element; combined with the CSS transition on .vehicle-icon-wrapper (styles.css), this
    // is what makes the car glide between ticks instead of jumping. We deliberately do NOT
    // call setIcon() here (see buildVehicleIcon's comment) so the glide isn't reset.
    vehicleMarker.setLatLng(vehicleLatLng);
    setVehicleHeading(shortestRotation(lastHeading, snapshot.heading));
    lastHeading = snapshot.heading;
  }

  if (!hasCenteredOnVehicle) {
    // Initial view: fit the whole route so the user sees the full journey at a glance.
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    hasCenteredOnVehicle = true;
    isFollowingVehicle = true;
  } else if (isFollowingVehicle) {
    // Uber-Eats-style camera follow: keep the vehicle in view as it moves, unless the
    // user has manually dragged/zoomed the map (see the 'dragstart'/'zoomstart' listeners
    // below, which turn following off so we don't fight the user's own map interaction).
    map.panTo(vehicleLatLng, { animate: true, duration: 1.0 });
  }
}

function updateEtaAndProgress(snapshot) {
  // Location snapshots give the most precise remaining time (server-computed), so they
  // take priority over the coarser delivery.eta-derived target set by setEtaCountdownTarget.
  setEtaCountdownTarget(Date.now() + snapshot.etaRemainingSeconds * 1000);
  const progressPercent = Math.round(snapshot.progress * 100);
  mapEl.progressFill.style.width = `${progressPercent}%`;
  mapEl.progress?.setAttribute("aria-valuenow", String(progressPercent));
  mapEl.progress?.setAttribute("aria-valuetext", `${progressPercent}% of the route complete`);
}

/**
 * Drives the persistent ETA countdown shown on BOTH the delivery detail page and the live
 * map (single shared timer/state so they never disagree). Called as soon as we know a
 * delivery's `eta` from the main lookup response — it does not wait for the first location
 * simulator tick, so the countdown is visible immediately once a delivery is "out for
 * delivery," even before the map/route data has loaded.
 */
function setEtaCountdownTarget(targetMs) {
  // A parcel that has already completed keeps its static outcome text (see heroEtaLocked).
  if (heroEtaLocked) return;
  etaTargetMs = targetMs;
  el.heroEta.dataset.state = "transit";
  el.etaCountdownLabel.textContent = "Arriving in";
  el.etaCountdownLabel.hidden = false;
  el.etaCountdownDetail.hidden = false;
  tickEtaCountdown();
}

/**
 * Decides what the hero's headline slot should say for the delivery's current state. The
 * slot is the most prominent number on the page, so it must always carry the single most
 * useful fact: a live countdown in transit, the actual delivery time once delivered, and
 * the next step after a failed attempt — never an empty "Arriving in" with no value.
 */
function renderHeroEta(delivery) {
  if (delivery.status === "delivered") {
    pinHeroEta("delivered", "Delivered at", formatDeliveredAt(delivery.deliveredAt));
    return;
  }

  if (delivery.status === "failed") {
    pinHeroEta("failed", "Next step", "Re-delivery");
    return;
  }

  // Non-terminal: release the latch so live snapshots can drive the countdown again.
  heroEtaLocked = false;

  if (delivery.eta) {
    setEtaCountdownTarget(new Date(delivery.eta).getTime());
  } else {
    hideEtaCountdown();
  }
}

/**
 * Shows a fixed (non-ticking) value in the hero slot and stops the countdown so nothing can
 * overwrite it a second later.
 */
function pinHeroEta(state, labelText, valueText) {
  stopEtaCountdown();
  heroEtaLocked = true;
  el.heroEta.dataset.state = state;
  el.etaCountdownLabel.textContent = labelText;
  el.etaCountdownDetail.textContent = valueText;
  el.etaCountdownLabel.hidden = false;
  el.etaCountdownDetail.hidden = false;
}

/**
 * Halts the countdown without hiding the slot. Clearing etaTargetMs matters as much as
 * clearing the interval: tickEtaCountdown's render closure bails on a null target, so any
 * already-queued tick can't repaint over pinned text.
 */
function stopEtaCountdown() {
  etaTargetMs = null;
  if (etaCountdownTimer) {
    clearInterval(etaCountdownTimer);
    etaCountdownTimer = null;
  }
}

/**
 * Delivery time for the hero slot: just the clock time when it happened today (the common
 * case), with a short date prepended otherwise so "2:41 PM" is never ambiguous.
 */
function formatDeliveredAt(deliveredAt) {
  if (!deliveredAt) return "Confirmed";
  const when = new Date(deliveredAt);
  if (Number.isNaN(when.getTime())) return "Confirmed";

  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (when.toDateString() === new Date().toDateString()) return time;

  const date = when.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

/**
 * Time-state language (FR-B2). The ETA is a fixed estimate, not a live recalculation, so
 * once it elapses the UI must say so honestly instead of sitting at "0s" indefinitely.
 */
function etaDisplayState(remainingSeconds) {
  if (remainingSeconds <= 0) return { label: "Arriving in", text: "ETA passed — driver is still on the way" };
  if (remainingSeconds <= 60) return { label: "Arriving in", text: "Arriving soon" };
  return { label: "Arriving in", text: formatCountdown(remainingSeconds) };
}

function hideEtaCountdown() {
  stopEtaCountdown();
  heroEtaLocked = false;
  delete el.heroEta.dataset.state;
  el.etaCountdownLabel.hidden = true;
  el.etaCountdownDetail.hidden = true;
}

function tickEtaCountdown() {
  if (etaCountdownTimer) clearInterval(etaCountdownTimer);

  const render = () => {
    if (etaTargetMs === null) return;
    const remainingSeconds = Math.round((etaTargetMs - Date.now()) / 1000);
    const { text } = etaDisplayState(remainingSeconds);
    mapEl.etaCountdown.textContent = text;
    el.etaCountdownDetail.textContent = text;

    // Once the estimate has elapsed the value no longer changes each second, so stop the
    // interval instead of repainting the same overdue message forever.
    if (remainingSeconds <= 0 && etaCountdownTimer) {
      clearInterval(etaCountdownTimer);
      etaCountdownTimer = null;
    }
  };

  render();
  if (etaTargetMs !== null && etaTargetMs - Date.now() > 0) {
    etaCountdownTimer = setInterval(render, 1000);
  }
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function hideMap() {
  // Deliberately does NOT touch the ETA countdown — the countdown is driven independently
  // from delivery.eta in renderDelivery() and should keep counting down even if the map
  // itself isn't ready yet (e.g., the backend's road-route lookup is still in flight right
  // after a delivery becomes "out for delivery") or the delivery has no map data at all.
  mapEl.section.hidden = true;
  latestSnapshot = null;
}

function updateDriverCard(delivery) {
  mapEl.driverAvatar.textContent = delivery.driverAvatar || "🧑‍🚀";
  mapEl.driverName.textContent = delivery.driverLastName ? `${delivery.driverLastName}` : "Your driver";
  mapEl.driverSub.textContent = "On the way to you";
  mapEl.productName.textContent = delivery.productName || "";
}

async function refreshMapSnapshot(trackingNumber, generation = lookupGeneration) {
  try {
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}/location`);
    if (generation !== lookupGeneration) return;

    if (res.status === 204) {
      // Not currently out_for_delivery — nothing to show yet, or delivery has completed.
      hideMap();
      return;
    }
    if (!res.ok) return;
    const snapshot = await res.json();
    if (generation !== lookupGeneration) return;
    mapEl.fallback.hidden = true;
    renderRoute(snapshot);
  } catch {
    // Non-critical — the rest of the tracking UI still works without the map, but say so.
    if (!mapEl.section.hidden) {
      mapEl.fallback.textContent = "Live map is temporarily unavailable. Status and ETA are still up to date.";
      mapEl.fallback.hidden = false;
    }
  }
}

function resetMapForNewLookup() {
  hideMap();
  if (map) {
    map.remove();
    map = null;
  }
  vehicleMarker = null;
  routeLine = null;
  routeGlow = null;
  originMarker = null;
  destinationMarker = null;
  stopEtaCountdown();
  // Release the terminal-state latch so looking up a delivered parcel and then an in-transit
  // one doesn't leave the second stuck on the first one's "Delivered at" text.
  heroEtaLocked = false;
  lastHeading = 0;
}

async function loadHistoryTimeline(trackingNumber) {
  // Timeline rendering above already reflects current status; this call is available
  // for a more detailed per-stage-history view if needed, but current UI derives
  // stage completion from statusTimestamps already included in the lookup response.
  try {
    await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}/history`);
  } catch {
    // Non-critical — timeline already renders from the main lookup payload.
  }
}

// --- CUST-2: Real-time updates via SSE ---

function closeEventStream() {
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
  }
}

function subscribeToUpdates(trackingNumber, generation = lookupGeneration) {
  closeEventStream();

  const url = `${API_BASE}/events?channel=tracking&trackingNumber=${encodeURIComponent(trackingNumber)}`;
  const source = new EventSource(url);
  currentEventSource = source;
  let hasConnected = false;

  source.onopen = async () => {
    if (generation !== lookupGeneration) return;
    setConnectionState("live");
    // On a reconnect, events emitted while disconnected were missed, so re-sync from the
    // authoritative snapshots rather than trusting the current on-screen state.
    if (hasConnected) await refreshAuthoritativeState(trackingNumber, generation);
    hasConnected = true;
  };

  source.onmessage = async (messageEvent) => {
    if (generation !== lookupGeneration) return;
    setConnectionState("live");

    let domainEvent;
    try {
      domainEvent = JSON.parse(messageEvent.data);
    } catch {
      domainEvent = null;
    }

    // locationUpdated events drive smooth marker movement without re-fetching the whole
    // delivery record on every tick (the simulator ticks every ~1.2s).
    if (domainEvent?.eventType === "locationUpdated") {
      renderRoute(domainEvent.payload);
      return;
    }

    // Any other event (statusChanged, assignmentChanged, deliveryFailed) means something
    // structural changed — refetch the full view and the map snapshot, since a status
    // change may start, restart, or stop the simulated route.
    await refreshAuthoritativeState(trackingNumber, generation);
  };

  source.onerror = () => {
    if (generation !== lookupGeneration) return;
    // EventSource reconnects natively; surface the interim state so the customer knows the
    // view may be briefly out of date.
    setConnectionState(source.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
  };
}

async function refreshAuthoritativeState(trackingNumber, generation) {
  try {
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}`);
    if (!res.ok || generation !== lookupGeneration) return;
    const delivery = await res.json();
    if (generation !== lookupGeneration) return;
    renderDelivery(delivery);
    recordLookup(delivery.trackingNumber, delivery.status);
    await refreshMapSnapshot(trackingNumber, generation);
  } catch {
    setConnectionState("reconnecting");
  }
}

// --- CUST-3: Request note submission ---

el.noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const trackingNumber = el.noteForm.dataset.trackingNumber;
  if (!trackingNumber) return;

  // The textarea is the single source of truth (FR-B4). Presets only populate it, so a
  // customer's own edit is never silently replaced by a stale <select> value.
  const note = el.noteTextarea.value.trim();

  try {
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showNoteFeedback(body.error || "Could not save note.", false);
      return;
    }

    el.noteTextarea.value = note;
    showNoteFeedback("Note saved.", true);
  } catch {
    showNoteFeedback("Network error — could not save note.", false);
  }
});

el.noteSelect.addEventListener("change", () => {
  if (el.noteSelect.value) {
    el.noteTextarea.value = el.noteSelect.value;
  }
});

// Typing custom wording clears the preset selection so the two controls can never disagree
// about what will actually be saved.
el.noteTextarea.addEventListener("input", () => {
  if (el.noteSelect.value && el.noteTextarea.value !== el.noteSelect.value) {
    el.noteSelect.value = "";
  }
});

function showNoteFeedback(message, success) {
  el.noteFeedback.textContent = message;
  el.noteFeedback.style.color = success ? "#16a34a" : "#dc2626";
  el.noteFeedback.hidden = false;
}

// --- Customer inquiry console: quick message to ops, tied to the current tracking number ---

el.inquiryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentTrackingNumber) return;

  const message = el.inquiryMessage.value.trim();
  if (!message) return;

  try {
    const res = await fetch(`${API_BASE}/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: currentTrackingNumber, message }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showInquiryFeedback(body.error || "Could not send message.", false);
      return;
    }

    el.inquiryMessage.value = "";
    showInquiryFeedback("Message sent — our team will follow up.", true);
  } catch {
    showInquiryFeedback("Network error — could not send message.", false);
  }
});

function showInquiryFeedback(message, success) {
  el.inquiryFeedback.textContent = message;
  el.inquiryFeedback.style.color = success ? "#16a34a" : "#dc2626";
  el.inquiryFeedback.hidden = false;
}

// --- Init ---

renderHistory();
// Refresh stored statuses so returning visitors never see stale "In progress" labels.
void refreshRecentLookupStatuses();
