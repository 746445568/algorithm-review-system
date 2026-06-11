# OJ Review Desktop

[![Release](https://github.com/746445568/algorithm-review-system/actions/workflows/release.yml/badge.svg)](https://github.com/746445568/algorithm-review-system/releases)

OJ Review Desktop is a local-first desktop app for algorithm competition review. It syncs online judge submissions (Codeforces / AtCoder), analyzes wrong attempts with an OpenAI-compatible LLM provider, stores data locally in SQLite, and schedules follow-up reviews using the SM-2 spaced repetition algorithm.

## Features

- 🔄 **Multi-platform sync** — Codeforces and AtCoder submission history
- 🤖 **AI-powered analysis** — Automatic error pattern detection, knowledge graph, and problem analysis
- 📅 **Spaced repetition** — Adaptive SM-2 algorithm with review calendar and streak tracking
- 📊 **Statistics & visualization** — Verdict distribution, ability radar, rating curve, knowledge graph
- 💬 **Chat with AI** — Socratic tutoring mode and direct Q&A for each problem
- 🌐 **Cross-platform** — Windows, macOS, Linux

## Installation

Download the latest release from the [Releases page](https://github.com/746445568/algorithm-review-system/releases).

| Platform | Package |
|----------|---------|
| Windows  | `OJReviewDesktop-x.x.x-win-x64.exe` (NSIS installer) |
| macOS    | `OJReviewDesktop-x.x.x-mac-x64.dmg` |
| Linux    | `OJReviewDesktop-x.x.x-linux-x64.AppImage` |

## Quick Start

1. Install and launch the app
2. Add your Codeforces or AtCoder account in Settings
3. Configure an AI provider (OpenAI / DeepSeek / Ollama) in Settings
4. Sync your submissions — the app will fetch your history
5. Review problems and get AI-powered analysis

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed setup instructions.

### Prerequisites

- Go 1.22+
- Node.js 20+

### Quick Start

```bash
# Backend
cd apps/server
go run ./cmd/ojreviewd

# Frontend (in another terminal)
cd apps/desktop-electron
npm install
npm run dev
```

### Run Tests

```bash
# Backend tests
cd apps/server && go test ./...

# Frontend tests
cd apps/desktop-electron && npm test
```

## Architecture

```
[browser extension]  --HTTP POST--> [Go Server :38473] <--HTTP REST-- [Electron renderer]
                                        |
                                  [SQLite + AES Vault]
```

- **Go server** (`apps/server`) — REST API, SQLite storage, AI integration, sync engine
- **Electron app** (`apps/desktop-electron`) — React 19 + Vite renderer, offline-first with IndexedDB cache
- **Browser extension** (`apps/browser-extension`) — Import problem statements and submission sources

See [CLAUDE.md](./CLAUDE.md) for the full architecture overview.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22+, standard `net/http`, SQLite (pure-Go via `modernc.org/sqlite`) |
| Frontend | React 19, Vite 7, SWR, react-i18next |
| Desktop | Electron 37, electron-builder, electron-updater |
| AI | OpenAI-compatible API (OpenAI / DeepSeek / Ollama) |
| Testing | Go stdlib `testing`, Playwright |

## License

ISC
