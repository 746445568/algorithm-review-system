# Contributing to OJReview

## Requirements

- Windows x64
- Node.js 20+
- Go 1.26
- Git

## Setup

```powershell
git clone https://github.com/746445568/algorithm-review-system.git
cd algorithm-review-system
npm ci --prefix apps/desktop-electron
npm run desktop:dev
```

## Required checks

Run the same zero-warning gate used by CI:

```powershell
cd apps/desktop-electron
npm run verify
npm run test:e2e
```

`verify` runs ESLint with `--max-warnings=0`, TypeScript, Node and renderer unit tests, Go tests, a metadata-injected Go build, and the renderer/Electron build. Browser-extension E2E is intentionally outside the gate until secure pairing is implemented; do not mark it skipped and claim coverage.

For internal Windows artifacts:

```powershell
cd apps/desktop-electron
npm run dist
```

Public release creation is disabled. A release tag must equal `v${desktopVersion}`, the service metadata must match, and unsigned artifacts are internal only.

## Change discipline

- Use Conventional Commits (`test`, `fix`, `refactor`, `build`, `docs`, and so on).
- Keep the Go service bound to localhost.
- Never expose service tokens or AI keys to renderer code, JSON responses, logs, or diagnostics.
- Add behavior tests for fixes; do not add source-regex or `expect(true)` tests.
- Do not modify `_deprecated/`.

See [SECURITY.md](./SECURITY.md) before changing authentication, navigation, IPC, or secret handling.
