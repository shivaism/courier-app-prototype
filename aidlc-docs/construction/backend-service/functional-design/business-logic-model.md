# Business Logic Model — Backend Service

Consolidated view tying domain entities and business rules to concrete workflows, organized by the 5 components from `application-design.md`.

---

## Delivery Component — Core Workflows

### Workflow: Create Delivery (Seed or Admin-created)
1. Validate required fields present (productName, address, campId)
2. Generate unique `trackingNumber` (BR-8)
3. Set initial `status = intake`, `intakeAt = now`
4. Persist
5. No SSE event required for creation itself (not in any story's acceptance criteria) — first event fires on the next status change or assignment

### Workflow: Advance Status (Driver-initiated, DRV-3)
1. Load delivery by ID
2. Validate current status allows the requested transition (BR-1)
3. Update `status`, set the corresponding stage timestamp
4. Write StatusHistoryEntry (status, now, actor = driver)
5. If transitioning to `out_for_delivery`: compute and set `eta` (BR-6)
6. If transitioning to `delivered`: require and store `receiptMethod` + `proofOfDeliveryPhotoUrl`, set `deliveredAt` (BR-2)
7. Persist
8. Emit `statusChanged` event (trackingNumber, driverId, payload = new status + relevant fields)

### Workflow: Report Failure (Driver-initiated, DRV-4)
1. Load delivery by ID
2. Validate current status = `out_for_delivery` (BR-4)
3. Set `status = failed`, `isRedeliveryTarget = true`, `failureReason`, optional `failureMemo`
4. Write StatusHistoryEntry (status = failed, now, actor = driver)
5. Persist
6. Emit `deliveryFailed` event

### Workflow: Update Request Note (Customer-initiated, CUST-3)
1. Load delivery by tracking number
2. Validate status is NOT in {`out_for_delivery`, `delivered`, `failed`} (BR-3) — reject if locked
3. Update `requestNote`
4. Persist
5. No SSE event required (not needed by any story — driver simply reads the note on their next list fetch)

### Workflow: Assign / Reassign Driver (Admin-initiated, ADM-3)
1. Load delivery by ID
2. Validate target driver exists and is `active = true` (calls Master Data component)
3. Set `driverId`
4. If delivery was `failed` (re-delivery case, BR-4): reset `status = out_for_delivery`, clear `isRedeliveryTarget = false`, write StatusHistoryEntry
5. Persist
6. Emit `assignmentChanged` event

### Workflow: Customer Lookup (CUST-1)
1. Look up delivery by `trackingNumber`
2. If not found: return not-found result (no error thrown, handled by API layer as 404-equivalent)
3. If found: pass through Shared Presentation Utility's `toCustomerDeliveryView` before returning (masking applied at API boundary, not in this component)

### Workflow: List/Filter Deliveries (DRV-2, ADM-2, ADM-5)
1. Query deliveries by provided filter (status, campId, driverId, dateRange)
2. Sort by delivery order (driver view) or reverse-chronological (admin history view) as specified per story
3. Return raw domain objects; presentation shaping happens at the API/route layer per audience

---

## Auth Component — Core Workflows

### Workflow: Driver Login (DRV-1)
1. Look up Driver by `employeeId` (case-insensitive, via Master Data)
2. If not found or `active = false`: return generic auth failure (BR-9)
3. Verify password against `passwordHash` (bcrypt)
4. If invalid: return generic auth failure
5. Issue JWT: `{ actorType: "driver", driverId }`, expiry = 12h

### Workflow: Admin Login (ADM-1)
1. Look up AdminUser by `username`
2. Verify password against `passwordHash` (bcrypt)
3. If invalid: return generic auth failure
4. Issue JWT: `{ actorType: "admin", adminId }`, expiry = 16h

### Workflow: Token Verification (Middleware, all protected routes)
1. Extract JWT from request
2. Verify signature and expiry
3. Resolve `{ actorType, actorId }` for use by route handler / authorization checks

---

## Master Data Component — Core Workflows

### Workflow: Register Driver / Camp (ADM-4)
1. Validate required fields present
2. Check for duplicate `employeeId` / camp `name` (case-insensitive, BR-7)
3. If duplicate: reject with clear error
4. For Driver: hash provided password via Auth component's `hashPassword`
5. Persist

### Workflow: Deactivate Driver / Delete Camp (ADM-4)
1. Deactivate: set `active = false` on Driver — does not touch historical records (BR-7)
2. Delete Camp: remove Camp record (no cascade to Delivery records, BR-7 — deferred guard logic to Code Generation)

---

## Realtime Component — Core Workflow

### Workflow: SSE Connection Lifecycle (SYS-3)
1. Client connects to `/api/events?channel=...` with a channel specifier (tracking number / driverId / "all")
2. RealtimeService registers the connection with its channel filter
3. On any domain event (statusChanged / assignmentChanged / deliveryFailed), RealtimeService checks each open connection's filter and forwards matching events (BR-10)
4. On client disconnect, RealtimeService removes the connection from its registry

---

## Seed Component — Core Workflow

### Workflow: Startup Seeding (SYS-1)
1. Check if any Camp records already exist
2. If none exist: create a small set of sample Camps, Drivers (with bcrypt-hashed passwords), and Deliveries spanning a range of statuses (intake, pickup, out_for_delivery, delivered, failed) so all UI states are demonstrable
3. If Camps already exist: skip seeding (idempotent, per FR-S1's acceptance criteria)

---

## Cross-Component Data Flow Example (End-to-End)

**Scenario**: Driver marks a delivery "Out for delivery"

1. Driver App → `PATCH /api/deliveries/:id/status { status: "out_for_delivery" }`
2. Route handler → `DeliveryService.updateStatus(...)`
3. DeliveryService validates transition (BR-1), computes ETA (BR-6), persists, writes StatusHistoryEntry
4. DeliveryService emits `statusChanged` event on shared EventEmitter
5. RealtimeService (subscribed) receives event, forwards to:
   - Customer App connection filtered by this delivery's `trackingNumber`
   - Admin App connection (unfiltered, receives all)
6. Customer App and Admin App both update their UI within 2 seconds (NFR-1)
