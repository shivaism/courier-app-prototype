# Build Instructions — Delivery Tracking & Driver Console

## Prerequisites
- **Runtime**: Node.js v18+ (verified working with v24.15.0)
- **Package manager**: npm (verified working with v11.12.1)
- **System requirements**: Any OS supported by Node.js; no external database server needed (SQLite is file-based)
- **Environment variables** (all optional, sensible defaults provided):
  - `PORT` — HTTP port for the backend (default: `3000`)
  - `DATABASE_PATH` — SQLite file location (default: `<cwd>/delivery-tracking.db`)
  - `JWT_SECRET` — JWT signing secret (default: a hardcoded workshop demo value — **must** be overridden for anything beyond local demo use)

## Project Structure

```
coupang-aidlc-workshop/
├── backend/            # Node.js + TypeScript API/SSE service
└── frontend/
    ├── customer/       # Plain HTML/CSS/JS, served by backend at /customer
    ├── driver/         # Plain HTML/CSS/JS, served by backend at /driver
    └── admin/          # Plain HTML/CSS/JS, served by backend at /admin
```

Only `backend/` has a build step — the 3 frontend apps are static files with no bundler/transpiler, served directly by the backend.

## Build Steps

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment (optional)
```bash
# Only needed to override defaults, e.g.:
export PORT=3000
export JWT_SECRET=some-random-secret-for-this-run
```

### 3. Build the Backend
```bash
npm run build
```
This runs `tsc -p tsconfig.json`, compiling `backend/src/**/*.ts` to `backend/dist/`.

### 4. Verify Build Success
- **Expected output**: no errors printed by `tsc`; exit code 0
- **Build artifacts**: `backend/dist/` containing compiled `.js` files mirroring the `src/` structure
- **Common warnings**: none expected — the project compiles cleanly with `strict: true`

## Running the Application

### Development mode (auto-reload, no separate build step)
```bash
cd backend
npm run dev
```

### Production-style run (after `npm run build`)
```bash
cd backend
npm start
```

Either way, the server:
- Creates/opens the SQLite database and runs migrations automatically
- Seeds sample data on first run only (idempotent — skips if camps already exist)
- Serves the API at `http://localhost:<PORT>/api/...`
- Serves the 3 frontends at `http://localhost:<PORT>/customer`, `/driver`, `/admin`

Seeded credentials: driver `EMP001` / `driver123` (or `EMP002` / `driver123`), admin `morgan` / `admin123`.

## Troubleshooting

### Build fails with dependency errors
- **Cause**: `node_modules` missing or corrupted, or Node version too old
- **Solution**: Delete `backend/node_modules` and `backend/package-lock.json`, re-run `npm install`. Confirm `node --version` is 18+.

### Build fails with compilation errors
- **Cause**: A source file was edited in a way that breaks TypeScript's `strict` checks
- **Solution**: Run `npx tsc -p tsconfig.json --noEmit` to see the exact error and file/line, then fix the type issue

### Server starts but SQLite file is locked / permission denied
- **Cause**: Another process holds a lock on `delivery-tracking.db`, or the working directory isn't writable
- **Solution**: Stop other running instances of the server; ensure the process has write access to its working directory, or set `DATABASE_PATH` to a writable location
