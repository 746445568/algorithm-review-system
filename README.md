# OJ Review Desktop

OJ Review Desktop is a local-first desktop app for algorithm practice review. It syncs online judge submissions, analyzes wrong attempts with an OpenAI-compatible LLM provider, stores data locally in SQLite, and schedules follow-up reviews.

This repository keeps only the software needed to run and build the desktop product:

```text
algorithm-review-system/
├── apps/
│   ├── desktop-electron/  # Electron shell and React/Vite renderer
│   └── server/            # Go ojreviewd service
├── .env.example
├── package.json
└── package-lock.json
```

## Development

Install desktop dependencies:

```bash
cd apps/desktop-electron
npm install
```

Run the desktop app from the repository root:

```bash
npm run desktop:dev
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

## Service

The Electron app starts `ojreviewd` through its ServiceManager. The service listens on `127.0.0.1:38473`, exposes `GET /health`, and serves REST APIs under `/api/*`.

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
