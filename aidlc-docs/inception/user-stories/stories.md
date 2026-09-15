# User Stories — Delivery Tracking & Driver Console

**Format**: One story per functional requirement (direct traceability to `requirements.md`). Acceptance criteria use bullet-point checklists. All stories follow INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable).

---

## Epic: Customer (Recipient) — Persona: Jamie, the Waiting Recipient

### CUST-1 — Look Up Delivery by Tracking Number
**Maps to**: FR-C1
**As a** recipient, **I want to** look up my delivery by entering my tracking number **so that** I can see its current status without contacting anyone.

**Acceptance Criteria**:
- [ ] A tracking-number input field is the first/primary element on the customer page
- [ ] Submitting a valid tracking number displays: tracking number, product name (summary), masked delivery address, current status, estimated arrival time
- [ ] Submitting an unknown/invalid tracking number shows a clear "not found" message (no system error)
- [ ] Current status is shown with a large, visually distinct badge/icon
- [ ] The looked-up tracking number is saved to browser local storage for the recent-lookups list (see CUST-4)

---

### CUST-2 — View Real-Time Delivery Status Timeline
**Maps to**: FR-C2
**As a** recipient, **I want to** see a live timeline of my delivery's progress **so that** I know exactly where it is without refreshing the page.

**Acceptance Criteria**:
- [ ] Timeline displays all stages in order: Intake → Pickup → Line-haul loaded → Arrived at camp → Out for delivery → Delivered
- [ ] Each completed stage shows its processed timestamp
- [ ] The current stage is visually emphasized (distinct from completed/future stages)
- [ ] Status updates are pushed to the page via SSE without a manual refresh
- [ ] A status change is reflected on screen within 2 seconds of the server event
- [ ] When status is "Out for delivery," the driver's last name and estimated arrival time are shown
- [ ] When status is "Delivered," completion time, receipt method, and proof-of-delivery photo (via image URL) are shown

---

### CUST-3 — Register and Edit Delivery Request Note
**Maps to**: FR-C3
**As a** recipient, **I want to** leave a delivery instruction note **so that** the driver knows how to handle my delivery.

**Acceptance Criteria**:
- [ ] Recipient can select from common preset notes or enter free text
- [ ] The saved note is visible on the driver's delivery detail screen
- [ ] The note can be edited any time before the delivery reaches "Out for delivery" status
- [ ] Once the delivery reaches "Out for delivery" or later, the note field becomes read-only
- [ ] Attempting to edit a locked note shows a clear explanation (e.g., "Delivery is already out — note can no longer be changed")

---

### CUST-4 — View Delivery Lookup History
**Maps to**: FR-C4
**As a** recipient, **I want to** see a list of tracking numbers I've previously looked up **so that** I can quickly revisit them without retyping.

**Acceptance Criteria**:
- [ ] Recent-lookups list is stored in browser local storage and persists across page refresh
- [ ] List visually distinguishes completed deliveries from in-progress ones
- [ ] Clicking a completed delivery shows its final result (completion time, receipt method, photo)
- [ ] Clicking an in-progress delivery navigates back to its live timeline view (CUST-2)

---

## Epic: Delivery Driver — Persona: Alex, the Route Driver

### DRV-1 — Driver Login and Session
**Maps to**: FR-D1
**As a** delivery driver, **I want to** log in with my employee ID and password **so that** I can access my assigned deliveries securely.

**Acceptance Criteria**:
- [ ] Driver can log in with employee ID + password
- [ ] Incorrect credentials show a clear error without revealing whether the ID or password was wrong
- [ ] On successful login, a JWT session token is issued valid for 12 hours
- [ ] Session persists across browser refresh (driver stays logged in)
- [ ] Driver is automatically logged out 12 hours after login
- [ ] Passwords are stored using bcrypt hashing (never plaintext)

---

### DRV-2 — View Assigned Delivery List
**Maps to**: FR-D2
**As a** delivery driver, **I want to** see today's assigned deliveries at a glance **so that** I can plan my route and work through it efficiently.

**Acceptance Criteria**:
- [ ] List shows, per delivery: address, product name (summary), delivery request note, current status
- [ ] List can be filtered by status: Pending / In transit / Delivered / Failed
- [ ] List is sorted by delivery order
- [ ] Clicking a delivery item opens its detail view
- [ ] Remaining delivery count is pinned/visible at the top of the screen at all times
- [ ] All interactive elements meet a minimum touch target size of 44x44px

---

### DRV-3 — Update Delivery Status
**Maps to**: FR-D3
**As a** delivery driver, **I want to** update a delivery's status as I progress **so that** the customer and operations team see accurate real-time information.

