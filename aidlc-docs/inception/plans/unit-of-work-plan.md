# Unit of Work Plan — Delivery Tracking & Driver Console

## Context

From `execution-plan.md` (confirmed structure) and `application-design.md` (5 backend components), the natural unit boundaries are:
- **1 backend unit**: hosts all 5 components (Delivery, Auth, Master Data, Realtime, Seed) + API routes + SSE endpoint + SQLite
- **3 frontend units**: Customer app, Driver app, Admin app (each plain HTML/CSS/JS per confirmed tech decision)

This gives 4 candidate units total, matching the "single repo, separate backend service + frontend build(s)" decision from Requirements Analysis.

## Execution Checklist

- [x] Confirm unit grouping/count (Question 1) — A: 4 units (Backend, Customer, Driver, Admin)
- [x] Confirm inter-unit communication/integration approach (Question 2) — B: backend serves static frontends directly
- [x] Confirm team alignment considerations (Question 3) — A: single developer/session
- [x] Confirm technical/deployment considerations across units (Question 4) — A: uniform, local-only
- [x] Confirm business domain alignment (Question 5) — A: persona-based split matches domains
- [x] Confirm code organization / directory structure (Question 6 - greenfield) — A: /backend + /frontend/{customer,driver,admin}
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work.md`
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-dependency.md`
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-story-map.md`
- [x] Validate all stories are assigned to a unit — confirmed, all 17 stories mapped (see Coverage Validation in unit-of-work-story-map.md)
- [x] Validate unit boundaries and dependencies are consistent with application-design.md — confirmed, Backend Service hosts all 5 components as designed

## Clarifying Questions

### Question 1: Unit Grouping and Count
Does the 4-unit split (1 Backend + Customer app + Driver app + Admin app) match how you want to develop/organize this?

A) Yes, 4 units as described (Backend, Customer, Driver, Admin)

B) Fewer units — combine all 3 frontends into a single "Frontend" unit (e.g., a shared static-file structure with 3 sub-folders) rather than treating them as 3 separate units

C) More units — split Backend further (e.g., separate unit per major component)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: 4 units cleanly matches the 3 distinct personas (each with its own UI, own audience, own testable surface) plus 1 backend. Splitting Backend further (C) would fight against the "thin service-per-component, single process" decision already made in Application Design — those 5 components are meant to live together in one deployable unit, not be treated as separate units of work. Merging frontends (B) would blur genuinely different UIs (mobile-first driver console vs. dashboard-style admin vs. public lookup page) into one unit for no real benefit at this scale.

### Question 2: Inter-Unit Communication / Integration Approach
How should the frontend units integrate with the backend unit during development?

A) Frontend units call the backend via relative/configurable base URL (e.g., `http://localhost:3000/api`), backend serves only JSON + SSE, frontends are static files served separately (e.g., via a simple static server or opened directly)

B) Backend serves the frontend static files directly (single Node process serves both API and static HTML/CSS/JS for all 3 apps, e.g., under `/customer`, `/driver`, `/admin` paths)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

**Recommendation rationale**: For a one-day workshop with a "local development only" deployment target, one Node process serving both the API and the 3 static frontends (under `/customer`, `/driver`, `/admin`) is the simplest possible setup — one `npm start`, one port, no CORS configuration to worry about, nothing extra to run. Option A is more "properly decoupled" but adds a second server/CORS setup for zero real benefit at this scale.

### Question 3: Team Alignment
Is this being built by a single developer/AI-assisted session, or does unit boundary need to reflect separate team ownership?

A) Single developer/session — team alignment is not a constraint on unit boundaries

B) Multiple people will work in parallel on different units — unit boundaries should minimize merge conflicts and allow independent work

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: This is a one-day AI-DLC workshop build; nothing in the requirements or prior answers indicates multiple parallel contributors. Defaulting to "not a constraint" avoids over-engineering unit boundaries for a team structure that doesn't exist here.

### Question 4: Technical/Deployment Considerations Across Units
Do the 4 units have different scaling, deployment, or runtime requirements, or can they all be treated uniformly (matching the "local-only, demo-scale" decision from Requirements Analysis)?

A) Uniform — all units run locally, no differing scaling/deployment needs across units

B) Some units have different requirements (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: Directly consistent with the confirmed "demo-scale, local-only deployment" decision from Requirements Analysis — no unit has a distinct scaling or deployment profile.

### Question 5: Business Domain Alignment
Do the unit boundaries align with clear business domains (Customer-facing / Driver-facing / Operations-facing / core delivery logic), or would you prefer a different domain grouping?

A) Yes, the persona-based split (Customer/Driver/Admin/Backend) matches the business domains well

B) I'd prefer a different domain grouping (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: Requirements.md itself is organized by persona (sections 3.1/3.2/3.3), and stories.md follows the same structure (CUST-*, DRV-*, ADM-*). The unit boundaries should mirror the same grouping already validated in two prior stages — introducing a different domain split here would create inconsistency across artifacts for no clear gain.

### Question 6: Code Organization / Directory Structure (Greenfield)
What top-level directory structure should the repo use?

A) 
```
/backend       (Node.js + TypeScript API/SSE service)
/frontend
  /customer    (plain HTML/CSS/JS)
  /driver      (plain HTML/CSS/JS)
  /admin       (plain HTML/CSS/JS)
```

B)
```
/services/backend
/apps/customer
/apps/driver
/apps/admin
```

X) Other (please describe after [Answer]: tag below)

[Answer]: A

**Recommendation rationale**: `/backend` + `/frontend/{customer,driver,admin}` is the most immediately legible structure for a single-repo, single-backend, three-static-app project — no need for the `/services`/`/apps` naming convention which implies a larger multi-service system than what's being built here. It also directly matches Question 2's decision (backend serves `/customer`, `/driver`, `/admin` as static paths), so the folder names line up 1:1 with the URL paths.
