# CLAUDE.md

This file provides guidance to Claude Code and other agentic coding tools in this repository.

## Current Product

OJ Review is now maintained as a desktop-only application:

- Electron shell
- React/Vite renderer
- Go `ojreviewd` local service
- SQLite local storage

The old Web app has been removed from active development. Do not recreate `backend/`, `frontend/`, `prisma/`, PM2 config, or Web deployment scripts unless the user explicitly asks to restore the legacy Web product.

Legacy reference files are temporarily archived in `_deprecated/web-legacy/`.

## Commands

From the repository root:

```bash
npm run desktop:dev
npm run desktop:renderer
npm run desktop:build
npm run desktop:dist
npm run desktop:start
npm run server:dev
npm run server:test
```

From `apps/desktop-electron`:

```bash
npm install
npm run dev
npm run dev:renderer
npm run build
npm run dist
node --test test/*.mjs
```

From `apps/server`:

```bash
go run ./cmd/ojreviewd
go test ./...
go build -o ../desktop-electron/bin/ojreviewd.exe ./cmd/ojreviewd
```

## Architecture

```text
renderer (React)
  -> window.desktopBridge
  -> Electron preload/main IPC
  -> ServiceManager
  -> ojreviewd at http://127.0.0.1:38473
  -> SQLite and external integrations
```

Service startup order:

1. `OJREVIEW_SERVICE_PATH`
2. packaged resources or `apps/desktop-electron/bin/ojreviewd(.exe)`
3. development fallback with `go run ./cmd/ojreviewd`

## Working Rules

- Preserve existing user changes in active desktop and Go files.
- Use `apps/desktop-electron/renderer/src/lib/api.js` for renderer API calls.
- Guard `window.desktopBridge` in browser debug mode.
- Use `useNavigation()` from `NavigationContext.jsx` for renderer navigation.
- Keep Go REST endpoints under `/api/*`; keep health at `GET /health`.
- Do not commit generated runtime files, local databases, Playwright reports, Go caches, or temporary Drive upload/download folders.
- Treat `_deprecated/web-legacy/` as archive material only.
