# Component Methods — Delivery Tracking & Driver Console

Method signatures with high-level purpose and input/output shapes. Detailed business rules (exact validation logic, error conditions) are deferred to Functional Design (CONSTRUCTION phase, per approved execution plan).

---

## 1. Delivery Component

| Method | Input | Output | Purpose |
|---|---|---|---|
| `createDelivery(input)` | `{ trackingNumber, productName, address, campId, requestNote? }` | `Delivery` | Create a new delivery (used by Seed and by Admin manual creation, FR-S1/FR-S2) |
| `getDeliveryByTrackingNumber(trackingNumber)` | `string` | `Delivery \| null` | Customer lookup (FR-C1) and general lookup |
| `listDeliveries(filter)` | `{ status?, campId?, driverId?, dateRange? }` | `Delivery[]` | Driver list (FR-D2), Admin dashboard/history (FR-A2, FR-A5) |
| `listUnassignedDeliveries()` | — | `Delivery[]` | Admin assignment view (FR-A3) |
| `assignDriver(deliveryId, driverId)` | `deliveryId, driverId` | `Delivery` | Assign/reassign a delivery to a driver (FR-A3); emits `assignmentChanged` event |
| `updateStatus(deliveryId, newStatus, actor)` | `deliveryId, newStatus, actor` | `Delivery` | Advance delivery status (FR-D3); writes StatusHistory entry; emits `statusChanged` event |
| `completeDelivery(deliveryId, details, actor)` | `{ receiptMethod, photoUrl }, actor` | `Delivery` | Mark delivered with completion details, auto-records completion time (FR-D3); emits `statusChanged` event |
| `reportFailure(deliveryId, reason, memo?, actor)` | `deliveryId, reason, memo?, actor` | `Delivery` | Record failure, flag as re-delivery target (FR-D4); emits `statusChanged`/`deliveryFailed` event |
| `updateRequestNote(deliveryId, note)` | `deliveryId, note` | `Delivery` | Customer note edit (FR-C3); rejects if status is already "Out for delivery" or later |
| `getStatusHistory(deliveryId)` | `deliveryId` | `StatusHistoryEntry[]` | Status timeline for customer/driver/admin views (FR-C2, FR-A2, FR-A5) |

## 2. Auth Component

| Method | Input | Output | Purpose |
|---|---|---|---|
| `loginDriver(employeeId, password)` | `string, string` | `{ token, driver }` | Driver login (FR-D1), 12h JWT |
| `loginAdmin(username, password)` | `string, string` | `{ token, admin }` | Admin login (FR-A1), 16h JWT |
| `verifyToken(token)` | `string` | `{ actorType, actorId } \| null` | Middleware-style validation used by protected routes |
| `hashPassword(plaintext)` | `string` | `string` | bcrypt hashing, used by Master Data on driver creation and by admin user setup |

## 3. Master Data Component

| Method | Input | Output | Purpose |
|---|---|---|---|
| `createDriver(input)` | `{ employeeId, name, area, contact, password }` | `Driver` | Register driver (FR-A4); rejects duplicate employeeId |
| `updateDriver(driverId, input)` | `driverId, partial fields` | `Driver` | Edit driver (FR-A4) |
| `deactivateDriver(driverId)` | `driverId` | `Driver` | Deactivate driver (FR-A4) |
| `getDriverByEmployeeId(employeeId)` | `string` | `Driver \| null` | Used by Auth for login lookup |
| `createCamp(input)` | `{ name, area }` | `Camp` | Register camp (FR-A4); rejects duplicate name |
| `updateCamp(campId, input)` | `campId, partial fields` | `Camp` | Edit camp (FR-A4) |
| `deleteCamp(campId)` | `campId` | `void` | Delete camp (FR-A4) |
| `listDrivers()` / `listCamps()` | — | `Driver[]` / `Camp[]` | Used by Admin UI dropdowns and Delivery assignment validation |

## 4. Realtime Component

| Method | Input | Output | Purpose |
|---|---|---|---|
| `handleSseConnection(req, res, channel)` | HTTP request/response, `{ type: "tracking" \| "driver" \| "all", id? }` | (keeps connection open, streams events) | Entry point for SSE endpoint used by all 3 frontends |
| `subscribeToDomainEvents()` | — | — | Internal setup, called once at startup; attaches listeners to the shared EventEmitter for `statusChanged`, `assignmentChanged`, `deliveryFailed` |
| `publish(event)` | `{ type, payload, channelFilter }` | — | Internal — pushes a formatted SSE message to matching connected clients |
| `removeConnection(connectionId)` | `connectionId` | — | Cleanup on client disconnect |

## 5. Seed Component

| Method | Input | Output | Purpose |
|---|---|---|---|
| `seedIfEmpty()` | — | `{ seeded: boolean, counts }` | Checks if data already exists; if not, creates sample camps, drivers, and deliveries across a range of statuses (FR-S1) |

## Shared Presentation Utility (Cross-Cutting, Not a Component)

| Function | Input | Output | Purpose |
|---|---|---|---|
| `toCustomerDeliveryView(delivery)` | `Delivery` | `CustomerDeliveryDTO` | Masks address, driver last-name-only, includes photo/receipt only if Delivered |
| `toDriverDeliveryView(delivery)` | `Delivery` | `DriverDeliveryDTO` | Full address and note, no masking |
| `toAdminDeliveryView(delivery)` | `Delivery` | `AdminDeliveryDTO` | Full internal detail including driver/camp records |
