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
