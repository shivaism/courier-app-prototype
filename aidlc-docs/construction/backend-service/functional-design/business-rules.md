# Business Rules — Backend Service

Detailed, technology-agnostic business rules per confirmed answers in `backend-service-functional-design-plan.md`.

---

## BR-1: Delivery Status Transitions (Q2)

- Status MUST move strictly forward, one step at a time, through: `intake` → `pickup` → `line_haul_loaded` → `arrived_at_camp` → `out_for_delivery` → `delivered`
- Attempting to set a status that skips a stage (e.g., `intake` → `out_for_delivery` directly) is REJECTED with a validation error
- Attempting to move status backward is REJECTED, EXCEPT for the failure/reassignment flow (BR-4)
- `failed` may ONLY be entered from `out_for_delivery`
- Every status transition writes exactly one `StatusHistoryEntry` (status, changedAt, actor)
- Every status transition sets the corresponding timestamp field on Delivery (e.g., transitioning to `pickup` sets `pickupAt`)

## BR-2: Delivery Completion (FR-D3)

- Completion is only valid from `out_for_delivery` (i.e., `updateStatus` to `delivered` requires current status = `out_for_delivery`)
- `completeDelivery` REQUIRES `receiptMethod` and `proofOfDeliveryPhotoUrl` to be provided — REJECTED if either is missing
- `deliveredAt` is set automatically to the current server time; it is never client-supplied

## BR-3: Request Note Editing Lockout (Q3 / FR-C3)

- `requestNote` is editable while `status` is one of: `intake`, `pickup`, `line_haul_loaded`, `arrived_at_camp`
- `requestNote` becomes READ-ONLY (edit attempts REJECTED) once `status` is `out_for_delivery`, `delivered`, or `failed`
- The lockout is derived purely from current `status` — no separate lock flag needs to be persisted

## BR-4: Failure Reporting and Re-delivery (Q4 / FR-D4)

- `reportFailure` is only valid from `out_for_delivery` (mirrors BR-2's precondition, but for the failure path instead of completion)
- On failure: `status` → `failed`, `isRedeliveryTarget` → `true`, `failureReason` and optional `failureMemo` are recorded, a StatusHistoryEntry is written
- A `failed` delivery with `isRedeliveryTarget = true` appears in the Admin unassigned/reassignment view (ADM-3)
- Reassigning a `failed` delivery to a (possibly new) driver: sets `driverId` to the new driver, resets `status` → `out_for_delivery`, clears `isRedeliveryTarget` → `false`, writes a new StatusHistoryEntry
- Note: reassignment does NOT reset `eta` recalculation — ETA was already computed once when it first reached `out_for_delivery` (BR-6); it is not recomputed on re-delivery, consistent with "simple computed value, not real-time recalculation" from constraints.md

## BR-5: Assignment / Reassignment (FR-A3)

- A delivery may be assigned to a driver only from an "unassigned" state (`driverId` is null) OR reassigned from an already-assigned state
- Assigning a delivery to a driver does NOT change its `status` (assignment and status are independent), EXCEPT for the failure/reassignment case in BR-4
- Assignment/reassignment writes a StatusHistoryEntry is NOT required (assignment is not a status change) — however, an `assignmentChanged` domain event IS emitted for Realtime propagation

## BR-6: ETA Computation (Q7)

- `eta` is computed exactly once: at the moment `status` transitions to `out_for_delivery`
- Computation: `eta = outForDeliveryAt + fixedOffset` (fixed offset is a configuration constant, e.g., 2 hours — exact value to be set during Code Generation, not a business-rule-level decision)
- `eta` is never recalculated afterward (not on re-delivery, not periodically) — consistent with constraints.md's exclusion of a "real-time recalculation engine"
- Before `out_for_delivery`, `eta` is null; customer-facing lookup (CUST-1) should indicate "not yet available" rather than showing a null/blank value

## BR-7: Master Data Validation (Q5 / FR-A4)

- Driver `employeeId` and Camp `name` uniqueness checks are CASE-INSENSITIVE (e.g., "EMP001" and "emp001" are treated as duplicates)
- Required fields (all fields listed in `domain-entities.md` except nullable ones) MUST be present and non-empty on create; validation errors REJECT the operation with a clear field-level message
- Deactivating a driver (`active = false`) does NOT delete their historical StatusHistoryEntry records or past Delivery assignments — those remain intact for history/audit purposes (FR-A5)
- Deleting a camp does NOT cascade-delete deliveries that reference it — this is an accepted known limitation for this MVP (out of scope to design camp-delete guards beyond what's in requirements.md); Code Generation may choose to simply block deletion if active deliveries reference the camp, deferred as an implementation detail

## BR-8: Tracking Number Generation (Q8)

- Format: `DT-` followed by 8 random uppercase alphanumeric characters (e.g., `DT-7F3K9QX2`)
- Generation MUST check for collision against existing tracking numbers and regenerate on collision (extremely low probability at demo scale, but the rule should exist)

## BR-9: Authentication (FR-D1, FR-A1)

- Driver login: validate `employeeId` exists and is `active = true`; verify password against `passwordHash` via bcrypt; issue JWT with 12-hour expiry and `actorType = "driver"`
- Admin login: validate `username` exists; verify password against `passwordHash` via bcrypt; issue JWT with 16-hour expiry and `actorType = "admin"`
- Invalid credentials (unknown ID/username OR wrong password) return the SAME generic error message in both cases — do not reveal which part was wrong
- No login-attempt lockout is implemented (documented known gap, per requirements.md)

## BR-10: SSE Event Emission (Q6 / SYS-3)

- All domain events use a single generic envelope: `{ eventType, trackingNumber, driverId?, payload }`
- `eventType` values: `statusChanged`, `assignmentChanged`, `deliveryFailed`
- Events are emitted by DeliveryService via the in-process EventEmitter immediately after a successful, persisted mutation (never before persistence, to avoid broadcasting a change that then fails to save)
- RealtimeService forwards each event only to SSE connections whose subscribed channel matches: customer connections filter by `trackingNumber`, driver connections filter by `driverId`, admin connections receive all events unfiltered
