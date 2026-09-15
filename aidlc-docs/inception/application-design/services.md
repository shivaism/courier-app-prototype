# Services — Delivery Tracking & Driver Console

Per approved plan (Question 4 = A), this system uses a **thin service-per-component** pattern with no separate orchestration layer. Each of the 5 components from `components.md` is implemented as a service that route handlers call directly.

---

## Service Definitions

### DeliveryService
- Wraps delivery data access (repository/SQLite) + business rules for lifecycle, assignment, notes, and failure handling
- Called directly by delivery-related API route handlers (customer lookup, driver status update, admin assignment/history routes)
- Publishes domain events (`statusChanged`, `assignmentChanged`, `deliveryFailed`) onto the shared in-process EventEmitter after successful mutations (Question 5)
- Does NOT know about SSE, HTTP, or presentation formatting — it returns/receives plain domain objects

### AuthService
- Wraps password hashing/verification (bcrypt) and JWT issuance/validation
- Called directly by login route handlers and by an authentication middleware that runs before protected routes
- Depends on MasterDataService to look up a Driver record by employee ID during driver login

### MasterDataService
- Wraps Driver and Camp CRUD + validation (required fields, duplicate checks)
- Called directly by admin master-data route handlers
- Also called internally by DeliveryService (to validate a driver/camp exists before assignment) and AuthService (to look up driver credentials)

### RealtimeService
- Manages SSE connections and event forwarding
- Called directly by the SSE route handler (`GET /api/events`) to register a new connection
- Subscribes itself to the shared EventEmitter at startup — it does NOT get called by DeliveryService/MasterDataService directly; it listens passively (see `component-dependency.md` for the event flow)

### SeedService
- Wraps the startup seeding logic
- Invoked once at process startup (not via HTTP route), calling into DeliveryService/MasterDataService's create methods to populate sample data

---

## Orchestration Pattern (Confirmed: No Separate Orchestration Layer)

Cross-component workflows (e.g., "assign a delivery, which should also notify Realtime") are handled by:
1. Route handler calls `DeliveryService.assignDriver(...)`
2. `DeliveryService` persists the change and emits an `assignmentChanged` event on the shared EventEmitter
3. `RealtimeService`, already subscribed, receives the event and pushes it to relevant connected SSE clients

This achieves the same cross-component coordination a dedicated workflow/orchestration layer would provide, without adding an extra layer of indirection — appropriate for this single-process, demo-scale system.

## Service Interaction Summary

| Caller | Calls | Reason |
|---|---|---|
| API route handlers | DeliveryService, AuthService, MasterDataService, RealtimeService (SSE connect only) | Direct request handling |
| AuthService | MasterDataService | Look up driver by employee ID during login |
| DeliveryService | MasterDataService | Validate driver/camp exists before assignment |
| DeliveryService | EventEmitter (publish) | Notify listeners of state changes |
| RealtimeService | EventEmitter (subscribe) | Receive state changes to broadcast |
| SeedService | DeliveryService, MasterDataService | Create sample data at startup |
