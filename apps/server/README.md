# OJ Review Desktop Local Service

This directory contains the Go-based local service for the Windows desktop rewrite.

## Current scope

- local-only HTTP service on `127.0.0.1`
- SQLite-backed owner profile, platform accounts, problems, submissions, sync tasks, review snapshots, analysis tasks, and app settings
- migration backup before schema bootstrap
- persistent in-process task queue scaffold with restart recovery
- encrypted local AI settings storage
- desktop-facing REST endpoints for health, accounts, sync task creation, AI settings, diagnostics export, and analysis task creation

## Next implementation slices

1. real Codeforces adapter
2. real AtCoder adapter
3. normalized problem/submission writes from adapters
4. review aggregation by problem
5. packaged `ojreviewd.exe` delivery with the Electron app
