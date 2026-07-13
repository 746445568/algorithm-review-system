# Changelog

All notable changes to this project will be documented in this file.
See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [Unreleased]

### Engineering foundation

- Added zero-warning lint, typecheck, Node, Vitest, Go, build, and CI quality gates.
- Protected local APIs with a persistent bearer token and restricted CORS, Electron navigation, filesystem access, sandboxing, and CSP.
- Removed renderer-owned synchronization and runtime IndexedDB state; added a one-time pending review-state migration.
- Made the desktop version authoritative and Windows x64 service/package builds metadata-verifiable and reproducible.
- Temporarily disabled browser-extension imports pending secure pairing; public release creation remains blocked.

## [2.1.0] - 2026-07-08

### Bug Fixes

- **browser-extension**: Fix content.js payload field names to match backend handlers_import.go (`statementHtml` → `statementText`, `sourceContestId` → `externalContestId`, `pageUrl` → `url`, removed `pageTitle` and `status` fields). The browser extension was completely non-functional - every import attempt returned 400 Bad Request.
- **ai-provider**: Fix OpenAI provider validation always failing. `validateOpenAICompatibleConfig` compared the normalized name (`openai-compatible`) with the raw name (`openai`), causing every OpenAI configuration test and analysis task to fail. DeepSeek was not affected.
- **knowledge-graph**: Fix `SyncTagsToKnowledgeGraph` failing with FOREIGN KEY constraint error when `problem_tags` contains entries referencing deleted problems. Added `WHERE EXISTS` filter to skip orphaned tags.

### Tests

- Add `openai_test.go` with 6 table-driven test cases for OpenAI `ValidateConfig`
- Add `TestSyncTagsToKnowledgeGraph_OrphanedTags` test case for knowledge graph FK fix
- Add Playwright E2E tests for browser extension (4 scenarios: CF problem, CF submission, AtCoder task, AtCoder submission) with mock HTML fixtures

### Engineering

- Add `.golangci.yml` linter config for Go (errcheck, govet, staticcheck, revive, etc.)
- Add `eslint.config.js` flat config for React renderer (jsx-a11y, react-hooks, react-refresh)
- Fix `.env.example`: remove stale `PORT=3001`/`BACKEND_ORIGIN`/`CODEFORCES_OIDC` settings, update to reflect actual service port 38473
- Add `.gitkeep` with purpose comments for empty placeholder directories (`cmd/statementprobe/`, `packaging/windows/`)
- Update AGENTS.md hierarchy: root, server, desktop-electron, renderer, browser-extension (new)
