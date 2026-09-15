# Delivery Tracking & Driver Console — Requirements Specification

## 1. Project Overview

### 1.1 Service Vision
A delivery tracking platform that provides recipients (customers) with a transparent and reassuring delivery experience, delivery drivers with an efficient delivery-processing environment, and operations (control-tower) staff with real-time visibility into the entire delivery flow.

### 1.2 Core Value Proposition

**Customer (Recipient) Perspective**
- See in real time exactly where my delivery is right now
- Peace of mind through estimated arrival time and proof-of-delivery (photo)

**Delivery Driver Perspective**
- See today's delivery list at a glance and update statuses quickly
- Record delivery failures/exceptions simply

**Operations (Control-Tower) Perspective**
- Real-time monitoring of the overall delivery status
- Immediately identify and respond to delayed/failed deliveries

**Market Differentiation**
- Seamless status tracking from intake to delivery completion
- Driver, operations, and customer share the same data in real time

---

## 2. Service Composition

### 2.1 Main Components
- **Customer Interface**: Screen where recipients look up delivery status (browser-based web UI)
- **Driver Interface**: Mobile web screen where drivers process their assigned deliveries
- **Admin Interface**: Screen where operations staff monitor and manage all deliveries
- **Server System**: Delivery status processing and data management
- **Data Store**: Stores delivery, driver, camp (logistics hub), and status-history information

---

## 3. Core Functional Requirements

### 3.1 Customer (Recipient) Features

#### 3.1.1 Delivery Lookup
**Purpose**: Allow customers to look up their delivery by tracking number

**Functional Requirements**:
- Look up a delivery by entering the tracking number
- Display basic delivery information
  - Tracking number
  - Product name (summary)
  - Delivery address (masked)
  - Current delivery status
  - Estimated arrival time
- Store looked-up tracking numbers locally (provide a recent-lookups list on return visits)

**UI/UX Requirements**:
- Place the tracking-number input at the very top
- Display status clearly with a large badge/icon

#### 3.1.2 Real-Time Delivery Status Tracking
**Purpose**: Let customers view delivery progress on a real-time timeline

**Functional Requirements**:
- **Delivery status timeline display**:
  - Intake → Pickup → Line-haul loaded → Arrived at camp → Out for delivery → Delivered
  - Show the processed timestamp for each stage
  - Visually emphasize the current stage
- **Real-time status updates** (using Server-Sent Events)
- On "out for delivery," show the driver name (last name only) and estimated arrival time
- On "delivered," show completion time, receipt method (in-person / at door, etc.), and proof-of-delivery photo

**Update Mechanism**:
- Real-time communication based on Server-Sent Events (SSE)
- Status changes reflected on screen within 2 seconds

#### 3.1.3 Delivery Request Note Registration
**Purpose**: Let customers communicate delivery instructions in advance

**Functional Requirements**:
- Select/enter a request note (e.g., "Leave at the door and ring the bell," "Leave with security desk," "Call if absent")
- Edit the request note (allowed only before out-for-delivery)
- Saved request notes are shown on the driver's screen

**Data Validation**:
- Disable editing the request note after out-for-delivery (in transit)

#### 3.1.4 Delivery History Lookup
**Purpose**: Let customers review deliveries they previously looked up

**Functional Requirements**:
- Display a list of recently looked-up tracking numbers (based on local storage)
- Distinguish completed deliveries from in-progress ones
- On clicking a completed item, show the final delivery result (completion time, receipt method, photo)

**Data Management**:
- Store the recent-lookups list on the client side (persists across page refresh)


### 3.2 Delivery Driver Features

#### 3.2.1 Driver Login and Session Management
**Purpose**: Allow drivers to access the deliveries assigned to them

**Functional Requirements**:
- Enter driver identifier (employee ID) and password
- **Session management**:
  - 12-hour session (based on a one-day delivery shift)
  - JWT token-based authentication
  - Session persists across browser refresh
  - Automatic logout after 12 hours

**Security Requirements**:
- Secure password storage (bcrypt hashing)
- Session-based authentication

#### 3.2.2 Assigned Delivery List Lookup
**Purpose**: Let drivers see the deliveries they must handle today

**Functional Requirements**:
- **Display today's delivery list**:
  - Delivery address
  - Product name (summary)
  - Delivery request note
  - Current delivery status
- Filter by status (Pending / In transit / Delivered / Failed)
- Show detail on clicking a delivery item
- List sorted by delivery order

**UI/UX Requirements**:
- Mobile-first (large buttons operable with one hand)
- Touch-friendly button size (minimum 44x44px)
- Remaining delivery count pinned at the top

#### 3.2.3 Delivery Status Update
**Purpose**: Let drivers change status as delivery progresses

**Functional Requirements**:
- Change delivery status (Pending → In transit → Delivered)
- **Delivery completion handling**:
  - Select receipt method (in-person / at door / security desk, etc.)
  - Attach proof-of-delivery photo (via image URL)
  - Completion time recorded automatically
- On status change, reflect to the server with success/failure feedback
- Status-change results reflected on customer and operations screens in real time (SSE)

**Data Management**:
- On each status change, store a status history (StatusHistory) entry (change time, actor)

#### 3.2.4 Delivery Failure/Exception Handling
**Purpose**: Record cases where delivery was not completed normally

