# OJ Fetch Matrix

Last checked: 2026-06-04.

This matrix records how each online judge should provide the artifacts used by
problem analysis: account submissions, problem metadata, problem statements, and
submission source code. It is intentionally conservative: prefer official APIs
where they exist, use public pages for statements, and reserve browser import for
sites where authenticated browser context is the only stable way to access a
user's own source code.

## Capability Status

- `supported`: the backend adapter can fetch this artifact reliably enough for normal use.
- `partial`: usable, but depends on unofficial endpoints, public pages, or login state.
- `unsupported`: do not call this fetcher from analysis code.

## Fetch Paths

- `official_api`: documented or site-provided API, with credentials when required.
- `public_page`: public HTML page parsed by the backend.
- `browser_import`: browser extension/content script imports DOM or browser-authenticated API data into the local service.
- `manual`: user imports or pastes the artifact.

## Platform Matrix

| Platform | Submission list | Problem metadata | Problem statement | Submission source | Login needed | Stability | Recommended strategy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Codeforces | `supported`, official API `user.status` | `supported`, official API `problemset.problems` | `supported`, public problem page with mirror fallback | `supported`, authorized API `user.status?includeSources=true` for own account | Source fetch needs API key/secret | High for submissions/source API, medium for page parsing | Keep as primary reference implementation. Use API credentials for source; use page/mirror for statement. |
| AtCoder | `supported`, kenkoooo AtCoder Problems API | `supported`, kenkoooo resources | `supported`, public task page | `unsupported` in backend; prefer browser import later | Source needs authenticated browser page | Medium; AtCoder Problems is unofficial but widely used | Keep backend submissions/metadata/statement. Do not fetch source until browser import exists. |
| LeetCode | `partial`, unofficial GraphQL/session-cookie workflows | `partial`, GraphQL/problem page | `partial`, GraphQL/problem page | `partial`, GraphQL/session-cookie workflows | Usually yes for personal submissions/source | Medium-low; unofficial and session dependent | Browser import first, backend only after isolating GraphQL queries and session handling. |
| 洛谷 | `partial`, public/private web endpoints and page data | `partial`, public pages or unofficial docs | `partial`, public problem page | `partial`, authenticated browser context | Usually yes for personal submissions/source | Medium-low; no stable official public OJ API found | Browser import first; backend page parsing only for public problem statements. |
| 牛客 | `unsupported` for ACM practice in backend | `partial`, public pages | `partial`, public pages | `partial`, authenticated browser context | Usually yes | Low for ACM practice; enterprise API is not the same product surface | Browser import/manual first. Treat enterprise API docs as non-applicable unless product scope changes. |
| AcWing | `unsupported` | `partial`, public pages | `partial`, public pages | `partial`, authenticated browser context | Usually yes | Low; no stable public API found | Browser import/manual first. Backend public statement parsing can be added only after URL patterns are proven. |
| SPOJ | `partial`, account/history pages | `partial`, public pages | `partial`, public problem pages | `partial`, source visible from own submission pages | Yes for source | Medium-low; page driven | Browser import for source; backend can parse public statements if needed. |
| UVa / uHunt | `partial`, uHunt API | `partial`, uHunt/problem data | `partial`, public problem pages | `unsupported`, source is not generally exposed | No for public stats | Medium for stats, low for statement/source | Use uHunt only for stats/submissions. Source should be manual. |
| Kattis | `partial`, authenticated web/client flows | `partial`, public pages | `partial`, public pages | `partial`, authenticated browser context | Yes for source/submissions | Medium-low; official submit client exists but it is submission-oriented | Browser import for source; backend public statement parsing can be added after platform-specific tests. |

## Implementation Defaults

- The service exposes judge capabilities through `GET /api/system/judges`.
- Browser companion imports use `POST /api/import/problem-statement` and
  `POST /api/import/submission-source`.
- Renderer account-binding UI should show only platforms with `accountSync` equal to `supported` or `partial`.
- Single-problem analysis should only call `FetchStatement` or `FetchSubmissionSource` when the adapter capability is `supported` or `partial`.
- New adapters should implement capabilities first, then tests, then fetchers.
- Browser import must never collect cookies, tokens, localStorage, sessionStorage, or unrelated page data. It should extract only the explicit problem statement or source code block and POST that artifact to the local service.

## Browser Companion MVP

The development extension lives in `apps/browser-extension`.

- It is a Manifest V3 unpacked extension with no build step.
- It currently targets Codeforces problem/source pages and AtCoder task/source pages.
- It requests `activeTab`, `scripting`, local-service host permissions, and host
  permissions for supported OJ pages so it can inject `content.js` before extraction.
- It does not request cookie or storage permissions.
- The content script extracts only visible DOM text from known statement/source blocks.

## Sources

- Codeforces API methods: https://codeforces.com/apiHelp/methods
- AtCoder Problems overview: https://info.atcoder.jp/more/contents/problems
- AtCoder Problems developer/API notes: https://kenkoooo.com/atcoder/book/ja/for_developer.html
- 洛谷 problem help: https://help.luogu.com.cn/manual/luogu/problem/
- 牛客 API docs: https://docs.nowcoder.com/
- SPOJ user tutorial: https://www.spoj.com/tutorials/USERS/
- uHunt API: https://uhunt.onlinejudge.org/api
- Kattis submit guide: https://open.kattis.com/info/submit
