# Components — Delivery Tracking & Driver Console

Per approved plan (Question 1 = D), the system uses a lean 5-component backend design, plus a shared presentation layer at the API boundary.

---

## 1. Delivery Component

**Purpose**: Owns the full lifecycle of a Delivery — status progression, assignment/reassignment, request notes, failure handling, and status history. This is the core domain component.

**Responsibilities**:
- Create deliveries (from seed data or admin-created)
- Look up deliveries by tracking number
- List/filter deliveries (by status, camp, driver, date)
- Advance delivery status through the defined lifecycle (Intake → Pickup → Line-haul loaded → Arrived at camp → Out for delivery → Delivered)
- Record delivery completion details (receipt method, photo URL, completion time)
- Record delivery failures (reason, memo) and flag deliveries as re-delivery targets
- Assign / reassign a delivery to a driver
- Manage delivery request notes, enforcing the edit lockout after "Out for delivery"
- Maintain StatusHistory entries for every status change (write-side; owns the history data even though it's a sub-concern, not a separate component)
- Emit domain events (via the in-process EventEmitter, Question 5) whenever meaningful state changes occur, for Realtime to consume

**Interfaces exposed to route handlers**: CRUD + lifecycle operations (see `component-methods.md`)

---

## 2. Auth Component

**Purpose**: Handles authentication and session management for both Driver and Admin actor types, per the shared-component decision (Question 2).

**Responsibilities**:
- Validate driver login (employee ID + password) and admin login (username + password)
- Hash and verify passwords using bcrypt
- Issue JWTs with actor-type-specific expiry (12h for driver, 16h for admin)
- Validate JWTs on incoming requests and resolve the acting identity (driver or admin) for authorization checks
- Expose a `actorType` distinction internally without requiring separate components

**Interfaces exposed to route handlers**: login, verifyToken, middleware-style request authentication

---

## 3. Master Data Component

**Purpose**: Manages Driver and Camp reference data.

**Responsibilities**:
- Register, edit, and deactivate drivers
- Register, edit, and delete camps
- Enforce required-field validation
- Enforce duplicate checks (employee ID uniqueness, camp name uniqueness)
- Provide driver/camp lookups used by Delivery (e.g., to validate an assignment target) and Auth (e.g., to validate driver login credentials against the Driver record)

**Interfaces exposed to route handlers**: CRUD operations for Driver and Camp

---

## 4. Realtime Component

**Purpose**: Single shared SSE broadcasting component, per the single-endpoint decision (Question 3).

**Responsibilities**:
- Expose one SSE endpoint that customer, driver, and admin frontends all connect to (parameterized by channel: tracking number / driver ID / "all")
- Subscribe to domain events emitted by Delivery (and Master Data, for assignment-relevant changes) via the in-process EventEmitter
- Filter and forward events to connected clients based on their subscribed channel
- Manage client connection lifecycle (register on connect, clean up on disconnect) to support the graceful-reconnect behavior required by SYS-3
- Guarantee event delivery to connected clients within the 2-second target (NFR-1)

**Interfaces exposed to route handlers**: SSE connection handler; internally, an event-subscription API used by other components indirectly through the EventEmitter (not a direct method call)

---

## 5. Seed Component

**Purpose**: Populates initial sample data so the system is demo-ready on startup, per FR-S1.

**Responsibilities**:
- Create a fixed set of sample Camps, Drivers, and Deliveries at startup (or via an explicit seed command)
- Cover a range of delivery statuses so all UI states are demonstrable
- Avoid creating duplicate records on repeated runs (idempotent check, e.g., skip seeding if data already exists)

**Interfaces exposed to route handlers**: None directly — invoked at process startup, not via API. May expose an admin-triggered "reseed" endpoint if convenient, but not required by requirements.

---

## Shared Presentation Layer (Not a Component — a Cross-Cutting Utility)

Per Question 6, address masking, driver-last-name-only display, and other audience-specific data shaping live in a shared serialization utility (`presenters/` or similar) used directly by API route handlers — NOT inside Delivery or Auth. This keeps Delivery/Auth working with full, untransformed domain data at all times.

- `toCustomerDeliveryView(delivery)` — masks address, shows driver last name only, includes photo/receipt info only when Delivered
- `toDriverDeliveryView(delivery)` — full address, full request note, no masking (driver needs the real address to deliver)
- `toAdminDeliveryView(delivery)` — full data, includes internal fields (full driver record, camp, full history reference)
