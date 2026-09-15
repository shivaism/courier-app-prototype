# Application Design — Delivery Tracking & Driver Console (Consolidated)

This document consolidates `components.md`, `component-methods.md`, `services.md`, and `component-dependency.md` into a single reference. See those files for full detail; this is the summary view.

## Design Decisions (from approved `application-design-plan.md`)

| Decision | Choice |
|---|---|
| Component boundaries | Lean 5-component set: Delivery (incl. assignment + history), Auth, Master Data, Realtime, Seed |
| Auth scope | One shared Auth component, parameterized by actor type (driver/admin) |
| Realtime/SSE design | Single shared Realtime component, one SSE endpoint, filtered by channel |
| Service orchestration | Thin service-per-component, no separate orchestration layer |
| Component communication | Direct synchronous calls for everything except Delivery→Realtime, which uses an in-process EventEmitter |
| Display-transform ownership | Shared presentation/serializer utility at the API boundary, not inside Delivery/Auth |

## Components at a Glance

1. **Delivery Component** — core lifecycle: status, assignment, notes, failure handling, status history
2. **Auth Component** — driver + admin login, JWT issuance/validation, bcrypt
3. **Master Data Component** — Driver and Camp CRUD + validation
4. **Realtime Component** — single SSE endpoint, event forwarding to all 3 frontends
5. **Seed Component** — startup sample-data population

Plus a cross-cutting **Shared Presentation Utility** (not a component) that shapes Delivery data differently per audience (customer/driver/admin).

## Key Method Surface (see `component-methods.md` for full signatures)

- Delivery: createDelivery, getDeliveryByTrackingNumber, listDeliveries, listUnassignedDeliveries, assignDriver, updateStatus, completeDelivery, reportFailure, updateRequestNote, getStatusHistory
- Auth: loginDriver, loginAdmin, verifyToken, hashPassword
- Master Data: createDriver, updateDriver, deactivateDriver, getDriverByEmployeeId, createCamp, updateCamp, deleteCamp, listDrivers, listCamps
- Realtime: handleSseConnection, subscribeToDomainEvents, publish, removeConnection
- Seed: seedIfEmpty

## Dependency Summary (see `component-dependency.md` for full matrix + data flow)

```
MasterDataService (leaf)
   ^                ^
   |                |
AuthService    DeliveryService --(emits events)--> EventEmitter --(subscribed)--> RealtimeService
                    ^
                    |
              SeedService
```

Suggested build order: MasterDataService → AuthService → DeliveryService → RealtimeService → SeedService.

## Coverage Check Against Requirements/Stories

All functional requirements (FR-C1–C4, FR-D1–D4, FR-A1–A5, FR-S1–S2) and the SSE-related NFR/SYS-3 story are addressed by exactly one of the 5 components:

| Requirement Group | Covered By |
|---|---|
| FR-C1, FR-C2, FR-C4 (Customer lookup/tracking/history) | Delivery (data) + Realtime (live updates) + Shared Presentation Utility (masking) |
| FR-C3 (Request note) | Delivery |
| FR-D1 (Driver login) | Auth |
| FR-D2, FR-D3, FR-D4 (Driver list/status/failure) | Delivery |
| FR-A1 (Admin login) | Auth |
| FR-A2 (Monitoring dashboard) | Delivery (data) + Realtime (live updates) |
| FR-A3 (Assignment) | Delivery |
| FR-A4 (Master data) | Master Data |
| FR-A5 (Delivery history) | Delivery |
| FR-S1, FR-S2 (Seed + manual creation) | Seed + Delivery |
| SYS-3 (SSE infra) | Realtime |

No functional requirement is uncovered; no component has zero requirements mapped to it.

## What's Deferred to Later Stages

- **Exact business rule details** (e.g., precise validation error messages, exact status-transition guard conditions) — deferred to Functional Design (CONSTRUCTION phase)
- **Database schema/column-level detail** — deferred to Functional Design
- **File/folder structure and framework-specific wiring** (Express vs Fastify routing, SQLite driver library choice) — deferred to Units Generation / Code Generation
