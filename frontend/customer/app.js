// Customer App — implements CUST-1 (lookup), CUST-2 (real-time timeline via SSE),
// CUST-3 (request note), CUST-4 (recent-lookups history via localStorage).

const API_BASE = "/api";
const HISTORY_STORAGE_KEY = "deliveryTracker.recentLookups";

const STAGE_ORDER = [
  { key: "intake", label: "Intake", timestampField: "intakeAt" },
  { key: "pickup", label: "Pickup", timestampField: "pickupAt" },
  { key: "line_haul_loaded", label: "Line-haul loaded", timestampField: "lineHaulLoadedAt" },
  { key: "arrived_at_camp", label: "Arrived at camp", timestampField: "arrivedAtCampAt" },
  { key: "out_for_delivery", label: "Out for delivery", timestampField: "outForDeliveryAt" },
  { key: "delivered", label: "Delivered", timestampField: "deliveredAt" },
];

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
  driverNameLabel: document.getElementById("driver-name-label"),
  driverName: document.getElementById("driver-name"),
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
  noteLockedMessage: document.getElementById("note-locked-message"),
  noteFeedback: document.getElementById("note-feedback"),
  historyList: document.getElementById("history-list"),
  historyEmptyMessage: document.getElementById("history-empty-message"),
};

let currentEventSource = null;
let currentTrackingNumber = null;
let map = null;
let vehicleMarker = null;
let routeLine = null;
let originMarker = null;
let destinationMarker = null;
let etaCountdownTimer = null;
let etaTargetMs = null;
let hasCenteredOnVehicle = false;
let isFollowingVehicle = false;

