# Customer App — Code Generation Summary

**Application code location**: `frontend/customer/` at workspace root, served by Backend Service at `/customer`

## What Was Built

A plain HTML/CSS/JS single-page app (no framework, per confirmed tech decision) implementing all 4 customer-facing stories.

## Structure

```
frontend/customer/
├── index.html   # Lookup form, result panel (status/timeline/completion), note form, history list
├── styles.css   # Status badges, timeline styling, responsive layout
└── app.js       # Lookup, SSE subscription, note editing, localStorage-backed history
```

## Story Coverage

| Story | Implementation |
|---|---|
| CUST-1 | Lookup form at top of page; calls `GET /api/deliveries/lookup/:trackingNumber`; shows "not found" message on 404 |
| CUST-2 | Renders 6-stage timeline with timestamps and current-stage emphasis; subscribes to `GET /api/events?channel=tracking&trackingNumber=...` via `EventSource`; re-fetches and re-renders on any event (well within the 2-second target since SSE push is near-instant) |
| CUST-3 | Preset dropdown + free-text textarea; field disabled and locked-message shown when `requestNoteEditable` is false in the API response; saves via `PATCH /api/deliveries/lookup/:trackingNumber/note` |
| CUST-4 | Recent lookups stored in `localStorage` under `deliveryTracker.recentLookups`; distinguishes completed vs in-progress via badge; clicking an entry re-runs the lookup |

## Automation-Friendly Markup

All interactive elements have stable `data-testid` attributes (e.g., `lookup-tracking-number-input`, `lookup-submit-button`, `request-note-save-button`, `recent-lookup-item-{trackingNumber}`).

## Verification Performed

- Static file serving confirmed: `GET /customer/`, `/customer/app.js`, `/customer/styles.css` all return 200 from the running Backend Service
- API response shape confirmed to match what `app.js` expects (masked address, `requestNoteEditable`, `driverLastName`, `statusTimestamps`)
- **End-to-end SSE flow verified live**: subscribed to `/api/events?channel=tracking&trackingNumber=...`, triggered an admin assignment + driver status change via the API, and confirmed both `assignmentChanged` and `statusChanged` events arrived on the subscribed connection — exactly the event flow `app.js`'s `EventSource.onmessage` handler relies on to refresh the UI

## How to View

With the Backend Service running (`cd backend && npm run dev`), open `http://localhost:3000/customer` in a browser.

## Benchmark Upgrade Additions

- **Persistent ETA states**: one shared countdown drives the detail row and the map card, seeded from the lookup response. States are `Arriving in …`, `Arriving soon` (final minute), and `ETA passed — driver is still on the way`. The interval stops once the estimate elapses instead of repainting `0s`.
- **Realtime connection status**: a status pill shows Live / Reconnecting / Offline. On reconnect the app refetches the delivery and location snapshots before applying later events, since events during the gap were missed.
- **Stale-lookup safety**: each lookup increments a generation token and closes the previous stream immediately, so a slow or failed lookup can never apply results or events belonging to a different delivery.
- **Instruction integrity**: the textarea is the single submitted source of truth. Presets populate it; typing custom wording clears the preset so the two controls cannot disagree. Once locked, all editing controls are hidden and only the saved note (or an explicit no-note message) remains.
- **Failed timeline**: for failed deliveries the last reached stage is derived from recorded timestamps, so completed progress still renders instead of collapsing.
- **Fresh recent lookups**: stored statuses refresh on load. If a refresh fails the entry is preserved and labelled last known; unknown tracking numbers are marked not found.
- **Accessibility**: recent lookups are real buttons, status/ETA changes announce through a polite live region, the map exposes an image label plus a text fallback when unavailable, route progress uses progressbar semantics, focus is visible, the layout reflows under 560px, and marker/progress animation is suppressed under `prefers-reduced-motion`.
- **Privacy note**: a `no-referrer` policy is set. Leaflet (CDN), CARTO/OSM tiles, and driver-supplied proof-image URLs are third-party requests made by the browser; map coordinates are mock data, so the real delivery address is never transmitted.
