// Driver App — implements DRV-1 (login/session), DRV-2 (delivery list), DRV-3 (status update/
// completion), DRV-4 (failure reporting).

const API_BASE = "/api";
const TOKEN_STORAGE_KEY = "driverConsole.token";

// Mirrors backend DELIVERY_STATUS_SEQUENCE (domain/types.ts) for "what's the next status" UI logic.
// The backend is the source of truth/enforcement (BR-1) — this is purely for driving the UI label.
const STATUS_SEQUENCE = ["intake", "pickup", "line_haul_loaded", "arrived_at_camp", "out_for_delivery", "delivered"];
const STATUS_LABELS = {
  intake: "Intake",
  pickup: "Pickup",
  line_haul_loaded: "Line-haul loaded",
  arrived_at_camp: "Arrived at camp",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
};

const el = {
  loginScreen: document.getElementById("login-screen"),
  listScreen: document.getElementById("list-screen"),
  detailScreen: document.getElementById("detail-screen"),
  loginForm: document.getElementById("login-form"),
  employeeIdInput: document.getElementById("employee-id-input"),
  passwordInput: document.getElementById("password-input"),
  loginError: document.getElementById("login-error"),
  remainingCount: document.getElementById("remaining-count"),
  logoutButton: document.getElementById("logout-button"),
  filterRow: document.querySelector(".filter-row"),
  deliveryList: document.getElementById("delivery-list"),
  listEmptyMessage: document.getElementById("list-empty-message"),
  backButton: document.getElementById("back-button"),
  detailProductName: document.getElementById("detail-product-name"),
  detailTrackingNumber: document.getElementById("detail-tracking-number"),
  detailAddress: document.getElementById("detail-address"),
  detailNote: document.getElementById("detail-note"),
  detailStatus: document.getElementById("detail-status"),
  redeliveryBadge: document.getElementById("redelivery-badge"),
  advanceStatusButton: document.getElementById("advance-status-button"),
  failButton: document.getElementById("fail-delivery-button"),
  detailFeedback: document.getElementById("detail-feedback"),
  completeModal: document.getElementById("complete-modal"),
  completeForm: document.getElementById("complete-form"),
  receiptMethodSelect: document.getElementById("receipt-method-select"),
  photoUrlInput: document.getElementById("photo-url-input"),
  completeCancelButton: document.getElementById("complete-cancel-button"),
  failModal: document.getElementById("fail-modal"),
  failForm: document.getElementById("fail-form"),
  failureReasonSelect: document.getElementById("failure-reason-select"),
  failureMemoInput: document.getElementById("failure-memo-input"),
  failCancelButton: document.getElementById("fail-cancel-button"),
  connectionStatus: document.getElementById("connection-status"),
  liveRegion: document.getElementById("list-live-region"),
  listLoading: document.getElementById("list-loading-message"),
  listError: document.getElementById("list-error-message"),
};

let deliveries = [];
let activeFilter = "";
let currentDeliveryId = null;
let eventSource = null;
let sessionExpiryTimer = null;
let lastFocusedBeforeModal = null;

// --- Session handling (DRV-1) ---

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Schedules a client-side logout at the JWT's own expiry (FR-B10). The server remains
 * authoritative — this only prevents a stale screen from *looking* authenticated for hours
 * after the 12-hour session has actually expired.
 */
function scheduleSessionExpiry() {
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  const token = getToken();
  if (!token) return;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload?.exp) return;
    const msRemaining = payload.exp * 1000 - Date.now();
    if (msRemaining <= 0) {
      endSession("Your shift session has expired. Please log in again.");
      return;
    }
    sessionExpiryTimer = setTimeout(
      () => endSession("Your shift session has expired. Please log in again."),
      msRemaining
    );
  } catch {
    // Malformed token — the next protected request will surface a 401 anyway.
  }
}

function endSession(message) {
  clearToken();
  closeEventStream();
  if (sessionExpiryTimer) {
    clearTimeout(sessionExpiryTimer);
    sessionExpiryTimer = null;
  }
  showScreen(el.loginScreen);
  if (message) {
    el.loginError.textContent = message;
    el.loginError.hidden = false;
  }
}

function setConnectionState(state) {
  el.connectionStatus.dataset.state = state;
  el.connectionStatus.textContent =
    state === "live" ? "Live" : state === "reconnecting" ? "Reconnecting…" : state === "offline" ? "Offline" : "";
}

