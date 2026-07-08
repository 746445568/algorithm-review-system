# apps/server — Go Backend (ojreviewd)

Local-only HTTP service for the OJ Review desktop app. Go 1.26, pure-Go SQLite, no CGO.

## STRUCTURE

```
apps/server/
├── cmd/
│   ├── ojreviewd/main.go       # Service entry point
│   └── statementprobe/         # Empty placeholder (future statement scraper)
├── internal/
│   ├── adapters/
│   │   ├── ai/                 # LLM providers: openai, deepseek, ollama + factory + shared/complete helpers
│   │   └── judges/             # OJ adapters: codeforces, atcoder + htmlmd, placeholders, problem_catalog
│   ├── api/                    # HTTP server + handlers (accounts, analysis, contests, health, review, sync, import, problem_pool, radar, rating)
│   ├── app/config.go           # App configuration
│   ├── buildinfo/buildinfo.go  # Version info (injected via -ldflags)
│   ├── crypto/vault.go         # Encrypted local storage for AI API keys
│   ├── jobs/queue.go           # Persistent in-process task queue (restart-resilient)
│   ├── models/types.go         # Domain models (single file)
│   ├── srs/sm2.go              # SM2 spaced repetition algorithm
│   └── storage/                # SQLite data layer (31 files: accounts, problems, submissions, sync_tasks, review_states, analysis_tasks, settings, snapshots, contests, chats, goals, diagnostics, error_patterns, knowledge, problem_pool, rating_history, recommendations)
├── scripts/
│   ├── build-service.ps1       # Windows build with version injection
│   └── build-service.sh        # Linux/macOS build with version injection
└── go.mod                      # module: ojreviewdesktop, go 1.26.0
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add REST endpoint | `internal/api/handlers_*.go` + register in `server.go` | Handler pattern: `handlers_<resource>.go`; 27 files now (import, problem_pool, radar, rating added) |
| Add storage table/queries | `internal/storage/<resource>.go` | One file per resource, `helpers.go` for shared; 31 files now (error_patterns, knowledge, problem_pool, rating_history, recommendations added) |
| Add OJ platform adapter | `internal/adapters/judges/` | Implement `adapter.go` interface; see `codeforces.go` as reference |
| Add LLM provider | `internal/adapters/ai/` | Implement `provider.go` interface; register in `factory.go` |
| Modify review scheduling | `internal/srs/sm2.go` | SM2 algorithm implementation |
| Modify task queue | `internal/jobs/queue.go` | Persistent queue, survives restart |
| Encrypt/decrypt secrets | `internal/crypto/vault.go` | Used for AI API key storage |
| Change app config | `internal/app/config.go` | |
| Inject build version | `internal/buildinfo/buildinfo.go` | Set via `-ldflags`, verify with `--version-json` |

## CONVENTIONS

- **Handler naming**: `handlers_<resource>.go` (e.g., `handlers_accounts.go`, `handlers_review.go`)
- **Storage naming**: one `<resource>.go` per domain entity + `sqlite.go` for DB init/migrations + `helpers.go` for shared utilities
- **Adapter pattern**: `adapter.go` defines interface; `<platform>.go` implements; `<platform>_client.go` for HTTP; `<platform>_mapper.go` for data mapping; `<platform>_types.go` for DTOs
- **Import aliasing**: alias only on stdlib name clash — e.g., `import cryptovault "ojreviewdesktop/internal/crypto"` (clashes with stdlib `crypto`)
- **Storage methods on `*DB` receiver**: `func (db *DB) ListAccounts() ([]models.PlatformAccount, error)` with Go-doc comment
- **Tests**: `*_test.go` next to source, table-driven, run with `go test -race ./...`
- **Database**: SQLite via `modernc.org/sqlite` (pure Go); migrations auto-backup before running

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER use CGO SQLite** (`mattn/go-sqlite3`) — project uses `modernc.org/sqlite`
- **NEVER store API keys in plaintext** — use `crypto/vault.go`
- **NEVER skip error wrapping** — bare `return err` without context is rejected
- **NEVER define large interfaces** — keep to 1-3 methods, consumer-defined

## COMMANDS

```bash
# Dev
go run ./cmd/ojreviewd                    # Start service
go test ./...                             # All tests
go test -race ./...                       # Tests with race detector
go test -cover ./...                      # Coverage

# Build with version injection
pwsh ./scripts/build-service.ps1
./scripts/build-service.sh
# Override: -Version 1.2.3 -Commit abc123

# Verify version
./bin/ojreviewd --version-json

# Build into desktop-electron/bin/
cd ../desktop-electron && npm run build:go
```

## NOTES

- **Module name is `ojreviewdesktop`** in go.mod, not `ojreviewd` — binary name differs from module name
- **Task queue is in-process** (`jobs/queue.go`) — persistent across service restarts, not a separate worker
- **`htmlmd.go`** in judges/ converts HTML problem statements to Markdown for LLM analysis
- **`placeholders.go`** in judges/ provides stub data for adapters not yet implemented
- **AI providers**: OpenAI-compatible (openai.go), DeepSeek (deepseek.go), Ollama local (ollama.go) — factory pattern selects provider; `shared.go` + `complete.go` provide common helpers
- **SM2 algorithm** (`srs/sm2.go`) is the spaced repetition scheduler — determines review intervals
- **Problem catalog** (`adapters/judges/problem_catalog.go`) maps external OJ problem IDs to internal canonical form
- **Import endpoints** (`handlers_import.go`) receive artifacts from the browser extension (`/api/import/problem-statement`, `/api/import/submission-source`)