**Acceptance Criteria**:
- [ ] Driver can advance a delivery through Pending → In transit → Delivered
- [ ] On marking "Delivered," driver selects a receipt method (in-person / at door / security desk / etc.)
- [ ] On marking "Delivered," driver attaches a proof-of-delivery photo via image URL
- [ ] Completion time is recorded automatically (not manually entered)
- [ ] Driver receives clear success or failure feedback after submitting a status change
- [ ] Each status change creates a StatusHistory entry (timestamp + actor)
- [ ] The status change is propagated to customer and admin views in real time via SSE

---

### DRV-4 — Report Delivery Failure/Exception
**Maps to**: FR-D4
**As a** delivery driver, **I want to** record a delivery failure with a reason **so that** operations knows the delivery needs to be re-attempted.

**Acceptance Criteria**:
- [ ] A dedicated "Delivery Failed" action is available from the delivery detail view
- [ ] Driver must select a failure reason: recipient absent / bad address / receipt refused / other
- [ ] Driver may optionally enter a free-text memo for the failure reason
- [ ] A confirmation popup appears before the failure is finalized
- [ ] On confirmation, the delivery is marked as a "re-delivery target"
- [ ] Driver receives clear success or failure feedback after submitting

---

## Epic: Admin / Operations — Persona: Morgan, the Dispatcher

### ADM-1 — Operations Login and Session
**Maps to**: FR-A1
**As an** operations staff member, **I want to** log in with my username and password **so that** I can access the delivery management system securely.

**Acceptance Criteria**:
- [ ] Staff can log in with username + password
- [ ] Incorrect credentials show a clear error without revealing whether the username or password was wrong
- [ ] On successful login, a JWT session token is issued valid for 16 hours
- [ ] Session persists across browser refresh
- [ ] Staff is automatically logged out 16 hours after login
- [ ] Passwords are stored using bcrypt hashing (never plaintext)
- [ ] Note: login-attempt lockout/rate-limiting is explicitly not implemented in this release (documented gap in requirements.md)

---

### ADM-2 — Real-Time Delivery Monitoring Dashboard
**Maps to**: FR-A2
**As an** operations staff member, **I want to** see a real-time dashboard of all deliveries **so that** I can spot problems and monitor overall health at a glance.

**Acceptance Criteria**:
- [ ] Dashboard shows status aggregate cards: Pending / In transit / Delivered / Failed·Delayed
- [ ] Dashboard shows a per-delivery card or list with: tracking number, address summary, assigned driver, current status, last status-change time
- [ ] Clicking a delivery opens its full status-history timeline
- [ ] Delayed/failed deliveries are visually emphasized (color change and/or animation)
- [ ] Dashboard can be filtered by camp and by driver
- [ ] Status changes are pushed via SSE and reflected within 2 seconds

---

### ADM-3 — Manage Delivery Assignments
**Maps to**: FR-A3
**As an** operations staff member, **I want to** assign and reassign deliveries to drivers **so that** all deliveries (including re-delivery targets) get handled.

**Acceptance Criteria**:
- [ ] Unassigned-delivery list is visible and clearly separated from assigned deliveries
- [ ] Staff can assign a delivery by selecting a driver from a list
- [ ] Staff can reassign an already-assigned delivery to a different driver
- [ ] Staff can reassign deliveries flagged as "re-delivery target"
- [ ] A confirmation popup appears before an assignment/reassignment is finalized
- [ ] On confirmation, results are reflected immediately on driver and customer views
- [ ] Staff receives clear success or failure feedback after the action

---

### ADM-4 — Manage Driver and Camp Master Data
**Maps to**: FR-A4
**As an** operations staff member, **I want to** manage driver and camp records **so that** assignment and delivery data stays accurate.

**Acceptance Criteria**:
- [ ] Staff can register a new driver (employee ID, name, assigned area, contact)
- [ ] Staff can edit an existing driver's information
- [ ] Staff can deactivate a driver (rather than hard-delete)
- [ ] Staff can register a new camp (camp name, assigned area)
- [ ] Staff can edit an existing camp's information
- [ ] Staff can delete a camp
- [ ] Required fields are validated before save (clear error if missing)
- [ ] Duplicate employee ID or duplicate camp name is rejected with a clear error

---

### ADM-5 — View Delivery History
**Maps to**: FR-A5
**As an** operations staff member, **I want to** review completed and failed deliveries **so that** I can audit past performance and investigate issues.

