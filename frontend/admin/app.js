// Admin App — implements ADM-1 (login/session), ADM-2 (dashboard), ADM-3 (assignment),
// ADM-4 (master data), ADM-5 (history), and SYS-2 (manual delivery creation).

const API_BASE = "/api";
const TOKEN_STORAGE_KEY = "adminConsole.token";

const STATUS_LABELS = {
  intake: "Intake",
  pickup: "Pickup",
  line_haul_loaded: "Line-haul loaded",
  arrived_at_camp: "Arrived at camp",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed",
};

const PENDING_STATUSES = ["intake", "pickup", "line_haul_loaded", "arrived_at_camp"];

const el = {
  loginScreen: document.getElementById("login-screen"),
  appShell: document.getElementById("app-shell"),
  loginForm: document.getElementById("login-form"),
  usernameInput: document.getElementById("username-input"),
  passwordInput: document.getElementById("password-input"),
  loginError: document.getElementById("login-error"),
  logoutButton: document.getElementById("logout-button"),
  tabBar: document.getElementById("tab-bar"),
  tabs: {
    dashboard: document.getElementById("dashboard-tab"),
    assignment: document.getElementById("assignment-tab"),
    masterdata: document.getElementById("masterdata-tab"),
    history: document.getElementById("history-tab"),
  },

  // Dashboard
  countPending: document.getElementById("count-pending"),
  countInTransit: document.getElementById("count-in-transit"),
  countDelivered: document.getElementById("count-delivered"),
  countFailed: document.getElementById("count-failed"),
  dashboardCampFilter: document.getElementById("dashboard-camp-filter"),
  dashboardDriverFilter: document.getElementById("dashboard-driver-filter"),
  dashboardList: document.getElementById("dashboard-list"),
  newDeliveryButton: document.getElementById("new-delivery-button"),

  // Assignment
  unassignedList: document.getElementById("unassigned-list"),
  unassignedEmptyMessage: document.getElementById("unassigned-empty-message"),

  // Master data
  driverForm: document.getElementById("driver-form"),
  driverEmployeeId: document.getElementById("driver-employee-id"),
  driverName: document.getElementById("driver-name"),
  driverArea: document.getElementById("driver-area"),
  driverContact: document.getElementById("driver-contact"),
  driverPassword: document.getElementById("driver-password"),
  driverFeedback: document.getElementById("driver-feedback"),
  driverList: document.getElementById("driver-list"),
  campForm: document.getElementById("camp-form"),
  campName: document.getElementById("camp-name"),
  campArea: document.getElementById("camp-area"),
  campFeedback: document.getElementById("camp-feedback"),
  campList: document.getElementById("camp-list"),

  // History
  historyDateFrom: document.getElementById("history-date-from"),
  historyDateTo: document.getElementById("history-date-to"),
  historyStatusFilter: document.getElementById("history-status-filter"),
  historyDriverFilter: document.getElementById("history-driver-filter"),
  historyFilterButton: document.getElementById("history-filter-button"),
  historyList: document.getElementById("history-list"),

  // Modals
  historyModal: document.getElementById("history-modal"),
  historyModalTitle: document.getElementById("history-modal-title"),
  historyTimeline: document.getElementById("history-timeline"),
  historyModalCloseButton: document.getElementById("history-modal-close-button"),

  assignModal: document.getElementById("assign-modal"),
  assignModalDeliveryInfo: document.getElementById("assign-modal-delivery-info"),
  assignDriverSelect: document.getElementById("assign-driver-select"),
  assignCancelButton: document.getElementById("assign-cancel-button"),
  assignConfirmButton: document.getElementById("assign-confirm-button"),
  assignFeedback: document.getElementById("assign-feedback"),

  newDeliveryModal: document.getElementById("new-delivery-modal"),
  newDeliveryForm: document.getElementById("new-delivery-form"),
  newDeliveryProduct: document.getElementById("new-delivery-product"),
  newDeliveryAddress: document.getElementById("new-delivery-address"),
  newDeliveryCamp: document.getElementById("new-delivery-camp"),
  newDeliveryNote: document.getElementById("new-delivery-note"),
  newDeliveryCancelButton: document.getElementById("new-delivery-cancel-button"),
  newDeliveryFeedback: document.getElementById("new-delivery-feedback"),
};

let camps = [];
let drivers = [];
let assignTargetId = null;
let eventSource = null;

// --- Session handling (ADM-1) ---

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}
function setToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}
function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
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
    clearToken();
    showLogin();
    throw new Error("Session expired. Please log in again.");
  }

  return res;
}

