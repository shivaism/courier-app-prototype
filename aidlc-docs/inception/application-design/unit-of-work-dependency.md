# Unit of Work Dependency — Delivery Tracking & Driver Console

## Dependency Matrix

| Unit | Depends On | Depended On By | Change Type If Modified |
|---|---|---|---|
| Backend Service | — (none) | Customer App, Driver App, Admin App | Major (API/SSE contract changes ripple to all 3 frontends) |
| Customer App | Backend Service | — (none) | Minor/isolated (no other unit depends on it) |
| Driver App | Backend Service | — (none) | Minor/isolated |
| Admin App | Backend Service | — (none) | Minor/isolated |

## Communication Pattern Between Units

- **Frontend → Backend**: HTTP REST calls (relative paths, since Backend Service serves the frontends directly per Question 2: B — no cross-origin config needed) + one persistent SSE connection per active page for real-time updates
- **Backend → Frontend**: Static file serving (HTML/CSS/JS) + JSON API responses + SSE event stream
- **Frontend ↔ Frontend**: No direct communication between Customer/Driver/Admin apps. Any coordination between them (e.g., driver marks delivered → customer sees it) happens entirely through the Backend Service's Realtime component.

## Update/Build Strategy

- **Update Approach**: Sequential-then-parallel — Backend Service first (critical path), then Customer/Driver/Admin apps can proceed in parallel since they have no dependencies on each other.
- **Critical Path**: Backend Service. Its API/SSE contract (endpoints, payload shapes, event names) must be stable before frontend units can be meaningfully implemented and tested end-to-end.
- **Coordination Points**: The REST API contract and SSE event schema (event types: `statusChanged`, `assignmentChanged`, `deliveryFailed`, and channel filters: by tracking number / by driver / "all") defined during Backend Service's Functional Design.
- **Testing Checkpoints**:
  1. Backend Service unit-testable in isolation (business logic, API responses) before any frontend exists
  2. Each frontend app integration-tested against the running Backend Service once its own UI is built
  3. Full cross-unit integration test (see Build and Test stage) verifying SSE propagation reaches all 3 frontends within the 2-second target

## Risk Notes

- **Single point of coupling**: All 3 frontend units depend on Backend Service's API contract. A late-breaking change to that contract would require updates across all 3 frontends. Mitigation: finalize the API contract during Backend Service's Functional Design stage before frontend implementation begins.
- **No circular dependencies**: The dependency graph is a simple one-to-many (Backend → 3 frontends), so there's no risk of circular unit dependencies to manage.
