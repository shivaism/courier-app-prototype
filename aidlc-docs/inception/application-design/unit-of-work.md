# Unit of Work — Delivery Tracking & Driver Console

Per approved `unit-of-work-plan.md`, the system decomposes into 4 units of work.

---

## Unit 1: Backend Service

**Type**: Independently deployable service (Node.js + TypeScript)

**Responsibilities**:
- Hosts all 5 Application Design components: Delivery, Auth, Master Data, Realtime, Seed
- Exposes REST API endpoints for all customer/driver/admin actions
- Exposes the single SSE endpoint (`/api/events`) used by all 3 frontends
- Owns the SQLite database
- Serves the 3 frontend units as static files (per Question 2: B) under `/customer`, `/driver`, `/admin` URL paths
- Runs the seed script at startup

**Depends on**: Nothing (leaf unit from a build perspective — must be built first since it serves the frontends)

**Depended on by**: Customer App, Driver App, Admin App (all call its API/SSE and are served by it)

---

## Unit 2: Customer App (Frontend)

**Type**: Logical module (static plain HTML/CSS/JS), served by Backend Service under `/customer`

**Responsibilities**:
- Tracking-number lookup page
- Real-time status timeline view (SSE-connected)
- Delivery request-note editor
- Recent-lookups history (local storage)

**Depends on**: Backend Service (REST API + SSE)

**Depended on by**: Nothing

---

## Unit 3: Driver App (Frontend)

**Type**: Logical module (static plain HTML/CSS/JS), served by Backend Service under `/driver`

**Responsibilities**:
- Driver login page
- Assigned delivery list (mobile-first)
- Delivery status update / completion flow
- Delivery failure/exception reporting flow

**Depends on**: Backend Service (REST API + SSE)

**Depended on by**: Nothing

---

## Unit 4: Admin App (Frontend)

**Type**: Logical module (static plain HTML/CSS/JS), served by Backend Service under `/admin`

**Responsibilities**:
- Admin login page
- Real-time monitoring dashboard (SSE-connected)
- Delivery assignment/reassignment UI
- Driver and camp master-data management UI
- Delivery history view

**Depends on**: Backend Service (REST API + SSE)

**Depended on by**: Nothing

---

## Code Organization Strategy (Greenfield)

Per approved plan (Question 6: A):

```
coupang-aidlc-workshop/
├── backend/                  # Unit 1
│   ├── src/
│   │   ├── components/       # Delivery, Auth, MasterData, Realtime, Seed
│   │   ├── routes/           # API route handlers
│   │   ├── presenters/       # Shared presentation/serialization utility
│   │   ├── db/                # SQLite setup/migrations
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── customer/              # Unit 2 (plain HTML/CSS/JS)
│   ├── driver/                # Unit 3 (plain HTML/CSS/JS)
│   └── admin/                 # Unit 4 (plain HTML/CSS/JS)
└── aidlc-docs/                # Documentation only (never application code)
```

The Backend Service (Unit 1) serves `frontend/customer`, `frontend/driver`, and `frontend/admin` as static file roots at the `/customer`, `/driver`, and `/admin` URL paths respectively (Question 2: B).

## Recommended Unit Build Order

1. **Backend Service** — must exist first since all 3 frontend units depend on its API/SSE and are served by it
2. **Customer App**, **Driver App**, **Admin App** — can be built in any order relative to each other once Backend Service's API contract is stable (no inter-dependencies among the 3 frontend units)

This ordering will carry forward into Code Generation (per-unit loop in CONSTRUCTION phase).
