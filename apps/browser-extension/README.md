# OJ Review Companion

Manifest V3 browser extension for importing artifacts from the current browser
page into the local OJ Review service. Submission source is captured
automatically when it becomes visible on a supported page or Codeforces dialog.

## Install During Development

1. Start OJ Review Desktop so the local service is available at
   `http://127.0.0.1:38473`.
2. Open Chrome or Edge extension management.
3. Enable developer mode.
4. Load this folder as an unpacked extension:
   `apps/browser-extension`.
5. In OJ Review Settings, generate a browser-extension pairing code, then enter
   the six-digit code in the extension popup.

## Supported Pages

- Codeforces problem pages:
  - `https://codeforces.com/problemset/problem/{contestId}/{index}`
  - `https://codeforces.com/contest/{contestId}/problem/{index}`
- Codeforces submission pages:
  - `https://codeforces.com/contest/{contestId}/submission/{submissionId}`
- AtCoder task pages:
  - `https://atcoder.jp/contests/{contestId}/tasks/{problemId}`
- AtCoder submission pages when a visible source block exists:
  - `https://atcoder.jp/contests/{contestId}/submissions/{submissionId}`

## Privacy Boundaries

- The extension does not request the `cookies` permission.
- The extension does not read `document.cookie`, `localStorage`, or `sessionStorage`.
- The extension never fetches Codeforces or AtCoder pages in the background.
- The extension requests `scripting` and supported OJ host permissions only to
  run `content.js` on the current supported page.
- The content script only extracts visible problem statement text or visible source
  code text from known DOM blocks on supported pages.
- The service worker sends only the extracted artifact and basic public identifiers
  (`platform`, `externalProblemId`, `externalSubmissionId`, URLs, titles) to the
  local service.
- The extension posts only to `http://127.0.0.1:38473` or `http://localhost:38473`.
- The one-time pairing code produces an import-only token. The token remains in
  trusted extension storage and is never sent to the content script.
- Failed local imports are kept in a bounded extension queue and retried by a
  Chrome alarm; queued artifacts are never sent anywhere except the local service.
