# OJ Review Desktop

OJ Review Desktop is a local-first review tool for algorithm practice. It syncs online judge submissions, analyzes wrong attempts with an OpenAI-compatible LLM provider, and schedules follow-up reviews with spaced repetition.

The legacy Web product has been removed from the active project. Current development is focused on the desktop app:

- Electron main process and preload bridge
- React 19 + Vite renderer
- Go `ojreviewd` service on `127.0.0.1:38473`
- SQLite storage managed directly by the Go service

Historical Web files and uncertain reference material were moved under `_deprecated/web-legacy/`.

## Project Layout

```text
algorithm-review-system/
├── apps/
│   ├── desktop-electron/     # Electron shell and React/Vite renderer
│   │   ├── main/             # Electron main process, ServiceManager
│   │   ├── preload/          # contextBridge desktopBridge API
│   │   ├── renderer/         # React app
│   │   ├── scripts/          # desktop dev/build helpers
│   │   └── test/             # Node desktop tests
│   └── server/               # Go ojreviewd service
│       ├── cmd/ojreviewd/    # service entrypoint
│       └── internal/         # API, storage, jobs, OJ adapters, AI providers
├── scripts/                  # shared desktop/service helper scripts
├── docs/                     # active docs
├── packaging/                # desktop packaging material
└── _deprecated/web-legacy/   # archived legacy Web/reference material
```

## Development

Install desktop dependencies:

```bash
cd apps/desktop-electron
npm install
```

Run the desktop app:

```bash
npm run desktop:dev
```

Run only the renderer for browser debugging:

```bash
npm run desktop:renderer
```

Run the Go service directly:

```bash
npm run server:dev
```

Run checks:

```bash
npm run server:test
npm run desktop:build
```

## Desktop Service Startup

The Electron app starts `ojreviewd` through `ServiceManager`. Startup sources are:

1. `OJREVIEW_SERVICE_PATH`, when explicitly provided.
2. Packaged desktop resources or `apps/desktop-electron/bin/ojreviewd(.exe)`.
3. Development fallback with `go run ./cmd/ojreviewd`.

The service exposes `GET /health` and REST APIs under `/api/*`.

## Environment

Common settings are configured from `.env` or the desktop settings UI:

| Variable | Purpose |
| --- | --- |
| `LLM_API_KEY` | API key for the LLM provider |
| `LLM_API_BASE` | OpenAI-compatible API base URL |
| `LLM_MODEL` | Model used for analysis |
| `OJREVIEW_SERVICE_PATH` | Optional explicit path to the Go service binary |

## License

ISC
