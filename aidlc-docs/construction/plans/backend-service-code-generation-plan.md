# Code Generation Plan — Backend Service

## Unit Context

- **Unit**: Backend Service (Node.js + TypeScript + SQLite)
- **Workspace root**: `/Users/Shiva/Downloads/coupang-aidlc-workshop` (application code goes here, never in `aidlc-docs/`)
- **Code location**: `backend/` at workspace root (per `unit-of-work.md` code organization strategy)
- **Stories implemented**: All 17 stories' server-side logic — CUST-1–4 (API side), DRV-1–4, ADM-1–5, SYS-1–3, DEFER-1 (data-model placeholder only)
- **Dependencies**: None (leaf/first unit)
- **Depended on by**: Customer App, Driver App, Admin App (all 3 will call this unit's REST API + SSE endpoint, and be served as static files by it)
- **Design inputs**: `application-design/` (5 components: Delivery, Auth, Master Data, Realtime, Seed) + `construction/backend-service/functional-design/` (domain entities, business rules BR-1–BR-10, business logic model)

## Technology Choices (within already-approved stack)
- Runtime/Language: Node.js + TypeScript
- Web framework: Express
- Database: SQLite via `better-sqlite3` (synchronous API, simplest for a single-process demo, no async/await ceremony for DB calls)
- Auth: `bcrypt` (hashing), `jsonwebtoken` (JWT)
- Test runner: `vitest` (fast, TS-native, minimal config)
- Dev runner: `tsx` (run TypeScript directly without a separate build step during development)

## Execution Steps

- [x] Step 1: Project Structure Setup — `backend/package.json`, `backend/tsconfig.json`, directory skeleton
- [x] Step 2: Database Layer — SQLite connection + schema creation (`backend/src/db/index.ts`) for Delivery, Driver, Camp, StatusHistoryEntry, AdminUser tables
- [x] Step 3: Domain Types — `backend/src/domain/types.ts` (TypeScript interfaces/enums matching `domain-entities.md`)
- [x] Step 4: Event Bus — `backend/src/events/eventBus.ts` (in-process EventEmitter wrapper per BR-10)
- [x] Step 5: Utilities — `backend/src/utils/trackingNumber.ts` (BR-8), `backend/src/utils/errors.ts` (typed error classes)
- [x] Step 6: Business Logic — Master Data Service (`backend/src/services/masterDataService.ts`) implementing BR-7
- [x] Step 7: Business Logic — Auth Service (`backend/src/services/authService.ts`) implementing BR-9
- [x] Step 8: Business Logic — Delivery Service (`backend/src/services/deliveryService.ts`) implementing BR-1 through BR-6
- [x] Step 9: Business Logic — Realtime Service (`backend/src/services/realtimeService.ts`) implementing BR-10
- [x] Step 10: Business Logic — Seed Service (`backend/src/services/seedService.ts`) implementing SYS-1
- [x] Step 11: Business Logic Unit Tests — `backend/tests/masterDataService.test.ts`, `authService.test.ts`, `deliveryService.test.ts` covering BR-1–BR-10 (38 tests)
- [x] Step 12: Presentation Layer — `backend/src/presenters/deliveryPresenters.ts` (toCustomerDeliveryView / toDriverDeliveryView / toAdminDeliveryView per Application Design Question 6)
- [x] Step 13: Auth Middleware — `backend/src/middleware/auth.ts` (JWT verification middleware)
- [x] Step 14: API Layer — `backend/src/routes/authRoutes.ts` (DRV-1, ADM-1)
- [x] Step 15: API Layer — `backend/src/routes/deliveryRoutes.ts` (CUST-1–3, DRV-2–4, ADM-2,3,5, SYS-2)
- [x] Step 16: API Layer — `backend/src/routes/masterDataRoutes.ts` (ADM-4)
- [x] Step 17: API Layer — `backend/src/routes/eventsRoutes.ts` (SSE endpoint, SYS-3)
- [x] Step 18: API Layer Unit Tests — `backend/tests/deliveryRoutes.test.ts` (9 integration tests using in-memory SQLite + supertest)
- [x] Step 19: Static Frontend Serving + App Wiring — `backend/src/server.ts` (mounts all routes, serves `/customer`, `/driver`, `/admin` static paths per Application Design Question 2)
- [x] Step 20: Startup Seeding Wiring — call `seedService.seedIfEmpty()` on server startup
- [x] Step 21: Documentation — `aidlc-docs/construction/backend-service/code/README.md` summarizing structure, endpoints, and how to run
- [x] Step 22: Deployment Artifacts — `backend/.gitignore` (node_modules, *.db, dist), `backend/package.json` scripts (`dev`, `build`, `start`, `test`)

## Verification Results
- TypeScript compile (`tsc --noEmit`): PASS, no errors
- Build (`npm run build`): PASS
- Test suite (`vitest run`): PASS, 47/47 tests across 4 files
- Manual smoke test (live server): admin login, customer masked lookup, ETA computation, admin dashboard list, SSE connection — all verified working

## Story Traceability

| Step | Stories Covered |
|---|---|
| 6 | ADM-4 |
| 7 | DRV-1, ADM-1 |
| 8 | CUST-1, CUST-3, DRV-2, DRV-3, DRV-4, ADM-2, ADM-3, ADM-5, SYS-2 |
| 9 | SYS-3, supports CUST-2, DRV-3(realtime), ADM-2(realtime) |
| 10 | SYS-1 |
| 12 | CUST-1 (masking), CUST-2 (driver last name) |
| 14 | DRV-1, ADM-1 |
| 15 | CUST-1, CUST-2, CUST-3, DRV-2, DRV-3, DRV-4, ADM-2, ADM-3, ADM-5, SYS-2 |
| 16 | ADM-4 |
| 17 | SYS-3 |

All 17 stories' backend logic is covered across steps 6-17.
