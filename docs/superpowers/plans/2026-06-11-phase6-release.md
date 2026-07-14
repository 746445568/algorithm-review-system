# Phase 6 发布准备 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OJReviewDesktop 搭建完整的 CI/CD 自动发布流水线和开源项目基础设施。

**Architecture:** GitHub Actions 在 tag 推送时触发，矩阵构建三平台 Electron 包，上传到 GitHub Release。使用 standard-version 管理版本号和 CHANGELOG。新增开源文档和 Issue/PR 模板。

**Tech Stack:** GitHub Actions, standard-version, electron-builder (已集成), Conventional Commits

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `.github/workflows/release.yml` | 创建 | CI/CD 流水线定义（test + build + publish） |
| `.github/ISSUE_TEMPLATE/bug_report.md` | 创建 | Bug 报告模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 创建 | 功能请求模板 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 创建 | PR 模板 |
| `CONTRIBUTING.md` | 创建 | 开发贡献指南 |
| `CHANGELOG.md` | 创建 | 版本变更记录（standard-version 管理） |
| `CODE_OF_CONDUCT.md` | 创建 | 行为准则 |
| `README.md` | 修改 | 增强安装说明、开发指南、技术栈 |
| `apps/desktop-electron/package.json` | 修改 | 新增 release scripts + test script |
| `.gitignore` | 修改 | 已在之前提交中更新过 `.superpowers/`，无需再改 |

---

### Task 1: 配置 standard-version

**Files:**
- Modify: `apps/desktop-electron/package.json`

- [ ] **Step 1: 安装 standard-version**

```bash
cd apps/desktop-electron
npm install --save-dev standard-version
```

- [ ] **Step 2: 添加 release scripts 和 test script 到 package.json**

修改 `apps/desktop-electron/package.json` 的 `scripts` 块，新增以下三个 script：

```json
"scripts": {
    "dev": "node ./scripts/dev.mjs",
    "dev:renderer": "vite --config ./renderer/vite.config.mjs",
    "start": "node ./scripts/start-static.mjs",
    "start:static": "node ./scripts/start-static.mjs",
    "build": "npm run build:renderer && npm run build:electron",
    "build:renderer": "vite build renderer",
    "build:electron": "node ./scripts/build.mjs",
    "build:go": "node ./scripts/build-go.mjs",
    "pack": "npm run build && electron-builder --dir",
    "dist": "npm run build && electron-builder",
    "test": "npx playwright test",
    "release": "standard-version",
    "release:minor": "standard-version --release-as minor",
    "release:major": "standard-version --release-as major",
    "postinstall": "electron-builder install-app-deps"
}
```

- [ ] **Step 3: 验证 standard-version 可用**

```bash
cd apps/desktop-electron
npx standard-version --dry-run --skip.changelog --skip.commit --skip.tag
```

预期：打印版本号 bump 信息，不产生任何文件变更。

- [ ] **Step 4: 提交**

```bash
cd apps/desktop-electron
git add package.json package-lock.json
git commit -m "chore: add standard-version for changelog and release management"
```

---

### Task 2: 创建 .github/workflows/release.yml

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 确保 .github 目录不被忽略**

`.gitignore` 当前有 `/.github/` 规则。`release.yml` 需要放在 `.github/workflows/` 下。检查是否有 `!/.github/` 的例外规则：

`.gitignore` 第 7 行：`!.github/` — 已经存在，无需修改。

- [ ] **Step 2: 创建 CI 流水线文件**

