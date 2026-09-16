# Courier App Prototype — Delivery Tracking & Driver Console

An early-stage prototype exploring the core workflows of an enterprise delivery platform: customers tracking a parcel, drivers working a delivery route, and operations staff monitoring and assigning deliveries in real time.

This is a **functional proof of concept**, not a production system. It was built to validate the product concept, the delivery state machine, and the real-time update flow end-to-end, so those ideas can be evaluated before investing in a production-grade build.

## What it does

The prototype models a last-mile delivery lifecycle with three connected apps sharing one backend:

- **Customer app** — look up a delivery by tracking number, watch its status update live, leave a delivery note (until it's locked in for dispatch), and follow it on a live map once it's out for delivery.
- **Driver app** — log in, see an assigned worklist ordered as a route, advance a delivery through its stages, and report a failed delivery attempt.
- **Admin / ops console** — a control-tower view of all deliveries, assignment and reassignment (including re-delivery after a failure), master data management (drivers and camps), and delivery history.

A delivery moves through a fixed sequence:

```
intake → pickup → line_haul_loaded → arrived_at_camp → out_for_delivery → delivered
                                                              ↓
                                                            failed → (reassigned, re-delivery)
```

All three apps receive status changes live via Server-Sent Events (SSE), typically within 2 seconds of the change happening.

## Architecture at a glance

- **Backend**: Node.js + TypeScript (Express), single service, SQLite (`better-sqlite3`) for storage, JWT + bcrypt for auth, SSE for real-time push. Organized into 5 components: Delivery, Auth, Master Data, Realtime, and Seed, plus two additions (delivery lookup/inquiry, and a mock GPS location simulator for the live map).
- **Frontend**: three independent static apps (`frontend/customer`, `frontend/driver`, `frontend/admin`) — plain HTML/CSS/JS, no framework or build step. All are served directly by the backend.
- **Data**: a single SQLite file (`backend/delivery-tracking.db`), seeded with sample drivers, camps, and deliveries on first run.

The full design record — requirements, personas, user stories, application design, and business rules — lives under [`aidlc-docs/`](aidlc-docs). It documents an AI-assisted design process (requirements → design → construction) and is worth a look if you want the reasoning behind a decision.

## Experimenting with it

### Prerequisites

- Node.js v18+ (built and verified against v24)
- npm

### Run it locally

```bash
cd backend
npm install
npm run dev
```

This starts the backend on `http://localhost:3000`, auto-creates the SQLite database, and seeds sample data on first run. The three apps are served at:

- Customer: `http://localhost:3000/customer`
- Driver: `http://localhost:3000/driver`
- Admin: `http://localhost:3000/admin`

Seeded login credentials (demo only, not secrets):

| Role | Username / Employee ID | Password |
|---|---|---|
| Driver | `EMP001` or `EMP002` | `driver123` |
| Admin | `morgan` | `admin123` |

A suggested walkthrough:
1. Open the **Admin** app, log in, and note an unassigned delivery's tracking number.
2. Assign it to a driver.
3. Open the **Driver** app in another tab/browser, log in as that driver, and advance the delivery through its stages.
4. Open the **Customer** app in a third tab, look up the tracking number, and watch the status (and, once "out for delivery," the live map) update in real time as the driver advances it.

### Running tests

```bash
cd backend
npm test
```

### Building for a non-dev run

```bash
cd backend
npm run build
npm start
```

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Backend HTTP port |
| `DATABASE_PATH` | `<cwd>/delivery-tracking.db` | SQLite file location |
| `JWT_SECRET` | a hardcoded demo value | JWT signing secret — **must** be overridden before this touches anything beyond a local demo |

## Current status

**Working, locally-runnable, and tested** — this is further along than a throwaway spike, but it is explicitly a prototype, not a foundation to build the real product directly on top of.

What's in place:
- All core customer/driver/admin flows implemented end-to-end, including assignment, status progression, failure and re-delivery, and delivery history.
- A live map on the customer app showing simulated (mock-coordinate) vehicle movement, ETA countdown, and road-snapped routing via a public routing service — not real GPS.
- 75 automated backend tests (unit + integration), all passing, plus a documented round of live end-to-end verification.
- Basic authorization hardening (driver ownership checks, scoped/ticketed SSE streams, token revocation on deactivation).

What's deliberately missing or simplified, and would need real work before this could be called enterprise-grade:

- **No production security posture**: no OAuth/SSO/MFA, no admin login lockout or rate limiting, a hardcoded default JWT secret, no dependency/security scanning.
- **No real infrastructure**: single-process backend, file-based SQLite, no HA, no load balancing, no horizontal scaling, no observability (logging/metrics/tracing) beyond console output — none of the concerns a multi-tenant or high-volume platform would need.
- **No real integrations**: no real GPS or paid mapping/routing provider, no order-management/commerce system, no payments, no push notifications, no real photo upload (proof-of-delivery is a URL only).
- **No formal accessibility or performance validation**: built with WCAG guidance in mind, but not verified with assistive technology or a real audit; no load testing beyond a "handles a few concurrent users on localhost" scale.
- **No deployment story**: local-only by design; there's no CI/CD, container image, or cloud deployment target yet.

In short: the prototype proves out the *product idea and workflow*, and does so with real, tested code — but the backend, security model, and infrastructure would need to be substantially rebuilt (not just hardened) to support enterprise scale, multi-tenancy, or real operational load.

## Repository layout

```
backend/            Node.js + TypeScript API and SSE service
frontend/
  customer/         Customer tracking app
  driver/           Driver worklist app
  admin/            Admin/ops console
  customer-old/     Superseded earlier version of the customer app (kept for reference)
aidlc-docs/          Requirements, design, and construction documentation
```
