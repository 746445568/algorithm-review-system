# OJ Review Desktop Architecture

## Product shape

- Windows-only desktop app
- Electron shell with React renderer
- Embedded Go local service on `127.0.0.1`
- SQLite persistence
- In-process persistent task queue
- Optional AI provider integration
- AES-GCM encrypted local AI key storage
- Pre-migration SQLite backup

## Runtime layout

- `apps/desktop-electron/`: Electron desktop shell
- `apps/server`: Go local service
- `packaging/windows`: installer and packaging notes

## Electron architecture

### Main process (`main/index.mjs`)

- Manages `ojreviewd` service lifecycle
- Handles app lifecycle (ready, quit, window-all-closed)
- Exposes IPC handlers for renderer communication
- Service health monitoring and auto-restart

### Preload bridge (`preload/index.mjs`)

- Exposes `desktopBridge` API to renderer
- Provides service status and control methods
- Enables safe IPC communication with context isolation

### Renderer (`renderer/src/`)

- React 19 application
- Vite 7 for development and bundling
- Pages: Dashboard, Accounts, Review, Settings
- Real API calls to `http://127.0.0.1:38473`

## Service communication

The Electron main process:

1. Checks for existing healthy service at startup
2. Spawns `ojreviewd` if not running
3. Monitors service health
4. Handles graceful shutdown

### Service binary locations (in order of precedence)

1. `%LOCALAPPDATA%/OJReviewDesktop/bin/ojreviewd.exe`
2. `apps/desktop-electron/bin/ojreviewd.exe`
3. `apps/server/bin/ojreviewd.exe`
4. Dev fallback: `go run ./cmd/ojreviewd`

## Local data directories

- `data/` - SQLite database
- `logs/` - Application logs
- `cache/` - Temporary cache
- `exports/` - Exported data
- `secure/` - Encrypted settings

## Current service capabilities

- `GET /health`
- `GET /api/me`
- `GET /api/accounts`
- `PUT /api/accounts/{platform}`
- `POST /api/accounts/{platform}/sync`
- `GET /api/sync-tasks`
- `GET /api/settings/ai`
- `PUT /api/settings/ai`
- `POST /api/settings/ai/test`
- `POST /api/settings/data/export-diagnostics`