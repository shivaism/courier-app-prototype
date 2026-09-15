# Delivery Tracking & Driver Console — Requirements

## 1. Intent Analysis

- **User Request**: Build a delivery tracking platform (from `requirements/delivery-tracking-requirements.md`) covering a customer tracking UI, a driver console, and an admin/control-tower UI, with real-time status updates via SSE, plus explicit exclusions (`requirements/delivery-tracking-constraints.md`) marking this as a one-day-workshop learning MVP rather than a production system.
- **Request Type**: New Project (Greenfield)
- **Scope Estimate**: System-wide — 3 frontend UIs + 1 backend API/SSE service + 1 data store
- **Complexity Estimate**: Moderate — no single piece is algorithmically complex, but the system spans multiple user roles, real-time updates, and several entities with status-history tracking

## 2. Technology & Architecture Decisions

These decisions were confirmed via `requirement-verification-questions.md`:

| Decision | Choice |
|---|---|
| Backend language/framework | Node.js + TypeScript (Express or Fastify) |
| Frontend | Plain HTML/CSS/JavaScript, no framework |
| Data store | SQLite (file-based) |
| Project structure | Single repo; separate backend service and frontend build(s) |
| Seed/sample data | Pre-loaded seed script AND admin UI form for manual creation |
| Optional real-time map (req. 3.4.1) | Data model/hooks designed now; map UI itself deferred (not built in this pass) |
| Scale target | Demo-scale (dozens of deliveries/drivers, single-digit concurrent users) |
| Deployment target | Local development only (localhost) |
| Admin login lockout | Not implemented — documented as a known gap |
| Security Baseline extension | Disabled (not enforced) |
| Resiliency Baseline extension | Disabled (not enforced) |
| Property-Based Testing extension | Disabled (not enforced) |

### Assumption — Frontend Structure
The requirements define 3 distinct interfaces (Customer, Driver, Admin) with different audiences and UX needs (e.g., driver is mobile-first, admin is dashboard-style). Given the "plain HTML/CSS/JS, separate frontend build(s) from backend" answer, the assumed structure is:
- One backend service (Node.js + TypeScript) exposing REST APIs + an SSE endpoint, backed by SQLite.
- Three independent static frontend apps (customer, driver, admin), each plain HTML/CSS/JS, living side by side in the same repo, all calling the same backend API/SSE endpoints.

This will be finalized in Workflow Planning / Application Design if a different split is preferred.

## 3. Functional Requirements

### 3.1 Customer (Recipient) Features
- **FR-C1 Delivery Lookup**: Look up a delivery by tracking number; display tracking number, product name summary, masked delivery address, current status, and estimated arrival time. Store looked-up tracking numbers in browser local storage for a recent-lookups list.
- **FR-C2 Real-Time Status Timeline**: Display status timeline (Intake → Pickup → Line-haul loaded → Arrived at camp → Out for delivery → Delivered) with per-stage timestamps and current-stage emphasis. Updates pushed via SSE and reflected within 2 seconds. On "out for delivery," show driver last name and ETA. On "delivered," show completion time, receipt method, and proof-of-delivery photo (via image URL).
- **FR-C3 Delivery Request Note**: Customer can select/enter a delivery request note. Editable only before the delivery reaches "out for delivery" status; becomes read-only after. Saved note is visible on the driver's screen.
- **FR-C4 Delivery History**: Client-side (local storage) list of recently looked-up tracking numbers, persisted across refresh, distinguishing completed vs. in-progress; clicking a completed item shows final result (completion time, receipt method, photo).

### 3.2 Delivery Driver Features
- **FR-D1 Driver Login/Session**: Employee ID + password login. JWT-based session, 12-hour expiry, persists across browser refresh, automatic logout after expiry. Passwords stored with bcrypt hashing.
- **FR-D2 Assigned Delivery List**: Today's delivery list showing address, product summary, request note, current status. Filterable by status (Pending / In transit / Delivered / Failed). Sorted by delivery order. Detail view on click. Mobile-first UI, minimum 44x44px touch targets, remaining-count pinned at top.
- **FR-D3 Delivery Status Update**: Advance status Pending → In transit → Delivered. On completion: select receipt method, attach proof-of-delivery photo via image URL, auto-record completion time. Each change writes a StatusHistory entry (timestamp + actor) and propagates to customer/admin views in real time via SSE, with success/failure feedback to the driver.
- **FR-D4 Delivery Failure/Exception Handling**: Failure button; select reason (recipient absent / bad address / receipt refused / other); optional memo; marks delivery as a re-delivery target; confirmation popup; success/failure feedback.

