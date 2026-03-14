# OJ Review Desktop

This repository is being rewritten from an online prototype into a **Windows desktop product** for competitive programming review.

## Current tracks

- `frontend/` + `backend/`: legacy web prototype
- `apps/desktop/OJReviewDesktop`: WinUI 3 desktop shell
- `apps/server`: Go local service scaffold

## Desktop direction

- Windows-first native app
- embedded Go local service on `127.0.0.1`
- SQLite local persistence
- in-process persistent task queue
- Codeforces + AtCoder + manual entry
- optional AI provider integration
- encrypted local AI provider storage
- migration backup before schema upgrade

## Repository guide

- desktop architecture: `docs/desktop-architecture.md`
- Windows packaging notes: `packaging/windows/README.md`
- local service notes: `apps/server/README.md`

## Current implementation status

- WinUI shell builds and launches as an unpackaged desktop app.
- The shell checks `http://127.0.0.1:38473/health` and attempts to auto-start `ojreviewd.exe` if packaged beside the app.
- The Go local service scaffold now owns schema bootstrap, task persistence, AI settings storage, and diagnostics export.

## Legacy prototype

The old `frontend/` and `backend/` folders are retained as product reference only. They are no longer the long-term runtime target.
