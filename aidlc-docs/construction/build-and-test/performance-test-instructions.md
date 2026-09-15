# Performance Test Instructions — Delivery Tracking & Driver Console

## Applicability

**Not applicable in the traditional sense for this project.** Per `requirements.md` (NFR-6) and the confirmed Requirements Analysis answers, this system is explicitly scoped for **demo-scale usage only** — dozens of deliveries/drivers, single-digit concurrent users, local-only deployment. The NFR Requirements and NFR Design stages were deliberately skipped in Workflow Planning because the tech stack and scale targets were already fully decided, and no load-balancing, sharding, or high-availability design is in scope.

No formal load/stress testing tooling (JMeter, k6, etc.) was set up, consistent with the one-day-workshop, non-production nature of this build (see `requirements/delivery-tracking-constraints.md` Section 9: "Scaling for large-scale traffic" and "High-availability setup" are explicit exclusions).

## What Was Actually Verified Instead

The one performance-adjacent requirement that **is** in scope is **NFR-1: status changes must be reflected in connected clients within 2 seconds via SSE**. This was verified functionally (not under load) during Build and Test:
- An SSE connection was opened, a status change was triggered via the API, and the event was observed arriving on the connection well under 2 seconds (SSE push over localhost is near-instant, sub-100ms in practice)

## If Performance Testing Becomes Relevant Later

Should this project move beyond workshop scope toward production, the following would need to be established first (currently out of scope per constraints.md):
- Target concurrent user count and request throughput
- A load-testing tool (e.g., k6, Artillery) exercising the REST endpoints and sustained SSE connections
- A migration plan off `better-sqlite3` (single-writer, in-process) to a networked database suited to concurrent access
- Formal NFR Requirements and NFR Design stages, which were intentionally skipped in this workflow
