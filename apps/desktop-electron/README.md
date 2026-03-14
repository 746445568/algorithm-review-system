# OJ Review Electron Desktop

## Current scope

- Electron main process with local service lifecycle management
- Preload bridge for runtime state and service restart
- React renderer with `Dashboard`, `Accounts`, and `Review`
- Real API reads against `http://127.0.0.1:38473`
- `Review` state save requires an `ojreviewd.exe` built from the current `apps/server` source

## Development

Prerequisites:

- Node.js 20+
- `ojreviewd` binary on disk, or Go installed so Electron can fall back to `go run ./cmd/ojreviewd`

Commands:

```bash
cd apps/desktop-electron
npm install
npm run dev
```

If the repo is being run from `\\wsl.localhost\...` or a mapped network drive and Vite file watching fails, use the static path instead:

```bash
cd apps/desktop-electron
npm run start:static
```

`start:static` now runs an Electron bootstrap probe before opening the real window.
If Electron cannot resolve its own main-process APIs on this machine, the command
fails early with a detailed diagnostic instead of crashing later with `app is undefined`.

On Windows `cmd.exe`, you can also use the wrapper:

```cmd
apps\desktop-electron\run-static.cmd
```

`run-static.cmd` is the preferred Windows entrypoint. It maps the UNC path with
`pushd`, prepares `ojreviewd.exe`, then runs the same bootstrap-checked static start.
It also strips inherited `ELECTRON_RUN_AS_NODE` before launching Electron.

If `Dashboard` and `Accounts` load but `Review` shows a 404-style error for
`/api/review/items/{problemId}`, the running `ojreviewd.exe` is older than the
renderer. Replace it with a freshly built binary from `apps/server`, then rerun
`apps\\desktop-electron\\run-static.cmd`.

PowerShell on a `\\wsl.localhost\...` path should avoid `npm.cmd` for runtime startup.
After dependencies are installed, you can start Electron directly with:

```powershell
node .\apps\desktop-electron\scripts\dev.mjs
```

If you already have a built service binary, prepare it for Electron with:

```powershell
.\apps\desktop-electron\prepare-service.ps1
```

Or point to a custom binary:

```powershell
$env:OJREVIEW_SERVICE_PATH = "C:\path\to\ojreviewd.exe"
.\apps\desktop-electron\prepare-service.ps1
```

## Build

```bash
cd apps/desktop-electron
npm run build
```

Renderer output is written to `apps/desktop-electron/renderer/dist`.
