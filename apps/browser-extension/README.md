# OJ Review Companion

Manifest V3 browser extension for importing artifacts from the current browser
page into the local OJ Review service.

## Install During Development

1. Start OJ Review Desktop or `ojreviewd` so the local service is available at
   `http://127.0.0.1:38473`.
2. Open Chrome or Edge extension management.
3. Enable developer mode.
4. Load this folder as an unpacked extension:
   `apps/browser-extension`.

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
- The extension requests `scripting` and supported OJ host permissions only to
  inject `content.js` into the current supported page before extraction.
- The content script only extracts visible problem statement text or visible source
  code text from known DOM blocks on supported pages.
- The popup sends only the extracted artifact and basic public identifiers
  (`platform`, `externalProblemId`, `externalSubmissionId`, URLs, titles) to the
  local service.
- The extension posts only to `http://127.0.0.1:38473` or `http://localhost:38473`.
