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
};

let deliveries = [];
let activeFilter = "";
let currentDeliveryId = null;

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
    // Token missing/invalid/expired — force re-login (DRV-1 session expiry behavior).
    clearToken();
    showScreen(el.loginScreen);
    throw new Error("Session expired. Please log in again.");
  }

  return res;
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
    await loadDeliveries();
    showScreen(el.listScreen);
  } catch {
    el.loginError.textContent = "Network error — please try again.";
    el.loginError.hidden = false;
  }
});

el.logoutButton.addEventListener("click", () => {
  clearToken();
  showScreen(el.loginScreen);
});

// --- DRV-2: Delivery list ---

async function loadDeliveries() {
  const res = await apiFetch("/driver/deliveries");
  deliveries = await res.json();
  renderList();
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
    li.dataset.testid = `delivery-item-${delivery.id}`;

    const title = document.createElement("div");
    title.className = "delivery-item-title";
    title.textContent = delivery.productName;

    const address = document.createElement("div");
    address.className = "delivery-item-address";
    address.textContent = delivery.address;

    const chip = document.createElement("span");
    chip.className = "status-chip";
    chip.dataset.status = delivery.status;
    chip.textContent = STATUS_LABELS[delivery.status] || delivery.status;

    li.appendChild(title);
    li.appendChild(address);
    li.appendChild(chip);
    li.addEventListener("click", () => openDetail(delivery.id));

    el.deliveryList.appendChild(li);
  }
}

// --- Detail view ---

async function openDetail(deliveryId) {
  currentDeliveryId = deliveryId;
  const res = await apiFetch(`/driver/deliveries/${deliveryId}`);
  const delivery = await res.json();
  renderDetail(delivery);
  showScreen(el.detailScreen);
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
    el.completeModal.hidden = false;
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

el.completeCancelButton.addEventListener("click", () => {
  el.completeModal.hidden = true;
  el.completeForm.reset();
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

    el.completeModal.hidden = true;
    el.completeForm.reset();

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showDetailFeedback(body.error || "Could not complete delivery.", false);
      return;
    }

    const updated = await res.json();
    renderDetail(updated);
    showDetailFeedback("Delivery marked as delivered.", true);
  } catch (err) {
    el.completeModal.hidden = true;
    showDetailFeedback(err.message || "Network error.", false);
  }
});

// --- DRV-4: Report failure ---

el.failButton.addEventListener("click", () => {
  el.failModal.hidden = false;
});

el.failCancelButton.addEventListener("click", () => {
  el.failModal.hidden = true;
  el.failForm.reset();
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

    el.failModal.hidden = true;
    el.failForm.reset();

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showDetailFeedback(body.error || "Could not report failure.", false);
      return;
    }

    const updated = await res.json();
    renderDetail(updated);
    showDetailFeedback("Failure reported. Marked as re-delivery target.", true);
  } catch (err) {
    el.failModal.hidden = true;
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
  if (getToken()) {
    try {
      await loadDeliveries();
      showScreen(el.listScreen);
      return;
    } catch {
      // apiFetch already routes to login screen on 401/expired token
      return;
    }
  }
  showScreen(el.loginScreen);
})();
