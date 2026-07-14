# Project Status

**Last verified:** 2026-07-14

**Current release version:** 2.1.0

**Formal target:** Windows x64

This file is a dated execution snapshot, not a substitute for live GitHub state. Verify pull requests and CI before acting on time-sensitive entries.

## Active milestone

The engineering-foundation milestone is implemented on `codex/engineering-foundation` and is under review in [PR #22](https://github.com/746445568/algorithm-review-system/pull/22), targeting `fix/2026-07-02-ui-polish`.

Delivered scope:

- zero-warning lint, typecheck, unit, Go, build, and Electron E2E quality gates;
- bearer-token protection for the local API, restricted CORS, redacted AI settings, Electron sandbox/CSP, and navigation/path allowlists;
- Go-owned background synchronization and one-time migration of pending legacy IndexedDB review-state writes;
- reproducible Windows x64 service metadata validation and packaging;
- one-time browser-extension pairing with an origin-bound, import-only token;
- automatic import of source code already visible in Codeforces submission dialogs/details and AtCoder submission pages, with persistent deduplication and bounded retry;
- documentation of the supported platform and local security model;
- a tracked cross-agent entry point with a required status-maintenance completion protocol.

## Verification state

| Check | State | Evidence or blocker |
| --- | --- | --- |
| Local `npm run verify` | Passed | Lint, typecheck, all Go tests, 23 Node tests, 4 renderer tests, and builds completed with zero warnings on 2026-07-14. |
| Local Electron and extension E2E | Passed | Three desktop tests ran against the real Go service and three unpacked-extension tests covered pairing plus Codeforces/AtCoder automatic source import. |
| Local Windows packaging smoke | Passed | Setup and portable artifacts contained the current service binary; authenticated API returned 200 and unauthenticated API returned 401. |
| GitHub Go jobs | Passed | Both push and pull-request workflow runs completed successfully. |
| GitHub Desktop jobs | Awaiting rerun | The latest remote runs still show the old Windows wildcard failure. The local test command now enumerates files cross-platform and passes, but the change has not been pushed yet. |

PR #22 is therefore **not merge-ready**, despite being structurally mergeable.

## Availability and release state

- Desktop development and internal Windows x64 artifacts are supported.
- The unpacked browser extension is available for development after one-time secure pairing in desktop settings.
- Automatic source import is intentionally limited to source code visible in the current supported OJ page; the extension does not fetch unseen submission pages in the background.
- No public 3.0.0 release should be created from this milestone.
- Missing Windows signing credentials permit internal artifacts only, not a public GitHub Release.

## Next actions

1. Commit and push the browser-extension pairing and automatic visible-source import changes to PR #22.
2. Rerun PR CI and confirm the Desktop jobs pass with the cross-platform Node test runner.
3. Review and merge PR #22 only after all required checks are green.
4. Keep public release disabled until Windows signing credentials are configured.

## Maintenance rule

Before handing off completed work, update this snapshot in the same change whenever project capabilities, milestone state, verification results, blockers, availability, release state, or next actions changed. Revise stale entries instead of treating this file as an append-only diary; Git history provides the audit trail. If the work does not affect project status, verify that this snapshot remains accurate and leave it unchanged. Keep durable engineering rules in `agent.md` or the relevant `AGENTS.md`; keep branch, PR, CI, and release progress here.
