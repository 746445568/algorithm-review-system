# OJ Review Desktop Architecture

## Product shape

- Windows-only desktop app
- WinUI 3 shell
- Embedded Go local service on `127.0.0.1`
- SQLite persistence
- In-process persistent task queue
- Optional AI provider integration
- AES-GCM encrypted local AI key storage
- Pre-migration SQLite backup

## Runtime layout

- `apps/desktop/OJReviewDesktop`: WinUI shell
- `apps/server`: Go local service
- `packaging/windows`: installer and packaging notes

## First implementation slice

1. Desktop shell and information architecture
2. Local service bootstrapping, health, owner profile, account binding
3. Schema bootstrap for accounts, problems, submissions, sync tasks, snapshots, and analysis tasks
4. Queue persistence and restart recovery
5. AI settings, diagnostics export, and adapter placeholders

## Local data directories

- `data/`
- `logs/`
- `cache/`
- `exports/`
- `secure/`

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
