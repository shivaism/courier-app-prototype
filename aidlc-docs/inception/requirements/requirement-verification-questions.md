# Requirements Clarification Questions — Delivery Tracking & Driver Console

The requirements and constraints documents you provided are quite detailed on functional scope. I still need your input on a few technical/scope decisions before writing the formal requirements document. Please fill in each `[Answer]:` tag and let me know when you're done.

## Question 1: Technology Stack — Backend
What backend language/framework should be used?

A) Node.js (Express or Fastify) + TypeScript

B) Python (FastAPI)

C) Java (Spring Boot)

D) Kotlin (Spring Boot)

X) Other (please describe after [Answer]: tag below)

[Answer]: Node.js (Express or Fastify) + TypeScript

## Question 2: Technology Stack — Frontend
What frontend framework should be used for the three UIs (Customer, Driver, Admin)?

A) React (with TypeScript)

B) Vue.js

C) Plain HTML/CSS/JavaScript (no framework, simplest for a one-day workshop)

D) Svelte

X) Other (please describe after [Answer]: tag below)

[Answer]: Plain HTML/CSS/JavaScript (no framework, simplest for a one-day workshop)

## Question 3: Data Store
The requirements mention a "Data Store" for delivery, driver, camp, and status-history data. What should we use?

A) PostgreSQL (relational)

B) SQLite (file-based, zero-setup — good fit for a one-day workshop)

C) MongoDB (document store)

D) In-memory store (no persistence across restarts — fastest to stand up, but data resets on restart)

X) Other (please describe after [Answer]: tag below)

[Answer]: SQLite (file-based, zero-setup — good fit for a one-day workshop)

## Question 4: Project Structure
How should the codebase be organized?

A) Single repo, single deployable app (server serves all 3 UIs + API + SSE from one process)

B) Single repo, but separate frontend build(s) and backend service (still one repo, two runnable projects)

C) Separate repos per UI/service

X) Other (please describe after [Answer]: tag below)

[Answer]: Single repo, but separate frontend build(s) and backend service (still one repo, two runnable projects)

## Question 5: Sample/Seed Data
The constraints document says order data is "replaced by sample/seed data" and no order-system integration exists. How should deliveries/orders enter the system?

A) Pre-loaded seed script that creates a fixed set of sample deliveries, drivers, and camps at startup

B) Admin UI form to manually create new deliveries (in addition to seed data)

C) Both A and B

X) Other (please describe after [Answer]: tag below)

[Answer]: Both A and B

## Question 6: Optional Real-Time Map Feature (Section 3.4.1)
The requirements mark the real-time delivery location map as optional/bonus, to be done only "if time permits." Should we include it in this MVP build?

A) Yes, include it as part of the initial implementation

B) No, skip it — focus only on core features (3.1–3.3)

C) Design for it now (data model/hooks) but implement the actual map UI later

X) Other (please describe after [Answer]: tag below)

[Answer]: Design for it now (data model/hooks) but implement the actual map UI later

## Question 7: Scale / Performance Expectations
This is a one-day workshop MVP, not a production system. Are there any specific scale expectations (concurrent users, number of deliveries, etc.), or should we assume small demo-scale (e.g., dozens of deliveries, single-digit concurrent users)?

A) Small demo-scale is fine (dozens of deliveries/drivers, single-digit concurrent users) — no special performance work needed

B) I have specific scale numbers to provide

X) Other (please describe after [Answer]: tag below)

[Answer]: Small demo-scale is fine (dozens of deliveries/drivers, single-digit concurrent users) — no special performance work needed

## Question 8: Deployment Target
Where will this run for the workshop/demo?

A) Local development only (run on localhost, no deployment needed)

B) Deploy to a cloud environment (e.g., AWS)

C) Both — local dev now, cloud deployment as a stretch goal

X) Other (please describe after [Answer]: tag below)

[Answer]: Local development only (run on localhost, no deployment needed)

## Question 9: Admin Login Attempt Limiting
Requirement 3.3.1 mentions "login attempt limiting" for admin. Do you have a specific policy in mind?

A) Simple fixed lockout after N failed attempts (e.g., 5 attempts, lock for 15 minutes) — reasonable default is fine

B) No lockout needed for this MVP — just note it as a known gap

X) Other (please describe after [Answer]: tag below)

[Answer]: No lockout needed for this MVP — just note it as a known gap

## Question: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

## Question: Resiliency Extensions
Should the resiliency baseline be applied to this project?

**What this extension is.** Enabling it applies a set of **directional, design-time best practices** for building resilient systems, derived from the **AWS Well-Architected Framework (Reliability Pillar)** and resilience-review guidance. It steers requirements, design, and code toward fault tolerance, high availability, observability, and recoverability — covering 15 practice areas across business goals, change management, observability, high availability, disaster recovery, and continuous improvement.

**What this extension is NOT.** Enabling it does **not** make your workload production-ready, nor does it certify or guarantee any availability, RTO, or RPO target. It is a **starting point** that scaffolds good resiliency decisions early — it is not a substitute for a formal **AWS Well-Architected Review** of the built system.

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads)

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects like this one-day workshop)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)

C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)

X) Other (please describe after [Answer]: tag below)

[Answer]: C