创建 `.github/workflows/release.yml`：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  test-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: Run Go tests
        run: go test ./...
        working-directory: apps/server

  test-js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
        working-directory: apps/desktop-electron
      - name: Run Playwright tests
        run: npx playwright test
        working-directory: apps/desktop-electron

  build:
    needs: [test-go, test-js]
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            goos: windows
            goarch: amd64
            electron-target: win
          - os: macos-latest
            goos: darwin
            goarch: amd64
            electron-target: mac
          - os: ubuntu-latest
            goos: linux
            goarch: amd64
            electron-target: linux
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: apps/desktop-electron

      - name: Build Go binary
        run: npm run build:go
        working-directory: apps/desktop-electron
        env:
          GOOS: ${{ matrix.goos }}
          GOARCH: ${{ matrix.goarch }}

      - name: Build renderer
        run: npm run build:renderer
        working-directory: apps/desktop-electron

      - name: Build Electron package
        run: npx electron-builder --publish=never --${{ matrix.electron-target }}
        working-directory: apps/desktop-electron
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.goos }}-${{ matrix.goarch }}
          path: |
            apps/desktop-electron/dist/*.exe
            apps/desktop-electron/dist/*.dmg
            apps/desktop-electron/dist/*.AppImage
            apps/desktop-electron/dist/*.deb
            apps/desktop-electron/dist/latest*.yml
            apps/desktop-electron/dist/*.blockmap

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: dist
          merge-multiple: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }}
          body: |
            ## ${{ github.ref_name }}

            See [CHANGELOG.md](./CHANGELOG.md) for details.
          files: dist/*
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release pipeline for windows/macos/linux"
```

---

### Task 3: 创建 Issue 模板

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`

- [ ] **Step 1: 创建 Bug 报告模板**

创建 `.github/ISSUE_TEMPLATE/bug_report.md`：

```markdown
---
name: Bug Report
about: Report a bug in OJReviewDesktop
title: '[Bug] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
A clear description of what you expected to happen.

**Environment (please complete the following information):**
- OS: [e.g. Windows 11, macOS 15, Ubuntu 24.04]
- App version: [e.g. 1.0.0]
- Go service version: [e.g. from /health endpoint]

**Additional context**
Add any other context about the problem here. Logs or screenshots are helpful.
```

- [ ] **Step 2: 创建功能请求模板**

创建 `.github/ISSUE_TEMPLATE/feature_request.md`：

```markdown
---
name: Feature Request
about: Suggest a feature or improvement
title: '[Feature] '
labels: enhancement
assignees: ''
---

**Is your feature request related to a problem? Please describe.**
A clear description of the problem. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.
```

- [ ] **Step 3: 提交**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "docs: add issue templates for bug reports and feature requests"
```

---

### Task 4: 创建 PR 模板

**Files:**
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: 创建 PR 模板**

创建 `.github/PULL_REQUEST_TEMPLATE.md`：

```markdown
## Description

Brief description of the changes.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring (no functional change)
- [ ] Build/CI change

## How Has This Been Tested?

- [ ] Go tests pass (`go test ./...`)
- [ ] Frontend tests pass (`npm test`)
- [ ] Manual testing (describe below)

## Checklist

- [ ] I have read the [CONTRIBUTING.md](./CONTRIBUTING.md)
- [ ] My code follows the project's code style
- [ ] I have added tests that prove my fix/feature works
- [ ] All new and existing tests pass
- [ ] I have updated documentation if needed
```

- [ ] **Step 2: 提交**

```bash
git add .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs: add pull request template"
```

---

### Task 5: 创建 CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: 创建贡献指南**

创建 `CONTRIBUTING.md`：

```markdown
# Contributing to OJReviewDesktop

## Development Setup

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/)

### Getting Started

```bash
git clone https://github.com/746445568/algorithm-review-system.git
cd algorithm-review-system

# Backend
cd apps/server
go test ./...

# Frontend
cd apps/desktop-electron
npm install
npm run dev
```

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

feat:    new feature
fix:     bug fix
docs:    documentation
chore:   build/tooling/dependencies
test:    testing
refactor: code refactoring (no behavior change)
```

Example:
```
feat: add review calendar view with streak tracking
fix: prevent sync task from running when queue is full
docs: add CONTRIBUTING.md
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes with tests
4. Ensure tests pass:
   - Backend: `cd apps/server && go test ./...`
   - Frontend: `cd apps/desktop-electron && npm test`
5. Commit using Conventional Commits format
6. Push and create a Pull Request

## Code Style

- **Go:** Follow standard Go conventions. Use `t.Fatalf` (not `t.Errorf`) in tests.
- **JavaScript/React:** Use ES modules. Components in PascalCase files. Follow existing patterns in the codebase.

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the full architecture overview.

```

- [ ] **Step 2: 提交**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md with development setup and commit conventions"
```

---

### Task 6: 创建 CODE_OF_CONDUCT.md

**Files:**
- Create: `CODE_OF_CONDUCT.md`

- [ ] **Step 1: 创建行为准则**

创建 `CODE_OF_CONDUCT.md`：

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, religion, or sexual identity
and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment:

- Demonstrating empathy and kindness toward other people
- Being respectful of differing opinions, viewpoints, and experiences
- Giving and gracefully accepting constructive feedback
- Accepting responsibility and apologizing to those affected by our mistakes
- Focusing on what is best for the overall community

Examples of unacceptable behavior:

- The use of sexualized language or imagery, and sexual attention or advances
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the project maintainers. All complaints will be reviewed and
investigated promptly and fairly.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage],
version 2.0, available at
https://www.contributor-covenant.org/version/2/0/code_of_conduct.html.

[homepage]: https://www.contributor-covenant.org
```

- [ ] **Step 2: 提交**

```bash
git add CODE_OF_CONDUCT.md
git commit -m "docs: add code of conduct"
```

---

### Task 7: 增强 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 重写 README.md**

用以下内容替换 `README.md`：

```markdown
# OJ Review Desktop

[![Release](https://github.com/746445568/algorithm-review-system/actions/workflows/release.yml/badge.svg)](https://github.com/746445568/algorithm-review-system/releases)

OJ Review Desktop is a local-first desktop app for algorithm competition review. It syncs online judge submissions (Codeforces / AtCoder), analyzes wrong attempts with an OpenAI-compatible LLM provider, stores data locally in SQLite, and schedules follow-up reviews using the SM-2 spaced repetition algorithm.

## Features

- 🔄 **Multi-platform sync** — Codeforces and AtCoder submission history
- 🤖 **AI-powered analysis** — Automatic error pattern detection, knowledge graph, and problem analysis
- 📅 **Spaced repetition** — Adaptive SM-2 algorithm with review calendar and streak tracking
- 📊 **Statistics & visualization** — Verdict distribution, ability radar, rating curve, knowledge graph
- 💬 **Chat with AI** — Socratic tutoring mode and direct Q&A for each problem
- 🌐 **Cross-platform** — Windows, macOS, Linux

## Installation

Download the latest release from the [Releases page](https://github.com/746445568/algorithm-review-system/releases).

| Platform | Package |
|----------|---------|
| Windows  | `OJReviewDesktop-x.x.x-win-x64.exe` (NSIS installer) |
| macOS    | `OJReviewDesktop-x.x.x-mac-x64.dmg` |
| Linux    | `OJReviewDesktop-x.x.x-linux-x64.AppImage` |

## Quick Start

1. Install and launch the app
2. Add your Codeforces or AtCoder account in Settings
3. Configure an AI provider (OpenAI / DeepSeek / Ollama) in Settings
4. Sync your submissions — the app will fetch your history
5. Review problems and get AI-powered analysis

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed setup instructions.

### Prerequisites

- Go 1.22+
- Node.js 20+

### Quick Start

```bash
# Backend
cd apps/server
go run ./cmd/ojreviewd

# Frontend (in another terminal)
cd apps/desktop-electron
npm install
npm run dev
```

### Run Tests

```bash
# Backend tests
cd apps/server && go test ./...

# Frontend tests
cd apps/desktop-electron && npm test
```

## Architecture

```
[browser extension]  --HTTP POST--> [Go Server :38473] <--HTTP REST-- [Electron renderer]
                                        |
                                  [SQLite + AES Vault]
```

- **Go server** (`apps/server`) — REST API, SQLite storage, AI integration, sync engine
- **Electron app** (`apps/desktop-electron`) — React 19 + Vite renderer, offline-first with IndexedDB cache
- **Browser extension** (`apps/browser-extension`) — Import problem statements and submission sources

See [CLAUDE.md](./CLAUDE.md) for the full architecture overview.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.22+, standard `net/http`, SQLite (pure-Go via `modernc.org/sqlite`) |
| Frontend | React 19, Vite 7, SWR, react-i18next |
| Desktop | Electron 37, electron-builder, electron-updater |
| AI | OpenAI-compatible API (OpenAI / DeepSeek / Ollama) |
| Testing | Go stdlib `testing`, Playwright |

## License

ISC
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: enhance README with features, install guide, tech stack"
```

---

### Task 8: 创建 CHANGELOG.md 骨架

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: 创建初始 CHANGELOG.md**

创建 `CHANGELOG.md`（standard-version 会在首次 `npm run release` 时自动填充内容）：

```markdown
# Changelog

All notable changes to this project will be documented in this file.
See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.
```

- [ ] **Step 2: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG.md skeleton"
```

---

## 验证清单

实施完成后，验证以下内容：

1. `npm run release --dry-run` 不报错
2. GitHub Actions release.yml 语法正确（可用 `act` 或在 GitHub UI 中检查）
3. `CONTRIBUTING.md` 包含完整的开发环境搭建说明
4. Issue 模板在新 Issue 页面可选
5. README.md 包含功能列表、安装说明、开发指南
6. `.github` 目录下的文件被 git 跟踪（`git ls-files .github/` 应列出所有模板和 workflow）
