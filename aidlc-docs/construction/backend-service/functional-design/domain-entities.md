# Domain Entities — Backend Service

Technology-agnostic domain model. Persistence mapping (SQLite tables/columns) is a Code Generation concern, not addressed here.

---

## Delivery

| Field | Type | Notes |
|---|---|---|
| `id` | identifier | Internal primary identifier |
| `trackingNumber` | string | Unique, system-generated, format `DT-XXXXXXXX` (Q8) |
| `productName` | string | Summary name shown to customer/driver |
| `address` | string | Full delivery address (driver/admin see this in full; customer sees masked form via presentation layer) |
| `campId` | reference → Camp | Originating logistics hub |
| `driverId` | reference → Driver, nullable | Null when unassigned |
| `status` | enum | See Status Enum below |
| `requestNote` | string, nullable | Customer-provided delivery instruction |
| `requestNoteLocked` | boolean (derived, not stored) | True once `status` >= "Out for delivery" (Q3) |
| `isRedeliveryTarget` | boolean | Set true when a failure is reported; cleared on reassignment |
| `failureReason` | enum, nullable | recipient_absent / bad_address / receipt_refused / other |
| `failureMemo` | string, nullable | Optional free-text |
| `receiptMethod` | enum, nullable | in_person / at_door / security_desk / other — set on completion |
| `proofOfDeliveryPhotoUrl` | string (URL), nullable | Set on completion |
| `eta` | datetime, nullable | Computed once when status reaches "Out for delivery" (Q7) |
| `intakeAt` | datetime, nullable | Timestamp when status became Intake |
| `pickupAt` | datetime, nullable | Timestamp when status became Pickup |
| `lineHaulLoadedAt` | datetime, nullable | Timestamp when status became Line-haul loaded |
| `arrivedAtCampAt` | datetime, nullable | Timestamp when status became Arrived at camp |
| `outForDeliveryAt` | datetime, nullable | Timestamp when status became Out for delivery |
| `deliveredAt` | datetime, nullable | Completion time, auto-recorded |
| `createdAt` | datetime | Record creation time |
| `futureRouteRef` | string, nullable | Reserved placeholder field for DEFER-1 (real-time map) — not populated or used in this release |

## Driver

| Field | Type | Notes |
|---|---|---|
| `id` | identifier | Internal primary identifier |
| `employeeId` | string | Unique (case-insensitive, Q5), login credential |
| `name` | string | Full name; customer views show last name only via presentation layer |
| `passwordHash` | string | bcrypt hash, never exposed |
| `assignedArea` | string | |
| `contact` | string | |
| `active` | boolean | False when deactivated (soft-delete, per FR-A4) |
| `createdAt` | datetime | |

## Camp

| Field | Type | Notes |
|---|---|---|
| `id` | identifier | Internal primary identifier |
| `name` | string | Unique (case-insensitive, Q5) |
| `assignedArea` | string | |
| `createdAt` | datetime | |

## StatusHistoryEntry

| Field | Type | Notes |
|---|---|---|
| `id` | identifier | |
| `deliveryId` | reference → Delivery | |
| `status` | enum | The status value at this history point |
| `changedAt` | datetime | |
| `actor` | string | e.g., `driver:<employeeId>`, `admin:<username>`, `system` |

## AdminUser

| Field | Type | Notes |
|---|---|---|
| `id` | identifier | |
| `username` | string | Unique login credential |
| `passwordHash` | string | bcrypt hash |
| `createdAt` | datetime | |

---

## Status Enum (Delivery.status)

Ordered sequence (per Q2, strictly sequential):
1. `intake`
2. `pickup`
3. `line_haul_loaded`
4. `arrived_at_camp`
5. `out_for_delivery`
6. `delivered` (terminal)

Side-branch:
- `failed` — reachable only from `out_for_delivery` (per Q4); resets to `out_for_delivery` upon reassignment to a driver

## Entity Relationships

```
Camp (1) ----< (many) Delivery
Driver (1) ----< (many) Delivery   [driverId, nullable until assigned]
Delivery (1) ----< (many) StatusHistoryEntry
AdminUser and Driver are independent actor identities (no direct relationship to each other)
```
