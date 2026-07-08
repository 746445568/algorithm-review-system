# apps/browser-extension - Chrome MV3 Companion

Chrome/Edge MV3 extension. Extracts problem statements + submission source from Codeforces/AtCoder pages, posts to local `ojreviewd` service.

## STRUCTURE

```
apps/browser-extension/
├── manifest.json    # MV3 config: permissions, host_permissions, content_scripts
├── background.js    # Empty service worker (exists so automated tests can detect extension)
├── content.js       # DOM extractor - runs on CF/AtCoder pages, returns artifact via messaging
├── popup.html       # Import button UI
├── popup.css        # Popup styles
├── popup.js         # Orchestrates: inject content.js -> extract -> POST to local service
└── README.md        # Install + supported pages + privacy boundaries
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new OJ platform | `content.js` + `manifest.json` | Add extractor fn + host_permission + content_scripts match |
| Change import endpoint | `popup.js` `endpointFor()` | Maps artifact kind to `/api/import/*` path |
| Modify DOM selectors | `content.js` | Per-platform extractor functions (Codeforces/AtCoder) |
| Change permissions | `manifest.json` | `activeTab`, `scripting` + host_permissions for OJ domains |
| Privacy boundaries | `README.md` | Documents what is/isn't accessed |

## CONVENTIONS

- **No build step**: Plain JS, no bundler, no transpile - load folder as unpacked extension
- **Content script guard**: `window.__ojReviewCompanionContentLoaded` prevents double-injection
- **Artifact shape**: `{ kind: "problem-statement" | "submission-source", payload: {...} }`
- **Message protocol**: `chrome.tabs.sendMessage` with `{ type: "OJ_REVIEW_EXTRACT" }` -> `{ ok, artifact | error }`
- **Local service only**: Posts to `http://127.0.0.1:38473` - never external
- **Codeforces source**: `#program-source-text` element; language from `.submission-info td:nth-child(3)`
- **AtCoder source**: CodeMirror lines (`.CodeMirror-line`) joined; fallbacks: `#submission-code`, `pre.linenums`

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER request `cookies` permission** - extension is privacy-scoped to visible DOM only
- **NEVER read `document.cookie`, `localStorage`, `sessionStorage`** - privacy boundary
- **NEVER post to non-localhost URLs** - only `127.0.0.1:38473` / `localhost:38473`
- **NEVER add build tooling** - intentionally plain JS for easy unpacked loading

## NOTES

- **`background.js` is intentionally empty** - exists only so automated browser tests can detect the extension is installed
- **Supported pages**: CF problem (`/problemset/problem/`, `/contest/.../problem/`), CF submission (`/contest/.../submission/`), AtCoder task (`/contests/.../tasks/`), AtCoder submission (`/contests/.../submissions/`)
- **Dev install**: Load `apps/browser-extension/` as unpacked extension in Chrome/Edge dev mode
- **Import endpoints**: `/api/import/problem-statement`, `/api/import/submission-source` (handled by `apps/server/internal/api/handlers_import.go`)
