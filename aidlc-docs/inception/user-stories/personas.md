# Personas — Delivery Tracking & Driver Console

## 1. Recipient (Customer)

**Name (archetype)**: Jamie, the Waiting Recipient

**Role**: Person who ordered a package and wants to know when it will arrive.

**Characteristics**:
- Occasional user — visits only when expecting a delivery
- Uses a phone or laptop browser, no app install
- Not logged in / no account — identified only by tracking number
- Low patience for confusing UI; wants the answer to "where is my package" immediately

**Motivations**:
- Wants reassurance the delivery is on track
- Wants to plan their day around the estimated arrival time
- Wants to leave instructions so the driver doesn't waste a trip (e.g., "leave at the door")

**Pain Points This System Addresses**:
- Not knowing delivery status until it randomly arrives
- No way to leave delivery instructions in advance
- No visual proof the delivery was actually completed

**Relevant Stories**: All Customer (`CUST-*`) stories

---

## 2. Delivery Driver

**Name (archetype)**: Alex, the Route Driver

**Role**: Employee who physically delivers packages assigned to them for the day.

**Characteristics**:
- Uses a mobile phone (mobile web, not native app) while on the move
- Works one shift (~12 hours) per login session
- Needs large, thumb-friendly buttons — often one-handed, sometimes wearing gloves
- Not deeply technical; needs simple, fast status updates between stops

**Motivations**:
- Wants to move through their delivery list quickly with minimal taps
- Wants an easy way to record failures without a complicated form
- Wants confidence that a status update actually saved before moving to the next stop

**Pain Points This System Addresses**:
- No paper-based or phone-call-based status reporting
- No easy way to flag/re-queue failed deliveries
- No visibility into customer delivery notes before arriving

**Relevant Stories**: All Driver (`DRV-*`) stories

---

## 3. Operations / Control-Tower Staff (Admin)

**Name (archetype)**: Morgan, the Dispatcher

**Role**: Back-office staff who monitors the entire delivery operation, assigns drivers, manages master data, and responds to delays/failures.

**Characteristics**:
- Works from a desktop/laptop, likely with the dashboard open all shift (~16-hour session)
- Manages multiple camps and many drivers simultaneously
- Needs to spot problems (delays, failures) quickly among many normal deliveries
- Responsible for keeping driver and camp master data accurate

**Motivations**:
- Wants an at-a-glance view of the whole operation's health
- Wants to react fast to delayed/failed deliveries and re-assign work
- Wants confidence that master data (drivers, camps) is clean and duplicate-free

**Pain Points This System Addresses**:
- No centralized real-time view of delivery status across all drivers/camps
- No easy way to assign/reassign deliveries to drivers
- No historical record to review completed/failed deliveries

**Relevant Stories**: All Admin (`ADM-*`) stories

---

## 4. System / Shared (Non-Human)

Not a human persona, but a set of shared capabilities all three personas' stories depend on: SSE-based real-time propagation, seed/sample data availability, and status-history persistence.

**Relevant Stories**: `SYS-*` stories
