# Functional Design Plan — Backend Service

## Unit Context

From `unit-of-work.md`: Backend Service hosts all 5 Application Design components (Delivery, Auth, Master Data, Realtime, Seed), exposes REST API + SSE, owns SQLite, serves the 3 frontend apps as static files.

From `unit-of-work-story-map.md`: Backend Service implements the server-side logic for all 17 stories (CUST-1–4, DRV-1–4, ADM-1–5, SYS-1–3, DEFER-1 data-model-only).

This plan designs the detailed, technology-agnostic business logic: domain entities, business rules, state machines, and data flows — building on the high-level component/method signatures already defined in `application-design/`.

## Execution Checklist

- [x] Confirm domain entity field details (Question 1) — A: requirements.md fields are complete
- [x] Confirm delivery status state machine and transition rules (Question 2) — A: strict sequential
- [x] Confirm request-note edit lockout precise rule (Question 3) — A: locked at "Out for delivery"
- [x] Confirm re-delivery-target / failure-to-reassignment flow (Question 4) — A: "Failed" as explicit status, resets to "Out for delivery" on reassignment
- [x] Confirm validation rules for master data (Question 5) — A: case-insensitive duplicate check
- [x] Confirm SSE event payload/schema approach (Question 6) — A: generic envelope
- [x] Confirm ETA computation approach (Question 7) — B: recalculated once at "Out for delivery"
- [x] Confirm tracking number format/generation (Question 8) — A: system-generated `DT-XXXXXXXX`
- [x] Generate `aidlc-docs/construction/backend-service/functional-design/domain-entities.md`
- [x] Generate `aidlc-docs/construction/backend-service/functional-design/business-rules.md`
- [x] Generate `aidlc-docs/construction/backend-service/functional-design/business-logic-model.md`

## Clarifying Questions

### Question 1: Domain Entity Field Completeness
Based on requirements.md Section 6, the core entities are Delivery, Driver, Camp, StatusHistory, Admin User. Should the field lists in requirements.md be treated as complete, or are there additional fields you want captured now (e.g., delivery creation timestamp, driver's max concurrent deliveries, camp capacity)?

A) Treat requirements.md Section 6 field lists as complete — no additional fields needed for this MVP

B) Add specific additional fields (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: The field lists in requirements.md Section 6 already cover every attribute referenced across all 17 stories' acceptance criteria. Adding speculative fields (driver capacity, camp throughput, etc.) would be scope creep beyond what any story requires for this one-day workshop.

### Question 2: Delivery Status State Machine
The status sequence is: Intake → Pickup → Line-haul loaded → Arrived at camp → Out for delivery → Delivered, with a separate "Failed" outcome. How should the state machine handle transitions?

A) Strictly sequential — status can only move to the next stage in order, one step at a time (no skipping stages); "Failed" can be entered only from "Out for delivery"; a failed delivery can be reset back to a re-deliverable state (e.g., back to "Out for delivery" or a new attempt) once reassigned

B) Flexible — allow jumping stages (e.g., admin can manually set any status at any time for corrections)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: DRV-3's acceptance criteria explicitly describe advancing "Pending → In transit → Delivered" as a progression, and the requirements' customer timeline (CUST-2) is explicitly ordered. A strict sequential state machine is simpler to implement, test, and reason about than open-ended admin overrides, and nothing in the requirements calls for arbitrary status jumps.

### Question 3: Request Note Edit Lockout — Precise Rule
FR-C3 says notes are editable "only before out-for-delivery." Precisely: is the cutoff the moment status becomes "Out for delivery," or does it include "Arrived at camp" as well (i.e., locked slightly earlier)?

A) Locked starting exactly when status = "Out for delivery" (editable through "Arrived at camp")

B) Locked starting when status = "Arrived at camp" (editable only through Intake/Pickup/Line-haul)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: This is the literal reading of requirements.md FR-C3 ("Disable editing the request note after out-for-delivery (in transit)") — no ambiguity to resolve, this is exactly what's written.

### Question 4: Failure → Re-delivery Flow
When a driver reports a failure (DRV-4), the delivery becomes a "re-delivery target." What should its status be at that point, and how does it get back into an active flow?

A) Status becomes "Failed" (a distinct terminal-ish status); admin must explicitly reassign it to a driver, which resets status back to "Out for delivery" for a new attempt

B) Status stays at whatever it was (e.g., "Out for delivery") but a separate boolean flag `isRedeliveryTarget=true` is set; reassignment just changes the driver without resetting status

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: ADM-2's dashboard has a dedicated "Failed·Delayed" status card, implying "Failed" is a distinct, visible status value rather than a hidden flag on an in-transit delivery. Making "Failed" an explicit status is clearer for the admin dashboard aggregate counts and for driver-app filtering (FR-D2 already lists "Failed" as one of the filter options), and cleanly resets to "Out for delivery" on reassignment per ADM-3.

### Question 5: Master Data Validation Rules
For driver/camp required-field and duplicate validation (FR-A4), should validation be case-sensitive or case-insensitive for duplicate checks (e.g., is "CAMP-A" a duplicate of "camp-a")?

A) Case-insensitive duplicate check (recommended — avoids near-duplicate data entry mistakes)

B) Case-sensitive duplicate check (exact string match only)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: Case-insensitive matching prevents accidental near-duplicates (e.g., "CAMP001" vs "camp001") which is a more useful default for operational data entry with no real downside for this system.

### Question 6: SSE Event Payload Schema
What should the SSE event payload structure look like?

A) A generic envelope: `{ eventType: "statusChanged" | "assignmentChanged" | "deliveryFailed", trackingNumber, driverId?, payload: {...} }` — one shape for all event types, frontends filter/handle by eventType

B) Fully distinct payload shape per event type (no shared envelope) — more explicit but more types to maintain

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: A single generic envelope means RealtimeService, and every frontend's SSE listener, only needs to parse one shape and switch on `eventType` — simpler to implement across 3 separate frontend apps than maintaining distinct per-event schemas in each.

### Question 7: ETA Computation
Per constraints.md, ETA uses "a simple computed value" rather than real-time recalculation. What should the computation basis be?

A) Fixed static ETA set at intake time (e.g., a flat "next-day delivery" window or fixed offset from Intake time), never recalculated

B) Recalculated once when a delivery reaches "Out for delivery" (fixed offset from that point, e.g., +2 hours), but not continuously recalculated afterward

X) Other (please describe after [Answer]: tag below)

[Answer]: B

**Recommendation rationale**: CUST-2's acceptance criteria specifically call out showing ETA "when status is Out for delivery," implying the ETA becomes meaningful/accurate at that point (e.g., "arriving within 2 hours"). A one-time recalculation at "Out for delivery" (fixed +N hour offset) is still simple/static per constraints.md's explicit exclusion of a "real-time recalculation engine," while giving a more useful number than a day-one guess made at Intake.

### Question 8: Tracking Number Format
How should tracking numbers be generated/formatted?

A) Simple sequential or random alphanumeric string generated by the system on creation (e.g., `DT-XXXXXXXX`), no external format standard needed

B) I have a specific format in mind (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: No order/commerce system integration exists (per constraints.md), so there's no external tracking-number format to conform to. A simple system-generated format (e.g., `DT-` prefix + random alphanumeric suffix) is sufficient and easy to type/test during a workshop demo.
