# AGENTS.md

This file provides guidance to Codex and other coding agents when working in this repository.

# OJ Review Desktop

## Project Summary

This repository now contains only the desktop product line for OJ Review. The legacy Web app, Prisma schema, and PM2/server deployment configuration have been removed from the active codebase. Archived legacy material lives under `_deprecated/web-legacy/` for temporary reference.

The active product is a local-first desktop app for algorithm practice review:

- sync online judge submissions,
- analyze wrong submissions through an OpenAI-compatible LLM provider,
- store data locally in SQLite,
- schedule spaced repetition reviews.

## Active Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 37, ESM `.mjs` |
| Renderer | React 19, Vite 7, JSX |
| Service | Go `ojreviewd`, REST API on port `38473` |
| Database | SQLite, accessed directly from Go |
| OJ integrations | Codeforces and related adapters in Go |
| AI analysis | OpenAI-compatible API, configurable `LLM_API_BASE` |

## Active Layout

```text
algorithm-review-system/
├── apps/
│   ├── desktop-electron/
│   │   ├── main/             # Electron main process and ServiceManager
│   │   ├── preload/          # contextBridge desktopBridge API
│   │   ├── renderer/src/     # React UI
│   │   ├── scripts/          # desktop dev/build scripts
│   │   └── test/             # Node test files
│   └── server/
│       ├── cmd/ojreviewd/    # Go service entrypoint
│       └── internal/         # API, storage, jobs, adapters, providers
├── scripts/                  # shared desktop/service helpers
├── docs/                     # active docs
├── packaging/                # desktop packaging assets
└── _deprecated/web-legacy/   # archived legacy Web/reference files
```

## Common Commands

From the repository root:

```bash
npm run desktop:dev       # Start Vite + Electron, including the Go service
npm run desktop:renderer  # Start only the Vite renderer
npm run desktop:build     # Build renderer and Electron package assets
npm run desktop:dist      # Build Windows installers/packages
npm run desktop:start     # Start the static desktop preview flow
npm run server:dev        # Run ojreviewd directly
npm run server:test       # Run Go tests
```

Desktop package commands can also be run from `apps/desktop-electron`.

## Architecture Notes

### Electron Communication Path

```text
renderer (React)
  -> window.desktopBridge.*
  -> ipcMain.handle(...)
  -> ServiceManager
  -> http://127.0.0.1:38473
  -> Go ojreviewd REST API
```

### Service Startup Sources

`ServiceManager` should keep startup sources limited to:

1. `OJREVIEW_SERVICE_PATH`, when explicitly configured.
2. Packaged Electron resources or `apps/desktop-electron/bin/ojreviewd(.exe)`.
3. Development fallback through `go run ./cmd/ojreviewd`.

Do not reintroduce scanning of historical desktop or Web folders.

### Browser Debug Mode

When `window.desktopBridge` is missing, the renderer should support browser debugging:

- try the Vite proxy first,
- fall back to `http://127.0.0.1:38473`,
- guard every `window.desktopBridge` call.

## Coding Rules

### Electron Renderer

- Use JSX, not TypeScript interfaces.
- Put page-level UI under `renderer/src/pages/` or existing page components.
- Use local React state and hooks; do not add a global state library.
- Use `renderer/src/lib/api.js` for API calls instead of direct `fetch`.
- Use `useNavigation()` from `renderer/src/lib/NavigationContext.jsx` for page navigation.
- For async AI analysis tasks, poll `api.getAnalysisTask(id)` until `SUCCESS` or `FAILED`; manage timers with `setTimeout` and `useRef`, and clear timers on unmount.

### Electron Main/Preload

- Main and preload code are pure ESM `.mjs`.
- Keep IPC methods small and explicit.
- Do not expose raw Node APIs to the renderer.

### Go Service

- Keep REST API paths under `/api/*`.
- `GET /health` returns service health information.
- Keep database access in the storage layer.
- Prefer focused Go tests with `testing` and `httptest`.

### Cleanup Boundaries

- Do not restore `backend/`, `frontend/`, `prisma/`, PM2 config, or Web deployment scripts.
- Do not treat `_deprecated/web-legacy/` as active code.
- Generated files such as `.tmp.drive*/`, Playwright reports, desktop runtime data, Go caches, and build output should stay ignored.
