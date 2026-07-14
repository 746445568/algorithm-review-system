# apps/desktop-electron/renderer — React UI

React 19 + Vite 7 SPA. Pages: Dashboard, Accounts, Review, Analysis, Contests, Statistics, Settings. Data via SWR + IndexedDB offline cache.

## STRUCTURE

```
renderer/src/
├── main.jsx                   # React entry point
├── App.jsx                    # Root component + routing
├── i18n.js                    # react-i18next initialization
├── styles.css                 # Root styles
├── pages/                     # Route-level components (10 pages)
│   ├── DashboardPage.jsx
│   ├── AccountsPage.jsx
│   ├── ReviewPage.jsx         # Review list + detail container
│   ├── ReviewList.jsx
│   ├── ReviewDetail.jsx
│   ├── AnalysisPage.jsx
│   ├── ContestsPage.jsx
│   ├── StatisticsPage.jsx
│   ├── SettingsPage.jsx
│   └── OnboardingPage.jsx
├── components/                # Reusable UI components
│   ├── Analysis/              # LLM analysis display components
│   ├── Dashboard/             # Dashboard-specific widgets
│   ├── ReviewDetail/          # Review detail sub-components
│   ├── statistics/            # Charts + stats display
│   ├── ErrorBoundary.jsx      # React error boundary
│   ├── ErrorPageFallback.jsx
│   ├── ProblemDetailPanel.jsx
│   ├── ReviewFilterBar.jsx
│   ├── ReviewStateEditor.jsx
│   ├── ServiceRuntimePanel.jsx # Service health/status UI
│   └── SimpleMarkdown.jsx     # Lightweight Markdown renderer
├── hooks/                     # Custom React hooks (9 hooks)
│   ├── useSWRConfig.js        # SWR configuration
│   ├── useDashboardData.js
│   ├── useReviewData.js
│   ├── useReviewFilters.js
│   ├── useReviewFlow.js
│   ├── useAnalysisTask.js
│   ├── useOfflineData.js      # IndexedDB offline cache
│   ├── useDesktopRuntime.js   # Service health tracking
│   └── useThemeMode.js
├── lib/                       # Non-React utilities (11 modules)
│   ├── api.js                 # REST client (127.0.0.1:38473/api/*)
│   ├── http.js                # Fetch wrapper
│   ├── db.js                  # IndexedDB (idb) offline store
│   ├── desktopBridge.js       # Wraps preload contextBridge API
│   ├── runtimeStatus.js       # Service runtime status constants
│   ├── sync.js                # Data sync logic
│   ├── format.js              # Formatting utilities
│   ├── theme.js               # Theme management
│   ├── logger.js              # Logging utility
│   ├── renderInline.jsx       # Inline content renderer
│   └── NavigationContext.jsx  # Navigation context provider
├── locales/                   # i18n translation files (en-US.json, zh-CN.json)
└── styles/                    # CSS stylesheets
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new page | `pages/` + register route in `App.jsx` | Follow `XxxPage.jsx` naming |
| Add API call | `lib/api.js` → `hooks/useXxxData.js` | SWR pattern, not direct fetch in components |
| Add offline data | `lib/db.js` (schema) → `hooks/useOfflineData.js` | IndexedDB via `idb` |
| Service status UI | `components/ServiceRuntimePanel.jsx` + `hooks/useDesktopRuntime.js` | |
| Theme switching | `hooks/useThemeMode.js` + `lib/theme.js` | |
| Markdown rendering | `components/SimpleMarkdown.jsx` + `lib/renderInline.jsx` | Lightweight, not full MD parser |
| Error handling | `components/ErrorBoundary.jsx` + `ErrorPageFallback.jsx` | Wrap page-level components |
| Navigation | `lib/NavigationContext.jsx` | Context-based, not react-router |
| i18n / translations | `i18n.js` + `locales/{en-US,zh-CN}.json` | react-i18next, add keys to both locale files |

## CONVENTIONS

- **JSX, not TypeScript**: All files are `.jsx`/`.js` — no TypeScript in renderer
- **File extension rule**: `.jsx` for components/pages/contexts (PascalCase), `.js` for hooks (`use*`) and lib utilities (camelCase)
- **Imports MUST keep extensions**: `from "./App.jsx"`, `from "./hooks/useOfflineData.js"`, `from "./lib/api.js"`
- **SWR for server state**: All API data goes through SWR hooks (`hooks/useXxxData.js`), never direct `fetch` in components
- **SWR config centralized in `App.jsx`**: `dedupingInterval: 20`, `timeout: 10000`, `errorRetryCount: 3` — hooks should NOT define their own config
- **React imports**: prefer named hooks (`import { useState } from "react"`), not default `React` import
- **CSS is feature-sliced**: plain CSS files in `styles/` (e.g., `ui-shell.css`, `ui-dashboard-review.css`) — no CSS modules, no Tailwind
- **Page naming**: `XxxPage.jsx` for route components
- **API base**: `http://127.0.0.1:38473/api/*` — hardcoded in `lib/api.js`
- **Offline-first**: `useOfflineData.js` mirrors server data to IndexedDB for offline access
- **i18n**: `react-i18next` initialized in `i18n.js`; translation JSON in `locales/` (`en-US.json`, `zh-CN.json`) - always add new keys to BOTH locale files

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER call `fetch` directly in components** — use SWR hooks (`hooks/useXxxData.js`)
- **NEVER use `react-router`** — navigation is via `NavigationContext.jsx`
- **NEVER use prop-based `onNavigate` callbacks** — use `useNavigation()` hook from `NavigationContext`
- **NEVER call `window.desktopBridge.*` without existence check** — renderer runs in browser-debug mode (no Electron) when `desktopBridge` is undefined
- **NEVER assume `reviewStatus` is set** — schema allows null, always default with `item.reviewStatus || "TODO"`
- **NEVER add TypeScript** — renderer is intentionally JSX-only
- **NEVER hardcode API URLs in components** — use `lib/api.js`
- **NEVER bypass `desktopBridge.js`** for Electron IPC — it wraps the preload bridge
- **NEVER introduce external state library** — use local `useState` + `useCallback`

## NOTES

- **SWR config**: Centralized in `hooks/useSWRConfig.js` — all data hooks consume it
- **`ServiceRuntimePanel`**: Visible service health indicator — if service is down, UI degrades gracefully
- **Onboarding flow**: `OnboardingPage.jsx` handles first-run setup (LLM config, account linking)