### 3.3 Admin (Operations / Control-Tower) Features
- **FR-A1 Operations Login/Session**: Username + password login. JWT-based session, 16-hour expiry, persists across refresh, automatic logout after expiry. Passwords stored with bcrypt hashing. (Login attempt limiting is a documented known gap — not implemented in this MVP.)
- **FR-A2 Real-Time Delivery Monitoring**: Dashboard with status aggregate cards (Pending / In transit / Delivered / Failed·Delayed) and a per-delivery card/list view (tracking number, address summary, assigned driver, current status, last status-change time). Clicking a delivery opens its status-history timeline. Delayed/failed deliveries are visually emphasized. Filterable by camp / driver. Updates via SSE within 2 seconds.
- **FR-A3 Delivery Assignment Management**: View unassigned deliveries; assign to a selected driver; reassign; reassign re-delivery-target items; confirmation popup; results reflected on driver/customer views; success/failure feedback.
- **FR-A4 Master Data Management**: Drivers — register (employee ID, name, area, contact), edit, deactivate. Camps — register (name, area), edit, delete. Required-field validation and duplicate checks on employee ID / camp name.
- **FR-A5 Delivery History**: Reverse-chronological list of completed/failed deliveries (tracking number, address summary, driver, final status, completion/failure time, failure reason). Filterable by date/status/driver. Status-history timeline on click. Status history stored in a StatusHistory table, grouped by tracking number.

### 3.4 Data Seeding
- **FR-S1**: A seed script creates an initial set of sample camps, drivers, and deliveries at startup so the system is immediately demonstrable.
- **FR-S2**: The Admin UI additionally supports creating new deliveries manually (since there is no real order-system integration).

### 3.5 Deferred / Out of Scope for This Pass
- **Real-time delivery location map** (req. 3.4.1): data model should accommodate future mock-coordinate/route storage, but the map UI, simulator, and SSE location-push are NOT built in this implementation pass.

## 4. Non-Functional Requirements

- **NFR-1 Real-Time Update Latency**: Status changes must be reflected in connected clients within 2 seconds via SSE.
- **NFR-2 Session Management**: Driver sessions expire after 12 hours; admin sessions after 16 hours. JWT-based, session persists across browser refresh.
- **NFR-3 Password Security**: All stored passwords (driver, admin) are hashed with bcrypt. No plaintext password storage.
- **NFR-4 Mobile Usability (Driver)**: Driver UI is mobile-first; interactive elements are at least 44x44px.
- **NFR-5 Data Persistence**: All delivery, driver, camp, and status-history data is persisted in SQLite and survives normal application restarts (this supersedes the "in-memory" option that was not chosen).
- **NFR-6 Scale**: Designed for demo-scale usage only — dozens of deliveries/drivers, single-digit concurrent users. No load-balancing, sharding, or HA design is required.
- **NFR-7 Deployment**: Runs entirely on localhost for this MVP; no cloud deployment required.
- **NFR-8 Accessibility (baseline)**: Status information should be distinguishable by more than color alone (e.g., icon/text plus color) given the "large badge/icon" and "visual emphasis" requirements — avoid color-only signaling of delayed/failed state.
- **NFR-9 No Advanced Auth**: OAuth/social login, MFA, and biometric/device-fingerprint identity verification are explicitly out of scope (per constraints doc).

## 5. Explicit Exclusions (from constraints document)

The following are confirmed OUT OF SCOPE for this project (see `requirements/delivery-tracking-constraints.md` for full detail):
1. Real GPS hardware tracking, paid/key-issuance map APIs, route optimization, real-time ETA recalculation engines (mock-coordinate map is optional/deferred per Section 3.5 above).
2. OAuth/social login, MFA, biometric/device verification, full PII-regulation compliance.
3. Actual photo upload/storage (image URLs only), image resizing, CMS.
4. Push/SMS/email/IVR notifications.
5. Payment/settlement/refund processing.
6. Forecasting, camp inventory, vehicle management, automated SLA escalation, returns/exchange pickup.
7. Analytics dashboards, revenue/cost reporting, anomaly detection.
8. Integration with real courier systems, order/commerce systems, address validation APIs, seller systems, HR systems.
9. Production-scale NFRs: load balancing, sharding, multi-region HA/DR, message-queue architecture, audit/compliance logging.

## 6. Core Data Entities (High-Level)

- **Delivery**: tracking number, product name, delivery address (+ masked view), status, request note, assigned driver, camp, ETA, receipt method, completion time, proof-of-delivery photo URL, failure reason/memo, re-delivery-target flag, timestamps.
- **Driver**: employee ID, name, password hash, assigned area, contact, active/deactivated flag.
- **Camp**: name, assigned area.
- **StatusHistory**: tracking number reference, status value, changed-at timestamp, actor (driver/system/admin).
- **Admin User**: username, password hash.

Exact schema/fields will be finalized during Application/Functional Design.

## 7. Known Gaps (Documented, Accepted)

- No admin login attempt limiting / lockout policy in this MVP.
- Real-time location map UI is deferred; only data-model accommodations are made now.

## 8. Glossary

