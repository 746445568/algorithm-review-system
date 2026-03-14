# Claude Handoff: Electron Startup Layer Only

## Ownership

- Claude owns `apps/desktop-electron/main`
- Claude owns `apps/desktop-electron/scripts`
- Claude owns `apps/desktop-electron/bootstrap`
- Do not modify `apps/desktop-electron/renderer/src` in this pass

## Current repo state

- `run-static.cmd` is the only official Windows entrypoint.
- Renderer-side data flow is already wired for:
  - runtime bridge failure state
  - dynamic API base URL from `runtimeInfo.serviceUrl`
  - Dashboard / Accounts / Review / Settings real requests
  - review state save and summary update
- Current blocker is before normal app usage: Electron/Chromium dies with `GPU process isn't usable. Goodbye.` on Windows.

## What Claude should optimize for

- Produce the minimum startup combination that can create a window on this machine.
- If startup still fails, error output must identify whether the blocker is:
  - Electron version
  - Chromium GPU startup
  - mapped/UNC path execution
  - inherited process environment

## Frozen interfaces

- Keep `desktopBridge` unchanged:
  - `getRuntimeInfo`
  - `getServiceStatus`
  - `restartService`
  - `openExternal`
  - `openPath`
  - `onServiceStatus`
- Keep Windows entrypoint as `apps/desktop-electron/run-static.cmd`.
- Keep service URL semantics compatible with renderer using `runtimeInfo.serviceUrl`.

## Acceptance criteria

- `apps/desktop-electron/run-static.cmd` opens a window.
- No `app is undefined`.
- No fatal `GPU process isn't usable`.
- If launch fails, the terminal output must explain why without requiring blind retries.
