# apps/desktop-electron — Electron Desktop Shell

Electron 37 + React 19 + Vite 7 desktop app. Manages `ojreviewd` service lifecycle, renders UI, handles auto-update.

## STRUCTURE

```
apps/desktop-electron/
├── main/                      # Electron main process
│   ├── index.mjs              # Main entry — window creation, service management
│   └── updater.mjs            # electron-updater integration (GitHub releases)
├── preload/index.mjs          # Context bridge — exposes service/runtime APIs to renderer
├── bootstrap/                 # Pre-launch probes (runs before window opens)
│   ├── electron-api.mjs       # Validates Electron can resolve main process API
│   └── launch-env.mjs         # Resolves service binary path + env
├── renderer/                  # React app (see renderer/AGENTS.md)
│   ├── src/                   # Components, hooks, pages, lib
│   ├── dist/                  # Vite build output (gitignored)
│   └── vite.config.mjs
├── scripts/                   # Build/dev scripts
│   ├── dev.mjs                # Dev mode: Vite + Electron + service
│   ├── build.mjs              # Build electron main/preload
│   ├── start-static.mjs       # Static launch (WSL/network drive fallback)
│   └── serve-dist.mjs         # Serve built renderer
├── test/                      # Unit tests (.test.mjs, Node-based)
├── tests/e2e/                 # Playwright E2E tests
├── bin/                       # ojreviewd binary (gitignored, populated by prepare-service.ps1)
├── build/                     # Icons + static build assets
├── prepare-service.ps1        # Copies + validates ojreviewd binary into bin/
├── run-static.cmd             # Windows wrapper for static launch (UNC-safe)
└── package.json               # electron-builder config (NSIS + portable targets)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Main process logic | `main/index.mjs` | Window creation, IPC, service lifecycle |
| Auto-update | `main/updater.mjs` | GitHub provider, `electron-updater` |
| Preload bridge API | `preload/index.mjs` | `contextBridge.exposeInMainWorld` |
| Service binary resolution | `bootstrap/launch-env.mjs` | `OJREVIEW_SERVICE_PATH` → `bin/` → `go run` fallback |
| Electron API probe | `bootstrap/electron-api.mjs` | Fails fast if Electron can't resolve APIs |
| Dev script | `scripts/dev.mjs` | Orchestrates Vite + Electron + Go service |
| WSL/network drive launch | `scripts/start-static.mjs` + `run-static.cmd` | Static path, no file watching |
| Electron-builder config | `package.json` `build` key | NSIS + portable, Win x64, GitHub publish |
| Service binary prep | `prepare-service.ps1` | Validates version match, copies to `bin/` |

## CONVENTIONS

- **ESM only**: `"type": "module"` in package.json — all `.mjs` files
- **No TypeScript in Electron layer**: main/preload/bootstrap are plain `.mjs`; renderer is JSX (no TS)
- **Imports MUST keep file extensions**: `from "./App.jsx"`, `from "./lib/api.js"`, `from "../bootstrap/electron-api.mjs"`
- **Node builtins use `node:` prefix**: `import { spawn } from "node:child_process"`, `import path from "node:path"`
- **Context bridge pattern**: `preload/index.mjs` exposes a single `desktopBridge` object via `contextBridge`
- **IPC channel naming**: domain-prefixed with `:` — `desktop:*` (lifecycle), `updater:*` (auto-update), `service:status` (events)
- **Env vars use `OJREVIEW_` prefix**: `OJREVIEW_SERVICE_PATH`, `OJREVIEW_SERVICE_MAJOR`, `OJREVIEW_BOOTSTRAP_PROBE`, `OJREVIEW_APP_DIR` (exceptions: `WSL_HOST_IP`, `LLM_*`)
- **Vite dev port is `5180`** (not default 5173) — hardcoded in `renderer/vite.config.mjs`
- **Service path resolution order**: `OJREVIEW_SERVICE_PATH` env → `apps/server/bin/ojreviewd(.exe)` → dev `go run` fallback
- **electron-builder targets**: NSIS installer + portable, Windows x64 only
- **Auto-update**: GitHub releases (`owner: 746445568, repo: algorithm-review-system`)
- **`asarUnpack`**: `bin/**/*` unpacked (service binary can't run from inside asar)

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER skip bootstrap probe** — `start-static.mjs` runs `electron-api.mjs` before opening window; removing it causes late `app is undefined` crashes
- **NEVER put service binary inside asar** — must be in `asarUnpack` + `extraResources`
- **NEVER use `node_modules` paths in production** — electron-builder bundles explicitly via `files` key

## COMMANDS

```bash
# Dev
npm run dev                   # Full dev: Vite + Electron + service
npm run dev:renderer          # Vite renderer only (no Electron)
node ./scripts/dev.mjs        # Direct dev (bypass npm.cmd for WSL)

# Static launch (WSL/network drives)
npm run start:static
# or Windows:
apps\desktop-electron\run-static.cmd

# Build
npm run build                 # Renderer + Electron main
npm run build:renderer        # Vite build only
npm run build:electron        # Electron main/preload only
npm run build:go              # Build Go service into bin/
npm run pack                  # Build + unpacked dir (test packaging)
npm run dist                  # Build + installer (NSIS + portable)

# Test
node --test test/             # Unit tests (.test.mjs)
npx playwright test            # E2E tests

# Service prep
.\prepare-service.ps1                                 # Use apps/server/bin/
.\prepare-service.ps1 -SourcePath C:\path\to\bin.exe  # Custom path
```

## NOTES

- **React 19 + SWR**: Renderer uses SWR for data fetching with custom config (`hooks/useSWRConfig.js`)
- **IndexedDB offline cache**: `lib/db.js` uses `idb` package for offline-first data (`hooks/useOfflineData.js`)
- **Desktop bridge**: `lib/desktopBridge.js` wraps preload-exposed APIs for renderer consumption
- **Runtime status**: `lib/runtimeStatus.js` + `hooks/useDesktopRuntime.js` track service health
- **Playwright config**: Both `playwright.config.js` and `playwright.config.ts` exist — check which is active
