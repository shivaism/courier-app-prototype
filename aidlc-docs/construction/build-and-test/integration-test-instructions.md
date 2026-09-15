# Integration Test Instructions — Delivery Tracking & Driver Console

## Purpose
Verify that the Backend Service and the 3 frontend units (Customer, Driver, Admin) work together correctly, and that the full delivery lifecycle behaves correctly end-to-end across all 3 personas via the shared API and SSE channel.

## Test Scenarios

### Scenario 1: Backend Service ↔ Static Frontend Serving
- **Description**: Confirm the backend correctly serves all 3 frontend apps as static files
- **Setup**: Start the backend (`npm run dev` or `npm start` in `backend/`)
- **Test steps**: `curl` (or browse to) `http://localhost:3000/customer/`, `/driver/`, `/admin/`, and their respective `app.js`/`styles.css`
- **Expected results**: All return HTTP 200
- **Status**: **Verified during code generation** — confirmed 200 for all 9 files (3 apps × 3 files) against a live instance

### Scenario 2: Full Delivery Lifecycle (Customer → Admin → Driver → Customer)
- **Description**: Exercises the entire status state machine and cross-persona data sharing in one flow
- **Setup**: Backend running with seed data
- **Test steps**:
  1. Customer looks up an `intake` delivery — confirm masked address, editable note
  2. Customer edits the request note — confirm it saves
  3. Admin assigns a driver to the delivery
  4. Driver advances status: `pickup` → `line_haul_loaded` → `arrived_at_camp` → `out_for_delivery`
  5. Customer looks up again — confirm ETA is now set, driver's last name is shown, note is now read-only
  6. Attempt to edit the note again — confirm it's rejected (400)
  7. Driver completes the delivery (receipt method + photo URL)
  8. Customer looks up again — confirm status `delivered`, receipt method, photo URL, and completion time are all present
- **Expected results**: Every step behaves exactly as described; no step should require re-fetching stale data or manual state reconciliation
- **Status**: **Verified live** — ran this exact 8-step sequence against a running instance; all assertions passed (see audit.md entry for Build and Test stage)

### Scenario 3: Failure and Re-delivery Flow
- **Description**: Confirms the failure → re-delivery-target → reassignment → reset-to-out_for_delivery flow
- **Setup**: A delivery already at `out_for_delivery` (or advance one there first)
- **Test steps**:
  1. Driver reports a failure with a reason and optional memo
  2. Confirm delivery status becomes `failed` and `isRedeliveryTarget` becomes `true`
  3. Confirm the delivery appears in Admin's unassigned/re-delivery list
  4. Admin reassigns it to a driver
  5. Confirm status resets to `out_for_delivery`, `isRedeliveryTarget` clears to `false`, and the new `driverId` is set
- **Status**: **Verified live** — confirmed via direct API testing (this specific flow is also covered by `deliveryService.test.ts` unit tests: "resets status to out_for_delivery and clears the flag on reassignment")

### Scenario 4: Real-Time SSE Propagation
- **Description**: Confirms status/assignment changes propagate to subscribed clients within the 2-second target (NFR-1)
- **Setup**: One SSE connection open on `channel=tracking` for a specific delivery
- **Test steps**: Trigger an admin assignment, then a driver status change, while the SSE connection is open; capture the stream
- **Expected results**: Both `assignmentChanged` and `statusChanged` events appear on the open connection, each within well under 2 seconds (SSE push is near-instant over localhost)
- **Status**: **Verified live** — captured both events on an open connection during Customer App code generation testing

## Setup Integration Test Environment

### 1. Start the Backend Service
```bash
cd backend
npm run dev
```

### 2. Access the Frontends
Open a browser (or use `curl`) against:
- `http://localhost:3000/customer`
- `http://localhost:3000/driver` (login: `EMP001` / `driver123`)
- `http://localhost:3000/admin` (login: `morgan` / `admin123`)

## Run Integration Tests

Automated integration coverage lives in `backend/tests/deliveryRoutes.test.ts` (run via `npm test`, part of the unit test suite since it uses an in-memory DB rather than a separately orchestrated environment). The cross-persona scenarios above (2, 3, 4) were validated manually against a live running instance during Build and Test, since they span 3 separate frontend clients that don't have their own automated test runner in this workshop scope.

To re-run Scenario 2/3/4 manually, use `curl` calls against the running backend following the step sequences described above, or exercise the same flows through the 3 browser UIs directly.

### Cleanup
```bash
# Stop the server (Ctrl+C), then remove the SQLite file to reset to a clean seeded state next run:
rm backend/delivery-tracking.db*
```
