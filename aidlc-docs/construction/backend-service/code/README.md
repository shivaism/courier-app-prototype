# Backend Service — Code Generation Summary

**Application code location**: `backend/` at workspace root (NOT in aidlc-docs/)

## What Was Built

A Node.js + TypeScript + Express backend implementing all 5 Application Design components (Delivery, Auth, Master Data, Realtime, Seed), backed by SQLite (`better-sqlite3`), exposing a REST API and one SSE endpoint, and serving the 3 frontend apps as static files.

## Structure

```
backend/
├── package.json, tsconfig.json, vitest.config.ts, .gitignore
├── src/
│   ├── domain/types.ts              # Delivery, Driver, Camp, StatusHistoryEntry, AdminUser, DomainEvent
│   ├── db/index.ts                  # SQLite connection + schema migrations
│   ├── events/eventBus.ts           # In-process EventEmitter (Delivery -> Realtime decoupling)
│   ├── utils/trackingNumber.ts      # BR-8 tracking number generation
│   ├── utils/errors.ts              # NotFoundError, ValidationError, ConflictError, AuthenticationError
│   ├── services/
│   │   ├── masterDataService.ts     # Driver/Camp CRUD + validation (BR-7)
│   │   ├── authService.ts           # Login, JWT, bcrypt (BR-9)
│   │   ├── deliveryService.ts       # Core lifecycle (BR-1 through BR-6)
│   │   ├── realtimeService.ts       # SSE connection management + event forwarding (BR-10)
│   │   └── seedService.ts           # Startup sample data (SYS-1)
│   ├── presenters/deliveryPresenters.ts  # toCustomerDeliveryView / toDriverDeliveryView / toAdminDeliveryView
│   ├── middleware/auth.ts           # JWT verification middleware
│   ├── routes/
│   │   ├── authRoutes.ts            # POST /api/auth/driver/login, /api/auth/admin/login
│   │   ├── deliveryRoutes.ts        # Customer/driver/admin delivery endpoints
│   │   ├── masterDataRoutes.ts      # Admin driver/camp management endpoints
│   │   └── eventsRoutes.ts          # GET /api/events (SSE)
│   ├── appContext.ts                # Wires DB + all 5 services together
│   └── server.ts                    # Entry point: Express app, static frontend serving, startup seeding
└── tests/
    ├── testDb.ts                    # In-memory SQLite helper for tests
    ├── masterDataService.test.ts    # 8 tests
    ├── authService.test.ts          # 8 tests
    ├── deliveryService.test.ts      # 22 tests
    └── deliveryRoutes.test.ts       # 9 integration tests (via supertest)
```

## API Endpoints

| Method | Path | Auth | Story |
|---|---|---|---|
| POST | `/api/auth/driver/login` | none | DRV-1 |
| POST | `/api/auth/admin/login` | none | ADM-1 |
| GET | `/api/deliveries/lookup/:trackingNumber` | none | CUST-1 |
| GET | `/api/deliveries/lookup/:trackingNumber/history` | none | CUST-2 |
| PATCH | `/api/deliveries/lookup/:trackingNumber/note` | none | CUST-3 |
| GET | `/api/driver/deliveries` | driver | DRV-2 |
| GET | `/api/driver/deliveries/:id` | driver | DRV-2 |
| PATCH | `/api/driver/deliveries/:id/status` | driver | DRV-3 |
| POST | `/api/driver/deliveries/:id/complete` | driver | DRV-3 |
| POST | `/api/driver/deliveries/:id/fail` | driver | DRV-4 |
| GET | `/api/admin/deliveries` | admin | ADM-2, ADM-5 |
| GET | `/api/admin/deliveries/unassigned` | admin | ADM-3 |
| GET | `/api/admin/deliveries/:id/history` | admin | ADM-2, ADM-5 |
| POST | `/api/admin/deliveries/:id/assign` | admin | ADM-3 |
| POST | `/api/admin/deliveries` | admin | SYS-2 |
| GET/POST/PATCH/DELETE | `/api/admin/drivers`, `/api/admin/camps` | admin | ADM-4 |
| GET | `/api/events?channel=tracking\|driver\|all` | none | SYS-3 |

Static frontends served at `/customer`, `/driver`, `/admin`.

## How to Run

```bash
cd backend
npm install
npm run dev     # runs with tsx watch, auto-seeds on first run
# or
npm run build && npm start
```

Server listens on port 3000 by default (override with `PORT` env var). SQLite file created at `backend/delivery-tracking.db`.

## How to Test

```bash
cd backend
npm test
```

## Verification Performed

- `tsc --noEmit`: clean compile, no type errors
- `npm run build`: succeeds
- `vitest run`: **47/47 tests passing** across 4 test files (masterDataService, authService, deliveryService, deliveryRoutes integration)
- Manual smoke test against a running instance: admin login, customer lookup (address masking confirmed), ETA computation confirmed, admin dashboard listing confirmed, SSE connection confirmed

## Known Gaps / Deferred Items (carried from requirements.md / stories.md)

- No admin login-attempt lockout (documented gap)
- `futureRouteRef` field reserved on Delivery for the deferred real-time map feature (DEFER-1) — not populated or used
- Camp deletion does not guard against active deliveries referencing it (documented as an accepted limitation, BR-7)

## Benchmark Upgrade Additions

### New Files
- `src/services/sseTicketService.ts` — mints short-lived, one-use tickets for privileged EventSource connections (native `EventSource` cannot send an `Authorization` header)
- `tests/benchmarkUpgrades.test.ts` — 28 tests for the upgrades below

### New / Changed Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/events/ticket` | driver or admin | Mint a one-use realtime ticket; the channel is derived from the JWT and cannot be chosen by the caller |
| GET | `/api/events?ticket=…` | ticket | Privileged stream (admin-wide or the authenticated driver's channel) |
| GET | `/api/events?channel=tracking&trackingNumber=…` | none | Recipient capability stream; now validates that the tracking number exists |
| GET | `/api/admin/deliveries?history=true` | admin | Terminal deliveries only, filtered/ordered by outcome time with inclusive day bounds |

### Behavioral Changes
- **Driver ownership**: `getDeliveryForDriver` guards status, completion, failure, and the shared detail route. Non-owned IDs return 404 so they cannot be probed.
- **Token revocation**: `requireAuth` rechecks actor status, so deactivating a driver invalidates existing tokens.
- **Re-delivery reset**: reassigning a failed delivery sets a fresh `outForDeliveryAt` and ETA, clears failure fields, records history, and republishes `statusChanged` so live tracking restarts.
- **Operational metadata**: `getOperationalMeta` supplies `lastStatusChangeAt`, `outcomeAt`, and a derived `isDelayed` (out for delivery past its ETA); serialized on every admin view.
- **Driver route order**: `/api/driver/deliveries` returns a stable 1-based `deliveryOrder` computed across the driver's whole route, plus `eta`.
- **Validation**: receipt method and failure reason must be allowed enum values; proof URLs must be HTTP(S); notes and memos have length limits.
- **Master data**: empty required fields are rejected, camp renames cannot collide, and deleting a referenced camp returns 409.
- **SSE health**: streams emit `retry: 2000` and periodic heartbeat comments; connections clean up their heartbeat timers on close.

### External Services
The live map depends on the public no-API-key OSRM routing service, with a deterministic offline fallback. Camp origins and derived destinations are mock coordinates, so no real recipient address is sent to any third party.