function showLogin() {
  el.loginScreen.hidden = false;
  el.appShell.hidden = true;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function showAppShell() {
  el.loginScreen.hidden = true;
  el.appShell.hidden = false;
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.loginError.hidden = true;

  try {
    const res = await fetch(`${API_BASE}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: el.usernameInput.value.trim(), password: el.passwordInput.value }),
    });

    if (!res.ok) {
      el.loginError.textContent = "Invalid username or password.";
      el.loginError.hidden = false;
      return;
    }

    const { token } = await res.json();
    setToken(token);
    await initApp();
    showAppShell();
  } catch {
    el.loginError.textContent = "Network error — please try again.";
    el.loginError.hidden = false;
  }
});

el.logoutButton.addEventListener("click", () => {
  clearToken();
  showLogin();
});

// --- Tabs ---

el.tabBar.addEventListener("click", (e) => {
  const button = e.target.closest(".tab-button");
  if (!button) return;

  el.tabBar.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");

  const tabName = button.dataset.tab;
  for (const [name, panel] of Object.entries(el.tabs)) {
    panel.hidden = name !== tabName;
  }

  if (tabName === "assignment") loadUnassigned();
  if (tabName === "history") loadHistory();
  if (tabName === "masterdata") loadMasterData();
});

// --- Shared: load camps/drivers for filters and selects ---

async function loadReferenceData() {
  const [campsRes, driversRes] = await Promise.all([
    apiFetch("/admin/camps"),
    apiFetch("/admin/drivers"),
  ]);
  camps = await campsRes.json();
  drivers = await driversRes.json();

  populateSelect(el.dashboardCampFilter, camps, "id", "name", "All Camps");
  populateSelect(el.dashboardDriverFilter, drivers, "id", "name", "All Drivers");
  populateSelect(el.historyDriverFilter, drivers, "id", "name", "All Drivers");
  populateSelect(el.newDeliveryCamp, camps, "id", "name", null);
  populateSelect(el.assignDriverSelect, drivers.filter((d) => d.active), "id", "name", null);
}

function populateSelect(selectEl, items, valueKey, labelKey, placeholderLabel) {
  const currentValue = selectEl.value;
  selectEl.innerHTML = "";
  if (placeholderLabel) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholderLabel;
    selectEl.appendChild(opt);
  }
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    selectEl.appendChild(opt);
  }
  selectEl.value = currentValue;
}

function driverName(driverId) {
  const driver = drivers.find((d) => d.id === driverId);
  return driver ? driver.name : "Unassigned";
}

// --- ADM-2: Dashboard ---

async function loadDashboard() {
  const params = new URLSearchParams();
  if (el.dashboardCampFilter.value) params.set("campId", el.dashboardCampFilter.value);
  if (el.dashboardDriverFilter.value) params.set("driverId", el.dashboardDriverFilter.value);

  const res = await apiFetch(`/admin/deliveries?${params.toString()}`);
  const deliveries = await res.json();
  renderDashboard(deliveries);
}

el.dashboardCampFilter.addEventListener("change", loadDashboard);
el.dashboardDriverFilter.addEventListener("change", loadDashboard);

function renderDashboard(deliveries) {
  const pending = deliveries.filter((d) => PENDING_STATUSES.includes(d.status)).length;
  const inTransit = deliveries.filter((d) => d.status === "out_for_delivery").length;
  const delivered = deliveries.filter((d) => d.status === "delivered").length;
  const failed = deliveries.filter((d) => d.status === "failed").length;

  el.countPending.textContent = pending;
  el.countInTransit.textContent = inTransit;
  el.countDelivered.textContent = delivered;
  el.countFailed.textContent = failed;

  el.dashboardList.innerHTML = "";
  for (const delivery of deliveries) {
    el.dashboardList.appendChild(buildDeliveryCard(delivery, { showOpenHistory: true }));
  }
}

function buildDeliveryCard(delivery, { showOpenHistory = false } = {}) {
  const card = document.createElement("div");
  card.className = "delivery-card";
  card.dataset.testid = `delivery-card-${delivery.id}`;
  if (delivery.status === "failed") {
    card.classList.add("emphasized");
  }

  const title = document.createElement("div");
  title.className = "delivery-card-title";
  title.textContent = `${delivery.trackingNumber} — ${delivery.productName}`;

  const meta = document.createElement("div");
  meta.className = "delivery-card-meta";
  meta.textContent = `${delivery.address} · Driver: ${driverName(delivery.driverId)}`;

  const chip = document.createElement("span");
  chip.className = "status-chip";
  chip.dataset.status = delivery.status;
  chip.textContent = STATUS_LABELS[delivery.status] || delivery.status;

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(chip);

  if (showOpenHistory) {
    card.addEventListener("click", () => openHistoryModal(delivery));
  }

  return card;
}

// SSE subscription for the dashboard (channel=all): reload on any domain event.
function subscribeToAllEvents() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`${API_BASE}/events?channel=all`);
  eventSource.onmessage = () => {
    if (!el.tabs.dashboard.hidden) loadDashboard();
    if (!el.tabs.assignment.hidden) loadUnassigned();
  };
}

// --- ADM-3: Assignment ---

async function loadUnassigned() {
  const res = await apiFetch("/admin/deliveries/unassigned");
  const deliveries = await res.json();
  renderUnassigned(deliveries);
}

function renderUnassigned(deliveries) {
  el.unassignedList.innerHTML = "";
  el.unassignedEmptyMessage.hidden = deliveries.length > 0;

  for (const delivery of deliveries) {
    const card = buildDeliveryCard(delivery);
    const assignButton = document.createElement("button");
    assignButton.className = "assign-button";
    assignButton.dataset.testid = `assign-button-${delivery.id}`;
    assignButton.textContent = delivery.driverId ? "Reassign" : "Assign";
    assignButton.addEventListener("click", (e) => {
      e.stopPropagation();
      openAssignModal(delivery);
    });
    card.appendChild(assignButton);
    el.unassignedList.appendChild(card);
  }
}

function openAssignModal(delivery) {
  assignTargetId = delivery.id;
  el.assignModalDeliveryInfo.textContent = `${delivery.trackingNumber} — ${delivery.productName}`;
  el.assignFeedback.hidden = true;
  el.assignModal.hidden = false;
}

el.assignCancelButton.addEventListener("click", () => {
  el.assignModal.hidden = true;
});

el.assignConfirmButton.addEventListener("click", async () => {
  const driverId = el.assignDriverSelect.value;
  if (!driverId) {
    el.assignFeedback.textContent = "Please select a driver.";
    el.assignFeedback.hidden = false;
    return;
  }

  try {
    const res = await apiFetch(`/admin/deliveries/${assignTargetId}/assign`, {
      method: "POST",
      body: JSON.stringify({ driverId: Number(driverId) }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      el.assignFeedback.textContent = body.error || "Could not assign delivery.";
      el.assignFeedback.style.color = "#dc2626";
      el.assignFeedback.hidden = false;
      return;
    }

    el.assignModal.hidden = true;
    await loadUnassigned();
  } catch (err) {
    el.assignFeedback.textContent = err.message || "Network error.";
    el.assignFeedback.hidden = false;
  }
});

// --- Shared: history timeline modal (ADM-2, ADM-5) ---

async function openHistoryModal(delivery) {
  el.historyModalTitle.textContent = `${delivery.trackingNumber} — ${delivery.productName}`;
  const res = await apiFetch(`/admin/deliveries/${delivery.id}/history`);
  const history = await res.json();

  el.historyTimeline.innerHTML = "";
  for (const entry of history) {
    const li = document.createElement("li");
    li.textContent = `${STATUS_LABELS[entry.status] || entry.status} — ${new Date(entry.changedAt).toLocaleString()} (${entry.actor})`;
    el.historyTimeline.appendChild(li);
  }

  el.historyModal.hidden = false;
}

el.historyModalCloseButton.addEventListener("click", () => {
  el.historyModal.hidden = true;
});

// --- ADM-4: Master data ---

async function loadMasterData() {
  await loadReferenceData();
  renderDriverList();
  renderCampList();
}

function renderDriverList() {
  el.driverList.innerHTML = "";
  for (const driver of drivers) {
    const li = document.createElement("li");
    if (!driver.active) li.classList.add("inactive");

    const label = document.createElement("span");
    label.textContent = `${driver.employeeId} — ${driver.name} (${driver.assignedArea})${driver.active ? "" : " [inactive]"}`;

    li.appendChild(label);

    if (driver.active) {
      const deactivateButton = document.createElement("button");
      deactivateButton.textContent = "Deactivate";
      deactivateButton.className = "secondary-button";
      deactivateButton.dataset.testid = `deactivate-driver-button-${driver.id}`;
      deactivateButton.addEventListener("click", async () => {
        await apiFetch(`/admin/drivers/${driver.id}/deactivate`, { method: "POST" });
        await loadMasterData();
      });
      li.appendChild(deactivateButton);
    }

    el.driverList.appendChild(li);
  }
}

function renderCampList() {
  el.campList.innerHTML = "";
  for (const camp of camps) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${camp.name} (${camp.assignedArea})`;
    li.appendChild(label);

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.className = "secondary-button";
    deleteButton.dataset.testid = `delete-camp-button-${camp.id}`;
    deleteButton.addEventListener("click", async () => {
      const res = await apiFetch(`/admin/camps/${camp.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        await loadMasterData();
      }
    });
    li.appendChild(deleteButton);

    el.campList.appendChild(li);
  }
}

el.driverForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.driverFeedback.hidden = true;

  try {
    const res = await apiFetch("/admin/drivers", {
      method: "POST",
      body: JSON.stringify({
        employeeId: el.driverEmployeeId.value.trim(),
        name: el.driverName.value.trim(),
        assignedArea: el.driverArea.value.trim(),
        contact: el.driverContact.value.trim(),
        password: el.driverPassword.value,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showFeedback(el.driverFeedback, body.error || "Could not register driver.", false);
      return;
    }

    el.driverForm.reset();
    showFeedback(el.driverFeedback, "Driver registered.", true);
    await loadMasterData();
  } catch (err) {
    showFeedback(el.driverFeedback, err.message || "Network error.", false);
  }
});

el.campForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.campFeedback.hidden = true;

  try {
    const res = await apiFetch("/admin/camps", {
      method: "POST",
      body: JSON.stringify({ name: el.campName.value.trim(), assignedArea: el.campArea.value.trim() }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showFeedback(el.campFeedback, body.error || "Could not register camp.", false);
      return;
    }

    el.campForm.reset();
    showFeedback(el.campFeedback, "Camp registered.", true);
    await loadMasterData();
  } catch (err) {
    showFeedback(el.campFeedback, err.message || "Network error.", false);
  }
});

function showFeedback(feedbackEl, message, success) {
  feedbackEl.textContent = message;
  feedbackEl.style.color = success ? "#16a34a" : "#dc2626";
  feedbackEl.hidden = false;
}

// --- ADM-5: History ---

async function loadHistory() {
  const params = new URLSearchParams();
  if (el.historyDateFrom.value) params.set("dateFrom", el.historyDateFrom.value);
  if (el.historyDateTo.value) params.set("dateTo", el.historyDateTo.value);
  if (el.historyDriverFilter.value) params.set("driverId", el.historyDriverFilter.value);

  const statusFilter = el.historyStatusFilter.value;
  // History view only shows completed/failed deliveries (ADM-5); if no specific status
  // chosen, fetch both by making two calls and merging, since the API filters by one status.
  let deliveries;
  if (statusFilter) {
    params.set("status", statusFilter);
    const res = await apiFetch(`/admin/deliveries?${params.toString()}`);
    deliveries = await res.json();
  } else {
    const deliveredParams = new URLSearchParams(params);
    deliveredParams.set("status", "delivered");
    const failedParams = new URLSearchParams(params);
    failedParams.set("status", "failed");

    const [deliveredRes, failedRes] = await Promise.all([
      apiFetch(`/admin/deliveries?${deliveredParams.toString()}`),
      apiFetch(`/admin/deliveries?${failedParams.toString()}`),
    ]);
    const delivered = await deliveredRes.json();
    const failed = await failedRes.json();
    deliveries = [...delivered, ...failed].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  renderHistory(deliveries);
}

el.historyFilterButton.addEventListener("click", loadHistory);

function renderHistory(deliveries) {
  el.historyList.innerHTML = "";
  for (const delivery of deliveries) {
    el.historyList.appendChild(buildDeliveryCard(delivery, { showOpenHistory: true }));
  }
}

// --- SYS-2: New delivery creation ---

el.newDeliveryButton.addEventListener("click", () => {
  el.newDeliveryFeedback.hidden = true;
  el.newDeliveryModal.hidden = false;
});

el.newDeliveryCancelButton.addEventListener("click", () => {
  el.newDeliveryModal.hidden = true;
  el.newDeliveryForm.reset();
});

el.newDeliveryForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const res = await apiFetch("/admin/deliveries", {
      method: "POST",
      body: JSON.stringify({
        productName: el.newDeliveryProduct.value.trim(),
        address: el.newDeliveryAddress.value.trim(),
        campId: Number(el.newDeliveryCamp.value),
        requestNote: el.newDeliveryNote.value.trim() || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showFeedback(el.newDeliveryFeedback, body.error || "Could not create delivery.", false);
      return;
    }

    el.newDeliveryModal.hidden = true;
    el.newDeliveryForm.reset();
    await loadDashboard();
  } catch (err) {
    showFeedback(el.newDeliveryFeedback, err.message || "Network error.", false);
  }
});

// --- Init ---

async function initApp() {
  await loadReferenceData();
  await loadDashboard();
  subscribeToAllEvents();
}

(async function init() {
  if (getToken()) {
    try {
      await initApp();
      showAppShell();
      return;
    } catch {
      return;
    }
  }
  showLogin();
})();
