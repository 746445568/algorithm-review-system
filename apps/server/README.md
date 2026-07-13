# ojreviewd local service

`ojreviewd` is the Windows desktop application's local-only Go service. It owns SQLite business state, account/OJ synchronization, persistent jobs, review scheduling, AI integration, and diagnostics.

## Runtime contract

- Fixed listener: `127.0.0.1:38473`
- Public endpoint: `GET /health`
- Protected endpoints: every `/api/*` request requires `Authorization: Bearer <service-token>`
- Token location: `<OJREVIEW_APP_DIR>/secure/service-auth.token`
- Metadata: `--version-json` and `/health` return `version`, `commit`, and `apiVersion`

The browser extension cannot call import endpoints until secure pairing exists. There is no anonymous import exception.

## Commands

```powershell
# From repository root
npm run server:dev
npm run server:test

# Release-compatible binary with desktop version metadata
cd apps/desktop-electron
npm run build:go
./bin/ojreviewd.exe --version-json
```

Use Go 1.26. Release and packaging flows must use `apps/desktop-electron/scripts/build-go.mjs`; do not reuse an older binary.