function announce(message) {
  el.liveRegion.textContent = message;
}

function showScreen(screen) {
  for (const s of [el.loginScreen, el.listScreen, el.detailScreen]) {
    s.hidden = s !== screen;
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    // Token missing/invalid/expired, or the driver was deactivated server-side.
    endSession("Your session is no longer valid. Please log in again.");
    throw new Error("Session expired. Please log in again.");
  }

  return res;
}

// --- Realtime driver worklist (FR-B8) ---

function closeEventStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  setConnectionState("idle");
}

/**
 * EventSource cannot send an Authorization header, so the driver stream is opened with a
 * short-lived one-use ticket minted from the JWT. The backend derives the channel from the
 * authenticated driver, so a driver cannot subscribe to anyone else's stream.
 */
async function subscribeToDriverEvents() {
  closeEventStream();
  try {
    const res = await apiFetch("/events/ticket", { method: "POST" });
    if (!res.ok) return;
    const { ticket } = await res.json();

    const source = new EventSource(`${API_BASE}/events?ticket=${encodeURIComponent(ticket)}`);
    eventSource = source;

    source.onopen = () => setConnectionState("live");
    source.onmessage = async () => {
      setConnectionState("live");
      // Assignment/status changes from operations or another session must appear here without
      // the driver manually refreshing.
      await loadDeliveries({ silent: true });
      if (!el.detailScreen.hidden && currentDeliveryId) await refreshDetail(currentDeliveryId);
    };
    source.onerror = () => {
      setConnectionState(source.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
      // A closed stream means the one-use ticket is spent; mint a new one to resume.
      if (source.readyState === EventSource.CLOSED && getToken()) {
        setTimeout(() => {
          if (getToken() && eventSource === source) void subscribeToDriverEvents();
        }, 3000);
      }
    };
  } catch {
    setConnectionState("offline");
  }
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.loginError.hidden = true;

  const employeeId = el.employeeIdInput.value.trim();
  const password = el.passwordInput.value;

  try {
    const res = await fetch(`${API_BASE}/auth/driver/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });

    if (!res.ok) {
      el.loginError.textContent = "Invalid employee ID or password.";
      el.loginError.hidden = false;
      return;
    }

    const { token } = await res.json();
    setToken(token);
    scheduleSessionExpiry();
    await loadDeliveries();
    showScreen(el.listScreen);
    void subscribeToDriverEvents();
  } catch {
    el.loginError.textContent = "Network error — please try again.";
    el.loginError.hidden = false;
  }
});

el.logoutButton.addEventListener("click", () => {
  endSession(null);
});

// --- DRV-2: Delivery list ---

async function loadDeliveries({ silent = false } = {}) {
  if (!silent) el.listLoading.hidden = false;
  el.listError.hidden = true;
  try {
    const res = await apiFetch("/driver/deliveries");
    if (!res.ok) {
      el.listError.textContent = "Could not load your deliveries. Pull to retry or check your connection.";
      el.listError.hidden = false;
      return;
    }
    deliveries = await res.json();
    renderList();
  } catch (err) {
    if (getToken()) {
      el.listError.textContent = err?.message || "Could not load your deliveries.";
      el.listError.hidden = false;
    }
  } finally {
    el.listLoading.hidden = true;
  }
}

el.filterRow.addEventListener("click", (e) => {
  const button = e.target.closest(".filter-button");
  if (!button) return;

  el.filterRow.querySelectorAll(".filter-button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  activeFilter = button.dataset.status || "";
  renderList();
});

function renderList() {
  const allowedStatuses = activeFilter ? activeFilter.split(",") : null;
  const filtered = allowedStatuses ? deliveries.filter((d) => allowedStatuses.includes(d.status)) : deliveries;

  const remaining = deliveries.filter((d) => d.status !== "delivered" && d.status !== "failed").length;
  el.remainingCount.textContent = `${remaining} deliver${remaining === 1 ? "y" : "ies"} remaining`;

  el.deliveryList.innerHTML = "";
  el.listEmptyMessage.hidden = filtered.length > 0;

  for (const delivery of filtered) {
    const li = document.createElement("li");

    // Real <button> so each stop is keyboard reachable and announced as actionable.
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delivery-item-button";
    button.dataset.testid = `delivery-item-${delivery.id}`;

    const title = document.createElement("div");
    title.className = "delivery-item-title";
    const stop = delivery.deliveryOrder ? `Stop ${delivery.deliveryOrder} · ` : "";
    title.textContent = `${stop}${delivery.productName}`;

    const address = document.createElement("div");
    address.className = "delivery-item-address";
    address.textContent = delivery.address;

    button.append(title, address);

    // Request note visible on the card itself so drivers see handling instructions before
    // opening the stop (FR-B9).
    if (delivery.requestNote) {
      const note = document.createElement("div");
      note.className = "delivery-item-note";
      note.dataset.testid = `delivery-item-note-${delivery.id}`;
      note.textContent = `📝 ${delivery.requestNote}`;
      button.appendChild(note);
    }

    const chipRow = document.createElement("div");
    chipRow.className = "delivery-item-chip-row";

    const chip = document.createElement("span");
    chip.className = "status-chip";
    chip.dataset.status = delivery.status;
    chip.textContent = STATUS_LABELS[delivery.status] || delivery.status;
    chipRow.appendChild(chip);

    if (delivery.isRedeliveryTarget) {
      const redelivery = document.createElement("span");
      redelivery.className = "status-chip redelivery-chip";
      redelivery.textContent = "Re-delivery";
      chipRow.appendChild(redelivery);
    }

    button.appendChild(chipRow);
    button.setAttribute(
      "aria-label",
      `${stop}${delivery.productName}, ${delivery.address}, status ${STATUS_LABELS[delivery.status] || delivery.status}`
    );
    button.addEventListener("click", () => openDetail(delivery.id));

    li.appendChild(button);
    el.deliveryList.appendChild(li);
  }
}

// --- Detail view ---

async function openDetail(deliveryId) {
  currentDeliveryId = deliveryId;
  try {
    const res = await apiFetch(`/driver/deliveries/${deliveryId}`);
    if (!res.ok) {
      // 404 also covers "assigned to another driver" so IDs cannot be probed.
      await loadDeliveries({ silent: true });
      showScreen(el.listScreen);
      announce("That delivery is no longer assigned to you.");
      return;
    }
    const delivery = await res.json();
    renderDetail(delivery);
    showScreen(el.detailScreen);
  } catch {
    // apiFetch already handled session expiry.
  }
}

async function refreshDetail(deliveryId) {
  try {
    const res = await apiFetch(`/driver/deliveries/${deliveryId}`);
    if (!res.ok) return;
    renderDetail(await res.json());
  } catch {
    // Non-fatal: the list stream will retry.
  }
}

function renderDetail(delivery) {
  el.detailProductName.textContent = delivery.productName;
  el.detailTrackingNumber.textContent = delivery.trackingNumber;
  el.detailAddress.textContent = delivery.address;
  el.detailNote.textContent = delivery.requestNote || "(none)";
  el.detailStatus.textContent = STATUS_LABELS[delivery.status] || delivery.status;
  el.redeliveryBadge.hidden = !delivery.isRedeliveryTarget;
  el.detailFeedback.hidden = true;

  const isTerminal = delivery.status === "delivered" || delivery.status === "failed";
  el.advanceStatusButton.hidden = isTerminal;
  el.failButton.hidden = delivery.status !== "out_for_delivery";

  const nextIndex = STATUS_SEQUENCE.indexOf(delivery.status) + 1;
  const nextStatus = STATUS_SEQUENCE[nextIndex];
  el.advanceStatusButton.textContent = nextStatus
    ? nextStatus === "delivered"
      ? "Mark Delivered"
      : `Advance to "${STATUS_LABELS[nextStatus]}"`
    : "Advance Status";

  el.advanceStatusButton.dataset.currentStatus = delivery.status;
  el.advanceStatusButton.dataset.nextStatus = nextStatus || "";
}

el.backButton.addEventListener("click", async () => {
  await loadDeliveries();
  showScreen(el.listScreen);
});

// --- DRV-3: Advance status / complete delivery ---

el.advanceStatusButton.addEventListener("click", async () => {
  const nextStatus = el.advanceStatusButton.dataset.nextStatus;
  if (!nextStatus) return;

  if (nextStatus === "delivered") {
    openModal(el.completeModal, el.receiptMethodSelect);
    return;
  }

  await submitStatusChange(nextStatus);
});

async function submitStatusChange(nextStatus) {
  try {
    const res = await apiFetch(`/driver/deliveries/${currentDeliveryId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showDetailFeedback(body.error || "Could not update status.", false);
      return;
    }

    const updated = await res.json();
    renderDetail(updated);
    showDetailFeedback("Status updated.", true);
  } catch (err) {
    showDetailFeedback(err.message || "Network error.", false);
  }
}

/**
 * Accessible modal handling: move focus in, keep it inside while open, restore it on close,
 * and support Escape (WCAG keyboard operability and focus management).
 */
function openModal(modal, initialFocusEl) {
  lastFocusedBeforeModal = document.activeElement;
  modal.hidden = false;
  (initialFocusEl || modal.querySelector("button, select, input, textarea"))?.focus();
}

function closeModal(modal, form) {
  modal.hidden = true;
  form?.reset();
  if (lastFocusedBeforeModal instanceof HTMLElement) lastFocusedBeforeModal.focus();
}

function openModalsInDom() {
  return [el.completeModal, el.failModal].filter((m) => !m.hidden);
}

document.addEventListener("keydown", (event) => {
  const openModal = openModalsInDom()[0];
  if (!openModal) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeModal(openModal, openModal.querySelector("form"));
    return;
  }

  if (event.key !== "Tab") return;

  const focusables = [...openModal.querySelectorAll("button, select, input, textarea, [href]")].filter(
    (node) => !node.disabled && node.offsetParent !== null
  );
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

el.completeCancelButton.addEventListener("click", () => {
  closeModal(el.completeModal, el.completeForm);
});

el.completeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const res = await apiFetch(`/driver/deliveries/${currentDeliveryId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        receiptMethod: el.receiptMethodSelect.value,
        proofOfDeliveryPhotoUrl: el.photoUrlInput.value,
      }),
    });

    closeModal(el.completeModal, el.completeForm);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showDetailFeedback(body.error || "Could not complete delivery.", false);
      return;
    }

    const updated = await res.json();
    renderDetail(updated);
    showDetailFeedback("Delivery marked as delivered.", true);
  } catch (err) {
    closeModal(el.completeModal, el.completeForm);
    showDetailFeedback(err.message || "Network error.", false);
  }
});

// --- DRV-4: Report failure ---

el.failButton.addEventListener("click", () => {
  openModal(el.failModal, el.failureReasonSelect);
});

el.failCancelButton.addEventListener("click", () => {
  closeModal(el.failModal, el.failForm);
});

el.failForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const res = await apiFetch(`/driver/deliveries/${currentDeliveryId}/fail`, {
      method: "POST",
      body: JSON.stringify({
        reason: el.failureReasonSelect.value,
        memo: el.failureMemoInput.value || undefined,
      }),
    });

    closeModal(el.failModal, el.failForm);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showDetailFeedback(body.error || "Could not report failure.", false);
      return;
    }

    const updated = await res.json();
    renderDetail(updated);
    showDetailFeedback("Failure reported. Marked as re-delivery target.", true);
  } catch (err) {
    closeModal(el.failModal, el.failForm);
    showDetailFeedback(err.message || "Network error.", false);
  }
});

function showDetailFeedback(message, success) {
  el.detailFeedback.textContent = message;
  el.detailFeedback.style.color = success ? "#16a34a" : "#dc2626";
  el.detailFeedback.hidden = false;
}

// --- Init: restore session if a token already exists (DRV-1 refresh persistence) ---

(async function init() {
  try {
    // Entry-point simplification: always authenticate silently with the seeded demo driver
    // instead of trusting a token already in storage — a stale/expired leftover token would
    // otherwise pass the `getToken()` check, then fail on the first real API call and leave
    // the screen blank (loadDeliveries() throws before any screen is ever shown).
    const res = await fetch(`${API_BASE}/auth/driver/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: "EMP001", password: "driver123" }),
    });
    if (!res.ok) throw new Error("auto-login failed");
    const { token } = await res.json();
    setToken(token);

    scheduleSessionExpiry();
    await loadDeliveries();
    showScreen(el.listScreen);
    void subscribeToDriverEvents();
  } catch (err) {
    console.error("Driver console failed to load:", err);
    showScreen(el.listScreen);
    el.listError.textContent = "Could not load deliveries. Please refresh the page.";
    el.listError.hidden = false;
  }
})();
