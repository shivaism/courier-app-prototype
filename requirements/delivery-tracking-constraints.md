# Delivery Tracking & Driver Console — Implementation Exclusions

> This project is a learning-purpose MVP for a one-day workshop, not a production-grade delivery system.
> The functional and non-functional elements below are out of scope.

## Excluded Features (Not Implemented)

### 1. Location Tracking / Maps
- Real-time GPS location tracking (**hardware collection** of live coordinates from driver devices)
- Paid map API integrations and services requiring API-key issuance (Google Maps / Kakao Map, etc.)
- Route optimization algorithms (TSP, last-mile optimization)
- Estimated-arrival-time (ETA) real-time recalculation engine (replaced by a fixed/simple computed value)

> **However, map visualization is allowed as an optional extension**: A "real-time delivery location map"
> that interpolates and moves mock coordinate data on the server and displays it via SSE on an
> open-source map requiring no API key (e.g., Leaflet + OpenStreetMap) may be implemented
> as an optional extension (requirement 3.4). The exclusions apply only to **real GPS hardware
> integration** and **paid / key-issuance map APIs**.

### 2. Authentication and Security (Advanced)
- Complex user authentication (OAuth, social login)
- Multi-factor authentication (2FA, OTP)
- Driver identity verification (biometrics, device fingerprint, etc.)
- Full compliance with recipient PII encryption/masking regulations (privacy laws, etc.)

### 3. File and Content Management
- Actual upload/storage of proof-of-delivery photos (replaced by image-URL references)
- Image resizing/optimization
- Content management system

### 4. Notification System
- Push notifications (mobile, browser)
- SMS notifications (out-for-delivery / delivered text messages)
- Email sending
- Automated voice guidance (IVR)

### 5. Payment and Settlement
- Cash-on-delivery payment processing
- Driver commission settlement
- Refund processing for returns/exchanges

### 6. Advanced Logistics Operations
- Delivery volume forecasting and automatic dispatch algorithms
- Camp inventory / inbound-outbound management
- Vehicle management and load optimization
- Automatic detection and escalation of delivery SLA violations
- Return/exchange pickup process

### 7. Data Analytics / Reporting
- Delivery performance analytics dashboard (on-time rate, per-driver productivity, etc.)
- Revenue / logistics-cost report generation
- Anomalous delivery pattern detection

### 8. External Integrations
- Integration with real courier/logistics-company systems
- Order/commerce system integration (order data replaced by sample/seed data)
- Address validation / postal-code API
- Seller system integration
- Driver attendance / HR system integration

### 9. Non-Functional Elements (Production Scale)
- Scaling for large-scale traffic (load balancing, sharding)
- High-availability setup (multi-region, disaster recovery)
- Message-queue-based asynchronous architecture (simplified to SSE)
- Audit logging / regulatory-compliance logging