const mapEl = {
  section: document.getElementById("live-map-section"),
  canvas: document.getElementById("live-map-canvas"),
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
  history.unshift({ trackingNumber, status, lookedUpAt: new Date().toISOString() });
  saveHistory(history.slice(0, 20)); // cap history length
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  el.historyList.innerHTML = "";
  el.historyEmptyMessage.hidden = history.length > 0;

  for (const item of history) {
    const li = document.createElement("li");
    li.dataset.testid = `recent-lookup-item-${item.trackingNumber}`;

    const label = document.createElement("span");
    label.textContent = item.trackingNumber;

    const badge = document.createElement("span");
    const isCompleted = item.status === "delivered" || item.status === "failed";
    badge.className = `history-badge ${isCompleted ? "completed" : ""}`;
    badge.textContent = isCompleted ? "Completed" : "In progress";

    li.appendChild(label);
    li.appendChild(badge);
    li.addEventListener("click", () => {
      el.trackingInput.value = item.trackingNumber;
      performLookup(item.trackingNumber);
    });

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
  resetMapForNewLookup();
  try {
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}`);
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
    renderDelivery(delivery);
    recordLookup(delivery.trackingNumber, delivery.status);
    await loadHistoryTimeline(delivery.trackingNumber);
    await refreshMapSnapshot(delivery.trackingNumber);
    subscribeToUpdates(delivery.trackingNumber);
  } catch (err) {
    showError("Network error — please check your connection and try again.");
  }
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
  el.statusBadge.textContent = delivery.status.replace(/_/g, " ");
  el.statusBadge.dataset.status = delivery.status;
  el.trackingDisplay.textContent = delivery.trackingNumber;
  el.productName.textContent = delivery.productName;
  el.address.textContent = delivery.address;
  el.eta.textContent = delivery.eta ? new Date(delivery.eta).toLocaleString() : "Not yet available";

  if (delivery.driverLastName) {
    el.driverNameLabel.hidden = false;
    el.driverName.hidden = false;
    el.driverName.textContent = delivery.driverLastName;
  } else {
    el.driverNameLabel.hidden = true;
    el.driverName.hidden = true;
  }

  renderTimeline(delivery);
  updateDriverCard(delivery);

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

  // CUST-3: note editability
  el.noteTextarea.value = delivery.requestNote || "";
  el.noteSelect.value = "";
  const editable = delivery.requestNoteEditable;
  el.noteTextarea.disabled = !editable;
  el.noteSelect.disabled = !editable;
  el.noteForm.querySelector("button[type=submit]").disabled = !editable;
  el.noteLockedMessage.hidden = editable;
  el.noteFeedback.hidden = true;

  el.noteForm.dataset.trackingNumber = delivery.trackingNumber;
}

function renderTimeline(delivery) {
  el.timeline.innerHTML = "";
  const currentIndex = STAGE_ORDER.findIndex((s) => s.key === delivery.status);

  STAGE_ORDER.forEach((stage, index) => {
    const li = document.createElement("li");
    li.dataset.testid = `timeline-stage-${stage.key}`;

    const isCompleted = index < currentIndex || (index === currentIndex && delivery.status !== "failed");
    const isCurrent = index === currentIndex;

    if (isCompleted) li.classList.add("completed");
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
    li.classList.add("current");
    li.dataset.testid = "timeline-stage-failed";
    li.textContent = "Delivery Failed — a re-delivery will be scheduled";
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

const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
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

function vehicleIcon(headingDegrees) {
  return L.divIcon({
    className: "vehicle-icon-wrapper",
    html: `<div class="vehicle-marker" style="transform: rotate(${headingDegrees}deg);">🏎️</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
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
    routeLine = L.polyline(linePoints, {
      color: "#1a73e8",
      weight: 5,
      opacity: 0.6,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    originMarker = L.circleMarker([origin.lat, origin.lng], {
      radius: 7,
      color: "#34a853",
      fillColor: "#34a853",
      fillOpacity: 1,
      weight: 2,
    })
      .addTo(map)
      .bindPopup("Camp (departure point)");

    destinationMarker = L.circleMarker([destination.lat, destination.lng], {
      radius: 7,
      color: "#ea4335",
      fillColor: "#ea4335",
      fillOpacity: 1,
      weight: 2,
    })
      .addTo(map)
      .bindPopup("Delivery destination");
  }

  if (!vehicleMarker) {
    vehicleMarker = L.marker(vehicleLatLng, { icon: vehicleIcon(snapshot.heading) })
      .addTo(map)
      .bindPopup("Your delivery is on the way")
      .on("click", () => {
        isFollowingVehicle = true;
        map.panTo(vehicleMarker.getLatLng(), { animate: true });
      });
  } else {
    // Leaflet's setLatLng jumps instantly; CSS handles the "glide" feel via the marker's
    // own transition on its wrapping div (see .vehicle-marker transition in styles.css)
    // applied through Leaflet's internal position updates on each SSE tick.
    vehicleMarker.setLatLng(vehicleLatLng);
    vehicleMarker.setIcon(vehicleIcon(snapshot.heading));
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
  etaTargetMs = Date.now() + snapshot.etaRemainingSeconds * 1000;
  const progressPercent = Math.round(snapshot.progress * 100);
  mapEl.progressFill.style.width = `${progressPercent}%`;
  tickEtaCountdown();
}

function tickEtaCountdown() {
  if (etaCountdownTimer) clearInterval(etaCountdownTimer);

  const render = () => {
    if (etaTargetMs === null) return;
    const remainingSeconds = Math.max(0, Math.round((etaTargetMs - Date.now()) / 1000));
    mapEl.etaCountdown.textContent = formatCountdown(remainingSeconds);
  };

  render();
  etaCountdownTimer = setInterval(render, 1000);
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function hideMap() {
  mapEl.section.hidden = true;
  latestSnapshot = null;
  if (etaCountdownTimer) {
    clearInterval(etaCountdownTimer);
    etaCountdownTimer = null;
  }
}

function updateDriverCard(delivery) {
  mapEl.driverAvatar.textContent = delivery.driverAvatar || "🧑‍🚀";
  mapEl.driverName.textContent = delivery.driverLastName ? `${delivery.driverLastName}` : "Your driver";
  mapEl.driverSub.textContent = "On the way to you";
  mapEl.productName.textContent = delivery.productName || "";
}

async function refreshMapSnapshot(trackingNumber) {
  try {
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}/location`);
    if (res.status === 204) {
      // Not currently out_for_delivery — nothing to show yet, or delivery has completed.
      hideMap();
      return;
    }
    if (!res.ok) return;
    const snapshot = await res.json();
    renderRoute(snapshot);
  } catch {
    // Non-critical — the rest of the tracking UI still works without the map.
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
  originMarker = null;
  destinationMarker = null;
  etaTargetMs = null;
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

function subscribeToUpdates(trackingNumber) {
  if (currentEventSource) {
    currentEventSource.close();
  }

  const url = `${API_BASE}/events?channel=tracking&trackingNumber=${encodeURIComponent(trackingNumber)}`;
  currentEventSource = new EventSource(url);

  currentEventSource.onmessage = async (messageEvent) => {
    let domainEvent;
    try {
      domainEvent = JSON.parse(messageEvent.data);
    } catch {
      domainEvent = null;
    }

    // locationUpdated events drive smooth marker movement without re-fetching the whole
    // delivery record on every tick (the simulator ticks every ~1.5s).
    if (domainEvent?.eventType === "locationUpdated") {
      renderRoute(domainEvent.payload);
      return;
    }

    // Any other event (statusChanged, assignmentChanged, deliveryFailed) means something
    // structural changed — refetch the full view (and the map snapshot, since a status
    // change may start/stop the simulated route).
    const res = await fetch(`${API_BASE}/deliveries/lookup/${encodeURIComponent(trackingNumber)}`);
    if (res.ok) {
      const delivery = await res.json();
      renderDelivery(delivery);
      recordLookup(delivery.trackingNumber, delivery.status);
      await refreshMapSnapshot(trackingNumber);
    }
  };

  currentEventSource.onerror = () => {
    // EventSource auto-reconnects by default; nothing else required here.
  };
}

// --- CUST-3: Request note submission ---

el.noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const trackingNumber = el.noteForm.dataset.trackingNumber;
  if (!trackingNumber) return;

  const note = el.noteSelect.value || el.noteTextarea.value.trim();

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

function showNoteFeedback(message, success) {
  el.noteFeedback.textContent = message;
  el.noteFeedback.style.color = success ? "#16a34a" : "#dc2626";
  el.noteFeedback.hidden = false;
}

// --- Init ---

renderHistory();
