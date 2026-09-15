# Code Generation Plan — Admin App

## Unit Context

- **Unit**: Admin App (plain HTML/CSS/JS, served by Backend Service at `/admin`)
- **Stories**: ADM-1 (login/session), ADM-2 (monitoring dashboard), ADM-3 (assignment management), ADM-4 (master data), ADM-5 (history)
- **Dependencies**: Backend Service REST API + SSE endpoint (already implemented and verified)
- **Functional Design note**: Same as other frontend units — thin UI layer, business rules enforced server-side

## Execution Steps

- [x] Step 1: Project structure — `frontend/admin/index.html`, `styles.css`, `app.js`
- [x] Step 2: Login screen (ADM-1) — username + password form, JWT in localStorage for refresh persistence
- [x] Step 3: Dashboard tab (ADM-2) — status aggregate cards, delivery list/cards, camp/driver filters, SSE subscription (channel=all), delayed/failed visual emphasis, click-through to history timeline
- [x] Step 4: Assignment tab (ADM-3) — unassigned/re-delivery-target list, driver selection, assign/reassign with confirmation popup
- [x] Step 5: Master data tab (ADM-4) — driver register/edit/deactivate forms, camp register/edit/delete forms
- [x] Step 6: History tab (ADM-5) — completed/failed delivery list, filters (date/status/driver), click-through to status-history timeline
- [x] Step 7: Manual delivery creation form (SYS-2) — within dashboard or assignment tab
- [x] Step 8: Shared status-history timeline modal (used by ADM-2 and ADM-5)
- [x] Step 9: Documentation — `aidlc-docs/construction/admin-app/code/README.md`

## Verification Results
- Static file serving confirmed (200 for all 3 files)
- Live end-to-end tests: reference data loading (passwordHash correctly excluded), unassigned list correctness, assignment flow, master data creation + duplicate rejection (409), history status filtering — all confirmed working

## Story Traceability

| Step | Story |
|---|---|
| 2 | ADM-1 |
| 3, 8 | ADM-2 |
| 4 | ADM-3 |
| 5 | ADM-4 |
| 6, 8 | ADM-5 |
| 7 | SYS-2 |
