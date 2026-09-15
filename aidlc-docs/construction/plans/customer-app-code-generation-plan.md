# Code Generation Plan — Customer App

## Unit Context

- **Unit**: Customer App (plain HTML/CSS/JS, served by Backend Service at `/customer`)
- **Stories**: CUST-1 (lookup), CUST-2 (real-time timeline via SSE), CUST-3 (request note), CUST-4 (lookup history via local storage)
- **Dependencies**: Backend Service REST API + SSE endpoint (already implemented and verified)
- **Functional Design note**: No separate Functional Design stage was run for this unit — it's a thin UI layer with no independent business logic or domain model of its own; all business rules (masking, note lockout, status sequencing) already live in the Backend Service and are enforced server-side. The UI simply calls the already-designed API contract.

## Execution Steps

- [x] Step 1: Project structure — `frontend/customer/index.html`, `styles.css`, `app.js`
- [x] Step 2: Lookup UI (CUST-1) — tracking-number input at top, result display with status badge
- [x] Step 3: Timeline UI (CUST-2) — stage list with timestamps, current-stage emphasis, SSE subscription
- [x] Step 4: Request note UI (CUST-3) — editable/read-only note field depending on delivery status
- [x] Step 5: Lookup history UI (CUST-4) — local-storage-backed recent-lookups list
- [x] Step 6: Wire SSE connection using `/api/events?channel=tracking&trackingNumber=...`
- [x] Step 7: Documentation — `aidlc-docs/construction/customer-app/code/README.md`

## Verification Results
- Static file serving confirmed (200 for index.html, app.js, styles.css) from live Backend Service
- API response shape confirmed to match app.js expectations
- End-to-end SSE flow verified: subscribed, triggered assignment + status change, both events received on the subscribed connection

## Story Traceability

| Step | Story |
|---|---|
| 2 | CUST-1 |
| 3, 6 | CUST-2 |
| 4 | CUST-3 |
| 5 | CUST-4 |