**Acceptance Criteria**:
- [ ] Completed/failed deliveries are listed in reverse chronological order
- [ ] Each entry shows: tracking number, address summary, assigned driver, final status, completion/failure time, failure reason (if applicable)
- [ ] List can be filtered by date, status, and driver
- [ ] Clicking an entry shows its full status-history timeline
- [ ] Status history is persisted in a StatusHistory table, grouped by tracking number

---

## Epic: System / Shared (Non-Persona)

### SYS-1 — Seed Sample Data on Startup
**Maps to**: FR-S1
**As the** system, **I want to** load a set of sample camps, drivers, and deliveries at startup **so that** the platform is immediately demonstrable without manual setup.

**Acceptance Criteria**:
- [ ] A seed script runs on startup (or via an explicit seed command) and populates camps, drivers, and deliveries
- [ ] Seeded data covers a range of statuses (e.g., some Pending, some In transit, some Delivered, some Failed) to demonstrate all UI states
- [ ] Re-running the seed script does not create duplicate records (idempotent, or clearly documented as destructive/reset)

---

### SYS-2 — Manually Create Deliveries via Admin UI
**Maps to**: FR-S2
**As an** operations staff member, **I want to** manually create a new delivery record **so that** deliveries not covered by seed data can still be tracked.

**Acceptance Criteria**:
- [ ] Admin UI provides a form to create a new delivery (tracking number, product name, delivery address, assigned camp, etc.)
- [ ] Required-field validation applies (consistent with ADM-4's validation approach)
- [ ] Newly created delivery immediately appears in the admin dashboard and becomes look-up-able by the customer via its tracking number
- [ ] Duplicate tracking numbers are rejected with a clear error

---

### SYS-3 — Real-Time Update Propagation (SSE Infrastructure)
**Maps to**: NFR-1 (supports CUST-2, DRV-3, ADM-2, ADM-3)
**As the** system, **I want to** push status and assignment changes over Server-Sent Events **so that** all connected customer, driver, and admin views stay in sync without polling.

**Acceptance Criteria**:
- [ ] Backend exposes an SSE endpoint that clients can subscribe to
- [ ] Status changes, assignment changes, and failure events are published as SSE events
- [ ] Subscribed clients receive and render the update within 2 seconds of the server-side change
- [ ] Connection drop is handled gracefully (client can reconnect without losing subsequent updates)

---

## Deferred / Placeholder

### DEFER-1 — Real-Time Delivery Location Map (IMPLEMENTED as optional extension)
**Maps to**: Requirements.md Section 3.5 (originally deferred), original requirement 3.4.1
**Status**: **Implemented** (user requested it explicitly after initial delivery; built per requirements.md 3.5's allowed approach: mock-coordinate simulation, Leaflet + no-API-key tiles, no real GPS).

**As a** recipient, **I want to** see my driver's live location on a map with an ETA **so that** I have a better sense of exactly when the delivery will arrive.

**Acceptance Criteria**:
- [x] Map appears automatically on the customer tracking page once a delivery is "out for delivery"
- [x] Backend simulates truck movement along a curved camp-to-destination route (mock coordinates, no real GPS hardware, no paid/key-issuance map API — per constraints.md's explicit allowance for this feature)
- [x] Truck position pushed over the existing SSE channel (`locationUpdated` event) roughly every 1.5 seconds
- [x] Map renders with a car icon (🏎️, per user's explicit request) that rotates to face the direction of travel
- [x] Route polyline and camp/destination markers shown on the map
- [x] ETA countdown and a progress bar are shown alongside the map, both updating live
- [x] Map hides automatically once the delivery is delivered or a new tracking number is looked up
- [x] Uses Leaflet + CARTO Voyager tiles (open-source, no API key/billing required)

---

## Traceability Summary

| Requirement | Story |
|---|---|
| FR-C1 | CUST-1 |
| FR-C2 | CUST-2 |
| FR-C3 | CUST-3 |
| FR-C4 | CUST-4 |
| FR-D1 | DRV-1 |
| FR-D2 | DRV-2 |
| FR-D3 | DRV-3 |
| FR-D4 | DRV-4 |
| FR-A1 | ADM-1 |
| FR-A2 | ADM-2 |
| FR-A3 | ADM-3 |
| FR-A4 | ADM-4 |
| FR-A5 | ADM-5 |
| FR-S1 | SYS-1 |
| FR-S2 | SYS-2 |
| NFR-1 (SSE) | SYS-3 |
| Deferred map (3.5) | DEFER-1 |

All functional requirements from `requirements.md` are covered by exactly one story, per the approved plan (one story per FR).
