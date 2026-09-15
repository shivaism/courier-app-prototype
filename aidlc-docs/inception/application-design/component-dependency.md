# Component Dependency — Delivery Tracking & Driver Console

## Dependency Matrix

| Component | Depends On | Depended On By |
|---|---|---|
| DeliveryService | MasterDataService (validate driver/camp), EventEmitter (publish) | API route handlers, SeedService |
| AuthService | MasterDataService (driver lookup) | API route handlers (login, middleware) |
| MasterDataService | — (leaf component, no dependencies on other domain components) | DeliveryService, AuthService, API route handlers, SeedService |
| RealtimeService | EventEmitter (subscribe) | API route handlers (SSE connect only) |
| SeedService | DeliveryService, MasterDataService | Process startup only |

**Note**: MasterDataService is a leaf dependency — it depends on nothing else, which keeps it safe to build/test first.

## Communication Patterns

### 1. Direct Synchronous Calls (Question 4/5: thin services, in-process)
Used for anything that needs an immediate answer or immediate consistency:
- Route handler → Service (always direct call)
- DeliveryService → MasterDataService (e.g., "does this driver exist and is active?")
- AuthService → MasterDataService (e.g., "look up driver by employee ID")
- SeedService → DeliveryService / MasterDataService (create sample records)

### 2. Event-Based Async Notification (Question 5: in-process EventEmitter)
Used specifically to decouple state-changing components from the Realtime broadcaster:
- DeliveryService emits `statusChanged`, `assignmentChanged`, `deliveryFailed` after a successful mutation
- RealtimeService subscribes to these events at startup and forwards matching ones to connected SSE clients

This is the ONLY event-based path in the system — everything else is a direct call. This keeps the design simple while still avoiding a hard dependency from DeliveryService onto RealtimeService.

## Data Flow Diagram (Text Representation)

```
[Customer Browser]  --HTTP GET lookup-->        [API Route Handler] --> DeliveryService --> SQLite
[Customer Browser]  --SSE subscribe (by tracking#)--> [API Route Handler: /api/events] --> RealtimeService

[Driver Browser]     --HTTP POST login-->         [API Route Handler] --> AuthService --> MasterDataService --> SQLite
[Driver Browser]     --HTTP PATCH status-->        [API Route Handler] --> DeliveryService --> SQLite
                                                                              |
                                                                              v (emits event)
                                                                       EventEmitter
                                                                              |
                                                                              v (subscribed)
                                                                       RealtimeService --SSE push--> [Customer Browser]
                                                                       RealtimeService --SSE push--> [Admin Browser]

[Admin Browser]       --HTTP POST assign-->        [API Route Handler] --> DeliveryService --> MasterDataService (validate driver)
                                                                              |
                                                                              v (emits event)
                                                                       EventEmitter --> RealtimeService --SSE push--> [Driver Browser]
```

### Text-Only Fallback (in case the diagram above doesn't render as intended)
- Customer, Driver, and Admin browsers all talk to the same backend over HTTP (for actions) and SSE (for live updates).
- All actions go through a Service (DeliveryService, AuthService, or MasterDataService), which talks to SQLite.
- Any Delivery state change (status update, assignment, failure) triggers an in-process event.
- RealtimeService listens for those events and pushes SSE updates to whichever browsers are subscribed to the relevant channel (by tracking number, driver ID, or "all" for admin).

## Build/Test Sequencing Implication (for later Units Generation / Code Generation stages)

Suggested internal build order within the backend unit, based on the dependency matrix above:
1. MasterDataService (no dependencies)
2. AuthService (depends on MasterDataService)
3. DeliveryService (depends on MasterDataService, EventEmitter)
4. RealtimeService (depends on EventEmitter)
5. SeedService (depends on DeliveryService, MasterDataService)

This is a suggestion for Units Generation / Code Generation to consider, not a hard requirement of Application Design.
