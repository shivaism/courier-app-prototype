# Application Design Plan — Delivery Tracking & Driver Console

**Role**: Software Architect

## Context Analysis

From `requirements.md` and `stories.md`, the system needs to support:
- Delivery lifecycle management (status progression, failure handling, re-delivery flagging)
- Two distinct authentication contexts (Driver 12h session, Admin 16h session) with JWT + bcrypt
- Real-time propagation of status/assignment changes to 3 different frontends via SSE
- Master data management (Drivers, Camps)
- Delivery assignment/reassignment
- Status history tracking
- Seed data + manual delivery creation
- Customer-facing read-only lookup + request-note editing (no auth)

This suggests candidate components (subject to your input below):
- **Delivery Service** — core lifecycle, status transitions, failure handling, request notes
- **Auth Service** — driver login, admin login, JWT issuance/validation, bcrypt hashing (shared logic, two contexts)
- **Assignment Service** — assign/reassign deliveries to drivers
- **Master Data Service** — driver and camp CRUD
- **Notification/Realtime Service** — SSE connection management and event broadcasting
- **History Service** — StatusHistory read/write, timeline queries
- **Seed Service** — startup seed data generation

## Execution Checklist

- [x] Confirm component boundaries (Question 1) — D: leaner 5-component set
- [x] Confirm auth component scope (Question 2) — A: one shared Auth component
- [x] Confirm SSE/Realtime component design approach (Question 3) — A: single Realtime component
- [x] Confirm service layer orchestration style (Question 4) — A: thin per-component services
- [x] Confirm component communication pattern (Question 5) — B: in-process EventEmitter
- [x] Confirm display-transform logic ownership (Question 6) — B: shared presentation/serializer utility
- [x] Generate `aidlc-docs/inception/application-design/components.md`
- [x] Generate `aidlc-docs/inception/application-design/component-methods.md`
- [x] Generate `aidlc-docs/inception/application-design/services.md`
- [x] Generate `aidlc-docs/inception/application-design/component-dependency.md`
- [x] Generate `aidlc-docs/inception/application-design/application-design.md` (consolidated)

## Clarifying Questions

### Question 1: Component Boundaries
Given the candidate components listed above (Delivery, Auth, Assignment, Master Data, Realtime, History, Seed), does this grouping make sense, or would you prefer a different split?

A) Use the candidate grouping as-is (7 components as listed above)

B) Merge Assignment into Delivery Service (assignment is just another delivery field/status change)

C) Merge History into Delivery Service (status history is tightly coupled to delivery lifecycle)

D) Both B and C — a leaner set (Delivery [incl. assignment + history], Auth, Master Data, Realtime, Seed)

X) Other (please describe after [Answer]: tag below)

[Answer]: D

**Recommendation rationale**: For a one-day workshop, 5 components is easier to build and reason about than 7. Assignment is really just "set/change the assigned driver on a Delivery," and StatusHistory is written every time Delivery's status changes — both are natural sub-responsibilities of Delivery Service rather than standalone components with their own APIs. Fewer components = fewer files, fewer cross-component calls, less boilerplate, without losing any capability from requirements.md.

### Question 2: Auth Component Scope
Driver and Admin have different session lengths (12h vs 16h) and different credential fields (employee ID vs username), but both use JWT + bcrypt. Should this be one shared Auth component or two separate ones?

A) One shared Auth component parameterized by "actor type" (driver/admin) with different session durations

B) Two separate components (DriverAuth, AdminAuth) sharing a common utility module for JWT/bcrypt

C) One shared Auth component, no distinction needed beyond a role field

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: One Auth Service with an `actorType: "driver" | "admin"` parameter avoids duplicating login/JWT/bcrypt logic while still cleanly supporting the different session lengths and credential field names per type. Simpler than two components, and simpler than option C which would blur the distinct credential shapes (employee ID vs. username).

### Question 3: Realtime/SSE Component Design
How should the SSE broadcasting be structured?

A) A single shared Realtime component that all three frontends connect to (one SSE endpoint, events tagged by relevance — e.g., by tracking number, by driver, or broadcast-all for admin), with other services publishing events into it

B) Separate SSE endpoints/channels per audience (one for customer-per-tracking-number, one for driver-per-driver, one for admin-global)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: One Realtime component with one SSE endpoint (e.g., `/api/events?channel=...`) is simpler to implement and test than three separate SSE implementations. It can still scope events by query param (tracking number for customer, driverId for driver, "all" for admin) — same component, different subscription filters. Meets the 2-second update requirement (NFR-1/SYS-3) for all three audiences with one code path.

### Question 4: Service Layer Orchestration
Should there be a distinct "service layer" that orchestrates components, or should components be called directly from API route handlers?

A) Thin service layer per component (e.g., DeliveryService wraps DeliveryRepository + business rules), called directly by route handlers — no separate orchestration layer needed since this is a single backend unit, not multiple microservices

B) Dedicated orchestration/application-service layer above component services, for cross-component workflows (e.g., an "AssignDeliveryWorkflow" that touches Delivery + Realtime + History)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: This is a single backend process serving a demo-scale MVP — an extra orchestration layer on top of already-thin services would add ceremony without real benefit. Route handlers can call DeliveryService.updateStatus(), which internally calls RealtimeService.publish() — that's simple enough not to need a dedicated workflow layer.

### Question 5: Component Communication Pattern
Within the single backend process, how should components talk to each other?

A) Direct in-process function/method calls (simplest — no message broker, no event bus; appropriate for a single-process MVP)

B) Lightweight in-process event emitter (e.g., Node's EventEmitter) so components like Realtime can subscribe to Delivery/Assignment changes without tight coupling

X) Other (please describe after [Answer]: tag below)

[Answer]: B

**Recommendation rationale**: Direct calls (A) are simpler line-count-wise, but Delivery Service would otherwise need a hard import/dependency on Realtime Service for every mutation (status update, assignment, failure) — three call sites minimum. A tiny EventEmitter-based publish (`deliveryEvents.emit("statusChanged", ...)`) that Realtime subscribes to keeps Delivery Service decoupled from "who's listening," which matches the fact that constraints.md explicitly calls out SSE as the simplified replacement for a message-queue architecture — this is a lightweight, workshop-appropriate version of that same idea. Still zero external dependencies (built into Node.js).

### Question 6: Display-Transform Logic Ownership (e.g., Address Masking)
The customer view requires a "masked" delivery address, and driver-facing views show only the driver's last name. Where should this transformation logic live?

A) In the Delivery/Auth component itself — the service returns already-masked data when serving the customer-facing API, full data for internal/admin API

B) In a shared presentation/serialization utility used by API route handlers, applied per audience regardless of which service returns the raw data

X) Other (please describe after [Answer]: tag below)

[Answer]: B

**Recommendation rationale**: Delivery Service should always work with full, untransformed data internally (e.g., driver reassignment needs the full address, not a masked one). Masking/last-name-only are purely presentation concerns tied to "who is asking," so a shared serializer (e.g., `toCustomerView(delivery)`, `toDriverView(delivery)`, `toAdminView(delivery)`) called from route handlers keeps that logic in one place and keeps Delivery Service audience-agnostic.
