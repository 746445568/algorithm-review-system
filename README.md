# OJReview Desktop

OJReview is a local-first algorithm review application. It synchronizes Codeforces and AtCoder submissions, stores business data in local SQLite, analyzes mistakes through an OpenAI-compatible provider, and schedules reviews with SM-2.

Windows x64 is the only formally supported target. macOS and Linux packages are not produced by the release workflow.

## Current availability

- Desktop development and internal Windows artifacts are supported.
- The browser extension is temporarily unavailable because all local API imports now require authentication. It will return after one-time secure pairing and a dedicated import token are implemented.
- Governance work does not publish a public 3.0.0 release. Unsigned builds remain internal CI artifacts.

## Requirements

- Windows x64
- Node.js 20 or newer
- Go 1.26 (as declared by `apps/server/go.mod`)

## Development and verification

```powershell
npm ci --prefix apps/desktop-electron
npm run desktop:dev

# Complete local quality gate
cd apps/desktop-electron
npm run verify

# Core Electron/renderer E2E collection and execution
npm run test:e2e

# Internal Windows installer and portable package
npm run dist
```

`npm run dist` always rebuilds `ojreviewd.exe`, verifies its version metadata, builds the renderer once, and packages Windows x64 artifacts.

## Local security model

The Go service binds only to `127.0.0.1:38473`. `/health` is public; every `/api/*` endpoint requires a bearer token. A random 32-byte token is stored under the application's `secure` directory. Electron and the development Vite proxy inject it outside the renderer, so renderer JavaScript cannot read it. AI API keys are encrypted at rest and settings responses expose only `hasApiKey`.

The Electron renderer runs with Chromium sandboxing and a restrictive CSP. External navigation is limited to Codeforces and AtCoder, and filesystem opening is limited to application/runtime/export directories.

## Architecture

```text
Electron renderer -- authenticated local HTTP --> Go service -- SQLite
       ^                                           |
       | token injected by main/Vite proxy         +-- persistent sync jobs
Electron main
```

- `apps/desktop-electron`: Electron 37, React 19, Vite 7, SWR session cache
- `apps/server`: Go 1.26, `net/http`, pure-Go SQLite
- `apps/browser-extension`: retained source; blocked pending secure pairing

See [Project Status](./PROJECT_STATUS.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [SECURITY.md](./SECURITY.md).

## License

ISC
