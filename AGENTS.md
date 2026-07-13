# OJReview Agent Entry Point

This file applies to the entire repository. A nearer `AGENTS.md` adds directory-specific guidance and takes precedence when its instructions conflict with this file.

## Required startup sequence

1. Read `agent.md` for the repository's durable working rules.
2. Read `PROJECT_STATUS.md` for the latest recorded milestone, blockers, availability, and next actions.
3. Read `README.md` for the supported product surface and development commands.
4. Read the nearest scoped `AGENTS.md` before changing files under an application directory.
5. Inspect the current branch, worktree status, and relevant GitHub PR/CI state before acting on time-sensitive information.

Do not overwrite unrelated local changes. The main worktree may contain user-owned edits while active work proceeds in an isolated worktree.

## Information sources

| Information | Source |
| --- | --- |
| Durable behavioral rules | `agent.md` and the applicable `AGENTS.md` files |
| Current execution snapshot | `PROJECT_STATUS.md` |
| Product overview and supported commands | `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` |
| Release history | `CHANGELOG.md` |
| Live branch, PR, CI, and release state | Git and GitHub; verify at the source |
| Implementation truth | Current source code, tests, and configuration |

`PROJECT_STATUS.md` is a dated snapshot. If it or an `AGENTS.md` disagrees with live GitHub state or the current implementation, verify the discrepancy and update the tracked documentation as part of the same change.

Private conversation history or tool-specific agent memory is not a project source of truth. Record decisions that future agents need in tracked repository documentation.

## Scoped guidance

- `apps/server/AGENTS.md`: Go service, API, jobs, storage, and build metadata.
- `apps/desktop-electron/AGENTS.md`: Electron lifecycle, security boundary, tests, and Windows packaging.
- `apps/desktop-electron/renderer/AGENTS.md`: React renderer, state ownership, navigation, and UI conventions.
- `apps/browser-extension/AGENTS.md`: browser-extension constraints and current import boundary.

Never modify `_deprecated/`; it is outside the runtime product.
