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

  connectionStatus: document.getElementById("connection-status"),
  liveRegion: document.getElementById("admin-live-region"),
  countDelayed: document.getElementById("count-delayed"),
  dashboardLoading: document.getElementById("dashboard-loading"),
  dashboardError: document.getElementById("dashboard-error"),
  dashboardEmpty: document.getElementById("dashboard-empty"),
  reassignList: document.getElementById("reassign-list"),
  reassignEmptyMessage: document.getElementById("reassign-empty-message"),
  historyLoading: document.getElementById("history-loading"),
  historyError: document.getElementById("history-error"),
  historyEmpty: document.getElementById("history-empty"),

  editModal: document.getElementById("edit-modal"),
  editModalTitle: document.getElementById("edit-modal-title"),
  editForm: document.getElementById("edit-form"),
  editFieldDriver: document.getElementById("edit-field-driver"),
  editFieldCamp: document.getElementById("edit-field-camp"),
  editDriverName: document.getElementById("edit-driver-name"),
  editDriverArea: document.getElementById("edit-driver-area"),
  editDriverContact: document.getElementById("edit-driver-contact"),
  editCampName: document.getElementById("edit-camp-name"),
  editCampArea: document.getElementById("edit-camp-area"),
  editCancelButton: document.getElementById("edit-cancel-button"),
  editFeedback: document.getElementById("edit-feedback"),
};

let editTarget = null; // { type: "driver" | "camp", id: number }
let lastFocusedBeforeModal = null;

const ACTIVE_STATUSES = ["intake", "pickup", "line_haul_loaded", "arrived_at_camp", "out_for_delivery"];

function setConnectionState(state) {
  el.connectionStatus.dataset.state = state;
  el.connectionStatus.textContent =
    state === "live" ? "Live" : state === "reconnecting" ? "Reconnecting…" : state === "offline" ? "Offline" : "";
}

function announce(message) {
  el.liveRegion.textContent = message;
}