- **MVP**: Minimum Viable Product
- **SSE**: Server-Sent Events (real-time one-way communication from server to client)
- **Tracking number**: The unique number identifying an individual delivery
- **Camp**: Regional logistics hub where a driver receives goods and begins delivery
- **Pickup**: Collecting goods from the seller/fulfillment center
- **Line-haul**: Large-scale transport between fulfillment centers
- **Last mile**: Delivery leg from the camp to the final recipient
- **Re-delivery target**: A delivery that must be re-attempted due to a failure

## 9. Benchmark-Driven Product Requirements (Required)

These requirements supersede conflicting earlier “deferred” or completeness statements. Rationale and official benchmark sources are documented in `benchmark-analysis.md`.

### 9.1 Customer Experience

- **FR-B1 Unified Live Tracking**: When a delivery is out for delivery, show a road-snapped live map, current vehicle position/direction, route progress, ETA timestamp, and one persistent countdown shared by detail and map views.
- **FR-B2 Time-State Clarity**: Countdown states are `Arriving in …`, `Arriving soon`, and `ETA passed — driver is still on the way`; never leave the UI at an unexplained `0s`.
- **FR-B3 Live Connection Recovery**: Show connected/reconnecting status. On reconnect, refetch delivery and location snapshots before processing later events.
- **FR-B4 Instruction Integrity**: The custom textarea is canonical. Selecting a preset copies into it; later custom edits are never overwritten by stale select state. Once locked, hide all editing controls and show only the saved note or an explicit no-note message.
- **FR-B5 Fresh Recent Lookups**: Refresh recent lookup statuses when the customer page loads. Preserve entries if refresh fails and identify status as last known.
- **FR-B6 Customer Accessibility**: Recent lookup rows are keyboard operable. Dynamic status/connection/countdown feedback uses appropriate live-region semantics. Focus is visible, layout reflows on narrow screens, and nonessential animation respects reduced-motion preferences.

### 9.2 Driver Experience

- **FR-B7 Assignment Authorization**: Drivers can read and mutate only deliveries assigned to their authenticated driver identity.
- **FR-B8 Realtime Driver Worklist**: Driver assignments/status changes refresh over an authenticated realtime stream with visible connection state and snapshot recovery.
- **FR-B9 Actionable Delivery Cards**: Driver cards show delivery order, product, full address, request-note summary, and status. Remaining count is accurate and controls meet minimum touch-target guidance.
- **FR-B10 Session Integrity**: Client schedules automatic logout from JWT expiry; protected backend requests reject deactivated drivers even if a previously issued token has not expired.
- **FR-B11 Validated Outcomes**: Receipt methods and failure reasons must be allowed enum values. Proof URLs must be HTTP(S); note and memo inputs have documented length limits.

### 9.3 Operations Experience

- **FR-B12 Accurate Monitoring**: Dashboard cards and delivery rows include last status-change time. Delayed is a truthful derived state, not an alias for failed.
- **FR-B13 Complete Assignment Management**: Operations can assign or reassign any eligible delivery, including failed/re-delivery targets, with confirmation and visible success/error feedback.
- **FR-B14 Complete Master Data**: Operations can create/edit/deactivate drivers and create/edit/delete camps. Referenced-camp deletion returns a clear conflict rather than a server error.
- **FR-B15 Correct Delivery History**: Completed/failed history is ordered and filtered by outcome time, uses inclusive date boundaries, and displays outcome timestamp and failure reason.
- **FR-B16 Operations Accessibility**: Tabs, delivery cards, dialogs, forms, status messages, and exception emphasis are keyboard/screen-reader accessible; responsive and reduced-motion rules apply.

### 9.4 Platform and Realtime

- **FR-B17 Privileged SSE Authorization**: Admin-wide and driver-specific SSE channels require a short-lived stream ticket minted from a valid JWT. Customer tracking streams remain scoped by tracking number.
- **FR-B18 SSE Health and Recovery**: Streams send retry guidance and periodic heartbeat comments. Clients expose connection state and refetch current snapshots when reconnected.
- **FR-B19 Re-delivery Attempt Reset**: Reassigning a failed delivery creates a fresh out-for-delivery attempt timestamp and ETA, clears stale failure outcome fields as appropriate, records history, and restarts live-map simulation.
- **FR-B20 Realtime Event Safety**: Privileged streams expose only data appropriate to the authenticated actor; driver stream identity is bound to the ticket and cannot be selected arbitrarily.

### 9.5 Non-Functional UX Requirements

- **NFR-B1 Accessibility Target**: Aim for WCAG 2.2 AA behavior within workshop scope: visible focus, status announcements, keyboard operation, responsive reflow, reduced motion, and minimum target sizes.
- **NFR-B2 Realtime Perception**: State changes remain visible within 2 seconds on localhost, and connection loss is explicitly communicated.
- **NFR-B3 Trust**: Operational delivery content is never obscured by sponsored content. Sponsored content remains clearly labeled and separate from driver identity.
- **NFR-B4 External-Service Disclosure**: Documentation identifies CARTO/OSM tiles, Leaflet CDN, OSRM route requests, and third-party proof-image URL behavior; mock coordinates never represent real GPS collection.
