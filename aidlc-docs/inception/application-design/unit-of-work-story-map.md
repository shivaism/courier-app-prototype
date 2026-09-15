# Unit of Work Story Map — Delivery Tracking & Driver Console

Maps every story from `aidlc-docs/inception/user-stories/stories.md` to the unit(s) responsible for implementing it.

## Backend Service — All Stories (API/Business Logic Side)

The Backend Service implements the server-side logic for every story, since it owns all 5 components (Delivery, Auth, Master Data, Realtime, Seed). Frontend units implement the corresponding UI.

| Story | Backend Responsibility |
|---|---|
| CUST-1 | Lookup API endpoint (Delivery component) |
| CUST-2 | Status/timeline API + SSE events (Delivery + Realtime components) |
| CUST-3 | Request-note update API with lockout rule (Delivery component) |
| CUST-4 | N/A — purely client-side (local storage); backend just serves lookup data already covered by CUST-1 |
| DRV-1 | Driver login API, JWT issuance (Auth component) |
| DRV-2 | Delivery list API with filters (Delivery component) |
| DRV-3 | Status update / completion API + SSE events (Delivery + Realtime components) |
| DRV-4 | Failure-report API (Delivery component) |
| ADM-1 | Admin login API, JWT issuance (Auth component) |
| ADM-2 | Dashboard aggregate/list API + SSE events (Delivery + Realtime components) |
| ADM-3 | Assignment/reassignment API + SSE events (Delivery component + Realtime) |
| ADM-4 | Driver/camp CRUD API (Master Data component) |
| ADM-5 | History API with filters (Delivery component) |
| SYS-1 | Seed script (Seed component) |
| SYS-2 | Manual delivery creation API (Delivery component) |
| SYS-3 | SSE endpoint and event infrastructure (Realtime component) |
| DEFER-1 | Data model accommodation only (reserve a field on Delivery for future route/coordinate reference) — no active implementation |

## Customer App — Frontend Stories

| Story | Frontend Responsibility |
|---|---|
| CUST-1 | Lookup input UI, result display (tracking#, product, masked address, status badge, ETA) |
| CUST-2 | Timeline UI with SSE subscription, current-stage emphasis, driver-name/photo display |
| CUST-3 | Request-note input/edit UI, read-only state after lockout |
| CUST-4 | Recent-lookups list UI backed by local storage |

## Driver App — Frontend Stories

| Story | Frontend Responsibility |
|---|---|
| DRV-1 | Login form UI, JWT storage/session handling in browser |
| DRV-2 | Mobile-first delivery list UI, status filter, remaining-count header |
| DRV-3 | Status update UI, completion form (receipt method, photo URL), success/failure feedback |
| DRV-4 | Failure button/form UI, reason selection, confirmation popup |

## Admin App — Frontend Stories

| Story | Frontend Responsibility |
|---|---|
| ADM-1 | Login form UI, JWT storage/session handling in browser |
| ADM-2 | Dashboard UI (aggregate cards, delivery list/cards, SSE subscription, visual emphasis for delayed/failed) |
| ADM-3 | Unassigned list UI, driver-selection assignment UI, confirmation popup |
| ADM-4 | Driver/camp management forms (register/edit/deactivate/delete) |
| ADM-5 | History list UI with filters, timeline detail view |

## Coverage Validation

- All 17 stories from `stories.md` (CUST-1–4, DRV-1–4, ADM-1–5, SYS-1–3, DEFER-1) are mapped to at least one unit.
- Every story with a UI component appears in exactly one frontend unit (no story duplicated across Customer/Driver/Admin).
- Every story with server-side logic appears in the Backend Service row.
- DEFER-1 is explicitly marked as data-model-only, consistent with its "deferred/not in this release" status from `stories.md` — no unit is expected to build its UI or simulator in this pass.