function formatTimestamp(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

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
  setConnectionState("idle");
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

  el.tabBar.querySelectorAll(".tab-button").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  button.classList.add("active");
  button.setAttribute("aria-selected", "true");

  const tabName = button.dataset.tab;
  for (const [name, panel] of Object.entries(el.tabs)) {
    panel.hidden = name !== tabName;
  }

  if (tabName === "assignment") void loadUnassigned();
  if (tabName === "history") void loadHistory();
  if (tabName === "masterdata") void loadMasterData();
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

async function loadDashboard({ silent = false } = {}) {
  const params = new URLSearchParams();
  if (el.dashboardCampFilter.value) params.set("campId", el.dashboardCampFilter.value);
  if (el.dashboardDriverFilter.value) params.set("driverId", el.dashboardDriverFilter.value);

  if (!silent) el.dashboardLoading.hidden = false;
  el.dashboardError.hidden = true;
  try {
    const res = await apiFetch(`/admin/deliveries?${params.toString()}`);
    if (!res.ok) {
      el.dashboardError.textContent = "Could not load deliveries. Please retry.";
      el.dashboardError.hidden = false;
      return;
    }
    renderDashboard(await res.json());
  } catch (err) {
    el.dashboardError.textContent = err?.message || "Could not load deliveries.";
    el.dashboardError.hidden = false;
  } finally {
    el.dashboardLoading.hidden = true;
  }
}

el.dashboardCampFilter.addEventListener("change", loadDashboard);
el.dashboardDriverFilter.addEventListener("change", loadDashboard);

function renderDashboard(deliveries) {
  const pending = deliveries.filter((d) => PENDING_STATUSES.includes(d.status)).length;
  const inTransit = deliveries.filter((d) => d.status === "out_for_delivery").length;
  const delivered = deliveries.filter((d) => d.status === "delivered").length;
  const failed = deliveries.filter((d) => d.status === "failed").length;
  // "Delayed" is a truthful derived state from the server (out for delivery past its ETA),
  // not an alias for "failed".
  const delayed = deliveries.filter((d) => d.isDelayed).length;

  el.countPending.textContent = pending;
  el.countInTransit.textContent = inTransit;
  el.countDelivered.textContent = delivered;
  el.countFailed.textContent = failed;
  el.countDelayed.textContent = delayed;

  el.dashboardEmpty.hidden = deliveries.length > 0;
  el.dashboardList.innerHTML = "";

  // Exception-first ordering: failed and delayed deliveries surface above normal traffic.
  const ordered = [...deliveries].sort((a, b) => exceptionRank(b) - exceptionRank(a));
  for (const delivery of ordered) {
    el.dashboardList.appendChild(buildDeliveryCard(delivery, { showOpenHistory: true }));
  }
}

function exceptionRank(delivery) {
  if (delivery.status === "failed") return 2;
  if (delivery.isDelayed) return 1;
  return 0;
}

function buildDeliveryCard(delivery, { showOpenHistory = false, showOutcome = false } = {}) {
  const card = document.createElement("div");
  card.className = "delivery-card";
  card.dataset.testid = `delivery-card-${delivery.id}`;
  if (delivery.status === "failed") card.classList.add("emphasized");
  if (delivery.isDelayed) card.classList.add("delayed");

  const title = document.createElement("div");
  title.className = "delivery-card-title";
  title.textContent = `${delivery.trackingNumber} — ${delivery.productName}`;

  const meta = document.createElement("div");
  meta.className = "delivery-card-meta";
  meta.textContent = `${delivery.address} · Driver: ${driverName(delivery.driverId)}`;

  // Required operational field: when this delivery last actually changed state.
  const lastChange = document.createElement("div");
  lastChange.className = "delivery-card-meta";
  lastChange.dataset.testid = `delivery-card-last-change-${delivery.id}`;
  lastChange.textContent = `Last update: ${formatTimestamp(delivery.lastStatusChangeAt)}`;

  const chipRow = document.createElement("div");
  chipRow.className = "delivery-card-chip-row";

  const chip = document.createElement("span");
  chip.className = "status-chip";
  chip.dataset.status = delivery.status;
  chip.textContent = STATUS_LABELS[delivery.status] || delivery.status;
  chipRow.appendChild(chip);

  if (delivery.isDelayed) {
    const delayedChip = document.createElement("span");
    delayedChip.className = "status-chip delayed-chip";
    delayedChip.dataset.testid = `delayed-chip-${delivery.id}`;
    delayedChip.textContent = "Delayed";
    chipRow.appendChild(delayedChip);
  }
  if (delivery.isRedeliveryTarget) {
    const redeliveryChip = document.createElement("span");
    redeliveryChip.className = "status-chip redelivery-chip";
    redeliveryChip.textContent = "Re-delivery";
    chipRow.appendChild(redeliveryChip);
  }

  card.append(title, meta, lastChange, chipRow);

  if (showOutcome) {
    const outcome = document.createElement("div");
    outcome.className = "delivery-card-meta";
    outcome.dataset.testid = `delivery-card-outcome-${delivery.id}`;
    const reason = delivery.failureReason ? ` · Reason: ${delivery.failureReason.replace(/_/g, " ")}` : "";
    const label = delivery.status === "delivered" ? "Completed" : "Failed";
    outcome.textContent = `${label}: ${formatTimestamp(delivery.outcomeAt)}${reason}`;
    card.appendChild(outcome);
  }

  if (showOpenHistory) {
    const historyButton = document.createElement("button");
    historyButton.type = "button";
    historyButton.className = "card-action-button secondary-button";
    historyButton.dataset.testid = `open-history-button-${delivery.id}`;
    historyButton.textContent = "View status history";
    historyButton.addEventListener("click", () => openHistoryModal(delivery));
    card.appendChild(historyButton);
  }

  return card;
}

/**
 * Authenticated admin-wide stream. EventSource cannot send an Authorization header, so a
 * short-lived one-use ticket is minted from the admin JWT; the server derives the
 * admin-wide channel from that token, so this stream is no longer publicly subscribable.
 */
async function subscribeToAllEvents() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  try {
    const res = await apiFetch("/events/ticket", { method: "POST" });
    if (!res.ok) return;
    const { ticket } = await res.json();

    const source = new EventSource(`${API_BASE}/events?ticket=${encodeURIComponent(ticket)}`);
    eventSource = source;
    let hasConnected = false;

    source.onopen = () => {
      setConnectionState("live");
      // Re-sync after a reconnect since events during the gap were missed.
      if (hasConnected) void refreshActiveTab({ silent: true });
      hasConnected = true;
    };
    source.onmessage = () => {
      setConnectionState("live");
      void refreshActiveTab({ silent: true });
    };
    source.onerror = () => {
      setConnectionState(source.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
      if (source.readyState === EventSource.CLOSED && getToken()) {
        setTimeout(() => {
          if (getToken() && eventSource === source) void subscribeToAllEvents();
        }, 3000);
      }
    };
  } catch {
    setConnectionState("offline");
  }
}

async function refreshActiveTab({ silent = false } = {}) {
  if (!el.tabs.dashboard.hidden) await loadDashboard({ silent });
  if (!el.tabs.assignment.hidden) await loadUnassigned();
  if (!el.tabs.history.hidden) await loadHistory({ silent });
}

// --- ADM-3: Assignment ---

async function loadUnassigned() {
  try {
    const [unassignedRes, allRes] = await Promise.all([
      apiFetch("/admin/deliveries/unassigned"),
      apiFetch("/admin/deliveries"),
    ]);
    if (!unassignedRes.ok || !allRes.ok) return;

    const needsAssignment = await unassignedRes.json();
    const all = await allRes.json();
    const needsAssignmentIds = new Set(needsAssignment.map((d) => d.id));

    // ADM-3 requires reassignment of any delivery, not just unassigned/failed ones.
    const reassignable = all.filter(
      (d) => !needsAssignmentIds.has(d.id) && d.driverId && ACTIVE_STATUSES.includes(d.status)
    );

    renderAssignmentList(el.unassignedList, el.unassignedEmptyMessage, needsAssignment);
    renderAssignmentList(el.reassignList, el.reassignEmptyMessage, reassignable);
  } catch {
    // Session/network handled by apiFetch; connection pill reflects stream state.
  }
}

function renderAssignmentList(listEl, emptyEl, deliveries) {
  listEl.innerHTML = "";
  emptyEl.hidden = deliveries.length > 0;

  for (const delivery of deliveries) {
    const card = buildDeliveryCard(delivery);
    const assignButton = document.createElement("button");
    assignButton.type = "button";
    assignButton.className = "assign-button";
    assignButton.dataset.testid = `assign-button-${delivery.id}`;
    assignButton.textContent = delivery.driverId ? "Reassign" : "Assign";
    assignButton.addEventListener("click", () => openAssignModal(delivery));
    card.appendChild(assignButton);
    listEl.appendChild(card);
  }
}

function openAssignModal(delivery) {
  assignTargetId = delivery.id;
  el.assignModalDeliveryInfo.textContent = `${delivery.trackingNumber} — ${delivery.productName} (current driver: ${driverName(
    delivery.driverId
  )})`;
  el.assignFeedback.hidden = true;
  openModal(el.assignModal, el.assignDriverSelect);
}

/** Accessible dialog helpers: focus in, trap while open, restore on close, Escape to dismiss. */
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

document.addEventListener("keydown", (event) => {
  const modal = [el.assignModal, el.historyModal, el.newDeliveryModal, el.editModal].find((m) => m && !m.hidden);
  if (!modal) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeModal(modal, modal.querySelector("form"));
    return;
  }
  if (event.key !== "Tab") return;

  const focusables = [...modal.querySelectorAll("button, select, input, textarea, [href]")].filter(
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

el.assignCancelButton.addEventListener("click", () => {
  closeModal(el.assignModal);
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

    closeModal(el.assignModal);
    announce("Delivery assigned successfully.");
    await Promise.all([loadUnassigned(), loadDashboard({ silent: true })]);
  } catch (err) {
    el.assignFeedback.textContent = err.message || "Network error.";
    el.assignFeedback.hidden = false;
  }
});

// --- Shared: history timeline modal (ADM-2, ADM-5) ---

async function openHistoryModal(delivery) {
  el.historyModalTitle.textContent = `${delivery.trackingNumber} — ${delivery.productName}`;
  el.historyTimeline.innerHTML = "";
  openModal(el.historyModal, el.historyModalCloseButton);

  try {
    const res = await apiFetch(`/admin/deliveries/${delivery.id}/history`);
    if (!res.ok) {
      const li = document.createElement("li");
      li.textContent = "Could not load status history.";
      el.historyTimeline.appendChild(li);
      return;
    }
    const history = await res.json();

    if (history.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No status history recorded yet.";
      el.historyTimeline.appendChild(li);
      return;
    }

    for (const entry of history) {
      const li = document.createElement("li");
      li.textContent = `${STATUS_LABELS[entry.status] || entry.status} — ${formatTimestamp(entry.changedAt)} (${entry.actor})`;
      el.historyTimeline.appendChild(li);
    }
  } catch {
    const li = document.createElement("li");
    li.textContent = "Could not load status history.";
    el.historyTimeline.appendChild(li);
  }
}

el.historyModalCloseButton.addEventListener("click", () => {
  closeModal(el.historyModal);
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

    const actions = document.createElement("div");
    actions.className = "masterdata-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.className = "secondary-button";
    editButton.dataset.testid = `edit-driver-button-${driver.id}`;
    editButton.addEventListener("click", () => openEditModal("driver", driver));
    actions.appendChild(editButton);

    if (driver.active) {
      const deactivateButton = document.createElement("button");
      deactivateButton.type = "button";
      deactivateButton.textContent = "Deactivate";
      deactivateButton.className = "secondary-button";
      deactivateButton.dataset.testid = `deactivate-driver-button-${driver.id}`;
      deactivateButton.addEventListener("click", async () => {
        const res = await apiFetch(`/admin/drivers/${driver.id}/deactivate`, { method: "POST" });
        if (res.ok) {
          showFeedback(el.driverFeedback, `${driver.name} deactivated.`, true);
          await loadMasterData();
        } else {
          const body = await res.json().catch(() => ({}));
          showFeedback(el.driverFeedback, body.error || "Could not deactivate driver.", false);
        }
      });
      actions.appendChild(deactivateButton);
    }

    li.appendChild(actions);
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

    const actions = document.createElement("div");
    actions.className = "masterdata-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.className = "secondary-button";
    editButton.dataset.testid = `edit-camp-button-${camp.id}`;
    editButton.addEventListener("click", () => openEditModal("camp", camp));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "secondary-button";
    deleteButton.dataset.testid = `delete-camp-button-${camp.id}`;
    deleteButton.addEventListener("click", async () => {
      const res = await apiFetch(`/admin/camps/${camp.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        showFeedback(el.campFeedback, `${camp.name} deleted.`, true);
        await loadMasterData();
        return;
      }
      // A referenced camp now returns a clear 409 instead of a generic server error.
      const body = await res.json().catch(() => ({}));
      showFeedback(el.campFeedback, body.error || "Could not delete camp.", false);
    });
    actions.appendChild(deleteButton);

    li.appendChild(actions);
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

// --- ADM-4: Edit driver / camp ---

function openEditModal(type, record) {
  editTarget = { type, id: record.id };
  el.editFeedback.hidden = true;
  el.editFieldDriver.hidden = type !== "driver";
  el.editFieldCamp.hidden = type !== "camp";

  if (type === "driver") {
    el.editModalTitle.textContent = `Edit driver ${record.employeeId}`;
    el.editDriverName.value = record.name;
    el.editDriverArea.value = record.assignedArea;
    el.editDriverContact.value = record.contact;
    openModal(el.editModal, el.editDriverName);
  } else {
    el.editModalTitle.textContent = `Edit camp ${record.name}`;
    el.editCampName.value = record.name;
    el.editCampArea.value = record.assignedArea;
    openModal(el.editModal, el.editCampName);
  }
}

el.editCancelButton.addEventListener("click", () => {
  editTarget = null;
  closeModal(el.editModal);
});

el.editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editTarget) return;

  const isDriver = editTarget.type === "driver";
  const path = isDriver ? `/admin/drivers/${editTarget.id}` : `/admin/camps/${editTarget.id}`;
  const body = isDriver
    ? {
        name: el.editDriverName.value.trim(),
        assignedArea: el.editDriverArea.value.trim(),
        contact: el.editDriverContact.value.trim(),
      }
    : { name: el.editCampName.value.trim(), assignedArea: el.editCampArea.value.trim() };

  try {
    const res = await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      showFeedback(el.editFeedback, errorBody.error || "Could not save changes.", false);
      return;
    }
    editTarget = null;
    closeModal(el.editModal);
    announce("Record updated.");
    await loadMasterData();
  } catch (err) {
    showFeedback(el.editFeedback, err?.message || "Network error.", false);
  }
});

function showFeedback(feedbackEl, message, success) {
  feedbackEl.textContent = message;
  feedbackEl.style.color = success ? "#16a34a" : "#dc2626";
  feedbackEl.hidden = false;
}

// --- ADM-5: History ---

async function loadHistory({ silent = false } = {}) {
  // The backend now filters and orders completed/failed deliveries by their terminal outcome
  // time (history=true) with inclusive day boundaries, so no client-side merging is needed.
  const params = new URLSearchParams({ history: "true" });
  if (el.historyDateFrom.value) params.set("dateFrom", el.historyDateFrom.value);
  if (el.historyDateTo.value) params.set("dateTo", el.historyDateTo.value);
  if (el.historyDriverFilter.value) params.set("driverId", el.historyDriverFilter.value);
  if (el.historyStatusFilter.value) params.set("status", el.historyStatusFilter.value);

  if (!silent) el.historyLoading.hidden = false;
  el.historyError.hidden = true;
  try {
    const res = await apiFetch(`/admin/deliveries?${params.toString()}`);
    if (!res.ok) {
      el.historyError.textContent = "Could not load delivery history. Please retry.";
      el.historyError.hidden = false;
      return;
    }
    renderHistory(await res.json());
  } catch (err) {
    el.historyError.textContent = err?.message || "Could not load delivery history.";
    el.historyError.hidden = false;
  } finally {
    el.historyLoading.hidden = true;
  }
}

el.historyFilterButton.addEventListener("click", () => void loadHistory());

function renderHistory(deliveries) {
  el.historyList.innerHTML = "";
  el.historyEmpty.hidden = deliveries.length > 0;
  for (const delivery of deliveries) {
    el.historyList.appendChild(buildDeliveryCard(delivery, { showOpenHistory: true, showOutcome: true }));
  }
}

// --- SYS-2: New delivery creation ---

el.newDeliveryButton.addEventListener("click", () => {
  el.newDeliveryFeedback.hidden = true;
  openModal(el.newDeliveryModal, el.newDeliveryProduct);
});

el.newDeliveryCancelButton.addEventListener("click", () => {
  closeModal(el.newDeliveryModal, el.newDeliveryForm);
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

    closeModal(el.newDeliveryModal, el.newDeliveryForm);
    announce("Delivery created.");
    await loadDashboard();
  } catch (err) {
    showFeedback(el.newDeliveryFeedback, err.message || "Network error.", false);
  }
});

// --- Init ---

async function initApp() {
  await loadReferenceData();
  await loadDashboard();
  await subscribeToAllEvents();
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
