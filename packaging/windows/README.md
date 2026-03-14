# Windows packaging

This directory is reserved for the Windows installer flow of OJ Review Desktop.

## Planned packaging responsibilities

- ship the Electron desktop app
- ship the `ojreviewd` local service binary
- initialize first-run application directories
- preserve SQLite data across upgrades
- surface migration and rollback failures to the user

## Packaging target

- one-click Windows installer
- data stored under the current user's local app data directory

## Current binary placement contract

The Electron app looks for the local service binary in these locations (in order):

1. `process.resourcesPath/bin/ojreviewd.exe` (packaged)
2. `app.getAppPath()/bin/ojreviewd.exe` (development)
3. `apps/server/bin/ojreviewd.exe` (repo development)
4. Dev fallback: `go run ./cmd/ojreviewd`

## Electron packaging

The app uses Electron's standard packaging flow:

```bash
cd apps/desktop-electron
npm run build
```

Renderer output is written to `apps/desktop-electron/renderer/dist`.