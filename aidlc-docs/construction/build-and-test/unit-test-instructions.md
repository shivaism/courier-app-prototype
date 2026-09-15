# Unit Test Execution — Delivery Tracking & Driver Console

## Run Unit Tests

### 1. Execute All Unit Tests
```bash
cd backend
npm test
```
This runs `vitest run` against `backend/tests/`.

### 2. Review Test Results
- **Expected**: 47 tests pass, 0 failures, across 4 test files
- **Test files**:
  - `masterDataService.test.ts` — 8 tests (BR-7: driver/camp CRUD, case-insensitive duplicate checks)
  - `authService.test.ts` — 8 tests (BR-9: login, generic auth failures, deactivated-driver rejection, token verification)
  - `deliveryService.test.ts` — 22 tests (BR-1 through BR-6: status sequencing, completion, failure/re-delivery, request note lockout, assignment, unassigned listing)
  - `deliveryRoutes.test.ts` — 9 integration tests (via `supertest`, exercising the Express app + real routes against an in-memory SQLite DB)
- **Test report location**: printed to stdout by `vitest`; no separate coverage report is configured (not required for this workshop scope)

### 3. Fix Failing Tests
If tests fail:
1. Review the `vitest` output — it prints the failing assertion, expected vs actual, and file/line
2. Identify whether the failure is in application code (`backend/src/`) or the test expectation itself
3. Fix the code issue (or update the test if the story's requirements changed)
4. Rerun `npm test` until all pass

## Verification Performed During Code Generation

This suite was run and confirmed passing (47/47) immediately after Backend Service code generation, and again is expected to pass unchanged since no backend code was modified after that point. Frontend units (Customer/Driver/Admin apps) have no dedicated unit test suite — per the plain HTML/CSS/JS, no-framework approach, their correctness was verified through live integration testing against the running backend instead (see `integration-test-instructions.md`).
