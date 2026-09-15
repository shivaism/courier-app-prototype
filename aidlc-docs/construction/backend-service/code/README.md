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