**Functional Requirements**:
- Delivery failure button
- Select failure reason (recipient absent / bad address / receipt refused / other)
- Enter a per-reason memo (optional)
- On failure, mark the delivery as a "re-delivery target"
- Display a confirmation popup
- Success/failure feedback


### 3.3 Admin (Operations / Control-Tower) Features

#### 3.3.1 Operations Login
**Purpose**: Allow operations staff to access the delivery management system

**Functional Requirements**:
- Enter username and password
- **Session management**:
  - 16-hour session
  - JWT token-based authentication
  - Session persists across browser refresh
  - Automatic logout after 16 hours

**Security Requirements**:
- Secure password storage (bcrypt hashing)
- Login attempt limiting
- Session-based authentication

#### 3.3.2 Real-Time Delivery Monitoring
**Purpose**: Monitor and manage the overall delivery status in real time

**Functional Requirements**:
- **Real-time delivery status updates** (using Server-Sent Events)
- **Dashboard layout**:
  - Status aggregate cards (Pending / In transit / Delivered / Failed·Delayed)
  - Per-delivery card or list display
- Display per-delivery detail
  - Tracking number
  - Delivery address (summary)
  - Assigned driver
  - Current status
  - Last status-change time
- **On clicking a delivery card**: view the detailed status-history timeline
- **Visually emphasize delayed/failed deliveries** (color change, animation)
- Filter by camp / driver

**Update Mechanism**:
- Real-time communication based on Server-Sent Events (SSE)
- Status changes displayed within 2 seconds

**UI Requirements**:
- Show status aggregates alongside the individual delivery list
- Prioritize surfacing delayed/failed items

#### 3.3.3 Delivery Assignment Management
**Purpose**: Assign and adjust deliveries to drivers

**Functional Requirements**:
- Display the unassigned-delivery list
- Assign a delivery after selecting a driver
- Reassignment feature
- Reassign re-delivery-target items
- Display a confirmation popup
- Assignment results reflected on driver and customer screens
- Success/failure feedback

#### 3.3.4 Master Data Management (Drivers · Camps)
**Purpose**: Manage the master data needed for delivery operations

**Functional Requirements**:
- **Driver management**:
  - Register driver (employee ID, name, assigned area, contact)
  - Edit driver information
  - Deactivate driver
- **Camp (logistics hub) management**:
  - Register camp (camp name, assigned area)
  - Edit camp information
  - Delete camp

**Data Validation**:
- Required-field validation
- Duplicate validation for employee ID / camp name

#### 3.3.5 Delivery History Lookup
**Purpose**: Review the history of completed/failed deliveries

**Functional Requirements**:
- Display the completed/failed delivery list (reverse chronological)
- Per-delivery info: tracking number, delivery address (summary), assigned driver, final status, completion/failure time, failure reason
- Filter by date / status / driver
- Show the status-history timeline on clicking a delivery item

**Data Management**:
- Store status history in the database (StatusHistory table)
- Group history by tracking number


### 3.4 Optional / Bonus Features

> The features below are **not part of the core MVP**. They are optional extensions for teams that have spare time or want to increase demo impact. Completing the core features (3.1–3.3) takes priority.

#### 3.4.1 Real-Time Delivery Location Map
**Purpose**: Visualize the driver's movement on a map in real time

**Functional Requirements**:
- Show the driver's current location on a map (marker)
- **Mock-coordinate-based real-time movement**:
  - Build the camp → delivery-address route as a predefined coordinate array (polyline)
  - Run a simulator on the server that interpolates the location along the coordinate array
  - Push location changes over the **existing SSE channel**
- Customer view: show my driver's current location and the route to the delivery address
- Operations view: show multiple drivers' locations on the map simultaneously

**Implementation Guidance**:
- Use an **open-source map that needs no API key or billing** (e.g., Leaflet + OpenStreetMap tiles)
- Reproduce movement with a mock simulator, without real GPS hardware/integration
- Instead of real-time recalculation, use a simple computed ETA (based on a fixed speed)

---

## 4. MVP Development Scope

### Core Features (Required)
**Goal**: Implement the basic delivery-tracking process from intake to delivery completion

**Customer (Recipient)**:
- Delivery lookup by tracking number
- Real-time delivery status tracking (timeline, SSE)
- Delivery request-note registration
- Delivery history lookup (based on recent lookups)

**Driver**:
- Driver login (12-hour session)
- Assigned delivery list lookup
- Delivery status update (including delivery completion)
- Delivery failure/exception handling

**Admin (Operations)**:
- Operations login (16-hour session)
- Real-time delivery monitoring (dashboard, SSE)
- Delivery assignment management (assign/reassign)
- Master data management (drivers, camps)
- Delivery history lookup

### Optional Extension (If Time Permits)
- Real-time delivery location map (mock-coordinate-based, open-source map + SSE)

---

## Appendix

### A. Glossary
- **MVP**: Minimum Viable Product
- **API**: Application Programming Interface
- **UI/UX**: User Interface / User Experience
- **SSE**: Server-Sent Events (real-time one-way communication from server to client)
- **Tracking number**: The unique number identifying an individual delivery
- **Camp**: The regional logistics hub where a driver receives goods and begins delivery
- **Pickup**: The stage of collecting goods from the seller/fulfillment center
- **Line-haul**: The large-scale transport stage that moves goods between fulfillment centers
- **Last mile**: The delivery leg from the camp to the final recipient
- **Re-delivery target**: A delivery that must be delivered again due to a delivery failure
