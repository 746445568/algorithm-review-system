# OJ Review Desktop

This repository is being rewritten from an online prototype into a **Windows desktop product** for competitive programming review.

## Current tracks

- `apps/desktop-electron/`: **Electron desktop shell**
- `apps/server`: Go local service
- `frontend/` + `backend/`: legacy web prototype (保留参考)

## Desktop direction

- Windows-first desktop app
- Electron shell with React renderer
- embedded Go local service on `127.0.0.1`
- SQLite local persistence
- in-process persistent task queue
- Codeforces + AtCoder + manual entry
- optional AI provider integration
- encrypted local AI provider storage
- migration backup before schema upgrade

## Repository guide

- desktop architecture: `docs/desktop-architecture.md`
- Electron development: `apps/desktop-electron/README.md`
- local service notes: `apps/server/README.md`

## Quick start

```bash
cd apps/desktop-electron
npm install
npm run dev
```

See `QUICKSTART.md` for detailed instructions.

## Current implementation status

- Electron shell builds and launches with React renderer.
- The shell manages `ojreviewd` Go service lifecycle.
- The Go local service owns schema bootstrap, task persistence, AI settings storage, and diagnostics export.

## Legacy prototype

The old `frontend/` and `backend/` folders are retained as product reference only. They are no longer the long-term runtime target.
