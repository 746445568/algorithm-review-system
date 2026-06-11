# Phase 6 发布准备 — 设计规格

**日期：** 2026-06-11
**状态：** 已确认
**范围：** CI/CD 自动发布流水线 + 开源文档完善

---

## 1. 目标

完善 OJReviewDesktop 的发布流程和开源准备，使其能够：
- 通过 git tag 自动触发三平台（Windows/macOS/Linux）构建和 GitHub Release 发布
- 支持 electron-updater 自动更新
- 具备完整的开源项目文档和社区协作基础设施

---

## 2. 当前状态

| 子任务 | 状态 | 说明 |
|--------|------|------|
| 6.1 跨平台打包 | ✅ 完成 | `build-go.mjs` 支持 GOOS/GOARCH 交叉编译 |
| 6.2 自动更新 | ⚠️ 部分 | SettingsPage 已有 electron-updater UI，缺少 CI/CD 发布流水线 |
| 6.3 开源文档 | ❌ 未开始 | 无 CONTRIBUTING.md / CHANGELOG.md / Issue 模板 / CI 配置 |

---

## 3. 架构设计

### 3.1 发布流程

```
开发者 → npm run release（bump 版本 + CHANGELOG + tag）
   → git push --follow-tags
     → GitHub Actions 触发（on tags: v*）
       ├── test-go（Go 单元测试）
       ├── test-js（前端测试）
       ├── build-release（matrix: windows/macos/ubuntu）
       │   ├── Go 交叉编译
       │   ├── npm run build:renderer
       │   └── electron-builder（平台特定包）
       └── publish
           ├── 下载所有 artifacts
           ├── 创建 GitHub Release
           ├── 上传 NSIS .exe / DMG / AppImage
           └── 上传 latest.yml（electron-updater 更新源）
```

### 3.2 触发条件

- **触发：** 推送 `v*` 格式的 tag（如 `v1.0.0`、`v1.1.0`）
- **不触发：** 普通 push 到 main 分支（避免频繁构建）

### 3.3 版本管理

使用 `standard-version` 自动管理版本号：

```bash
# 新增 npm scripts
npm run release          # 自动 bump patch + CHANGELOG + git tag
npm run release:minor    # bump minor
npm run release:major    # bump major
```

工作流：
1. 开发者本地运行 `npm run release`
2. 自动执行：`git tag vX.Y.Z` + 更新 `package.json` version + 生成 `CHANGELOG.md`
3. `git push --follow-tags` 推送代码和 tag
4. GitHub Actions 检测到 tag 后自动构建发布

### 3.4 文件清单

| 文件 | 用途 |
|------|------|
| `.github/workflows/release.yml` | CI/CD 流水线定义 |
| `CONTRIBUTING.md` | 贡献指南（环境搭建、commit 规范、PR 流程） |
| `CHANGELOG.md` | 版本变更记录（standard-version 自动生成） |
| `CODE_OF_CONDUCT.md` | 行为准则（Contributor Covenant 模板） |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug 报告模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 功能请求模板 |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 模板 |
| `README.md` 增强 | 英文简介、安装说明、开发指南链接、技术栈 |
| `.gitignore` 更新 | 添加 `.superpowers/` |

---

## 4. GitHub Actions 流水线详情

### 4.1 test-go

```yaml
test-go:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: '1.22'
    - run: go test ./...
      working-directory: apps/server
```

### 4.2 test-js

```yaml
test-js:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
      working-directory: apps/desktop-electron
    - run: npm test
      working-directory: apps/desktop-electron
```

### 4.3 build-release

```yaml
build-release:
  needs: [test-go, test-js]
  strategy:
    matrix:
      include:
        - os: windows-latest
          goos: windows
          goarch: amd64
        - os: macos-latest
          goos: darwin
          goarch: amd64
        - os: ubuntu-latest
          goos: linux
          goarch: amd64
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: '1.22'
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
      working-directory: apps/desktop-electron
    - run: npm run build:go
      working-directory: apps/desktop-electron
      env:
        GOOS: ${{ matrix.goos }}
        GOARCH: ${{ matrix.goarch }}
    - run: npm run build:renderer
      working-directory: apps/desktop-electron
    - run: npx electron-builder --publish=never
      working-directory: apps/desktop-electron
      env:
        CSC_IDENTITY_AUTO_DISCOVERY: false
    - uses: actions/upload-artifact@v4
      with:
        name: release-${{ matrix.goos }}
        path: apps/desktop-electron/dist/*.{exe,dmg,AppImage}
```

### 4.4 publish

```yaml
publish:
  needs: build-release
  runs-on: ubuntu-latest
  steps:
    - uses: actions/download-artifact@v4
    - run: gh release create ${{ github.ref_name }} --title "${{ github.ref_name }}" --generate-notes
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    # 上传各平台包到 Release
```

---

## 5. Commit 规范

从下个 commit 开始使用 Conventional Commits：

```
feat:     新功能
fix:      Bug 修复
docs:     文档变更
chore:    构建/工具/依赖
test:     测试
refactor: 重构（无功能变更）
```

**格式：** `<type>: <简短描述>`

**示例：**
```
feat: add release CI pipeline for windows/macos/linux
docs: add CONTRIBUTING.md and issue templates
chore: configure standard-version for changelog generation
```

当前已有 commit 历史不做修改。

---

## 6. 不包含的内容

- **代码签名证书：** macOS 的 Apple Developer ID 签名和 Windows 的代码签名证书需要额外购买，不在本次范围
- **自动更新服务器：** 使用 GitHub Releases 作为更新源（electron-updater 默认支持），不搭建独立更新服务器
- **npm publish：** 本项目是 Electron 桌面应用，不发 npm 包

---

## 7. 验证标准

1. 推送 `v*` tag 后，GitHub Actions 自动触发三平台构建
2. 构建产物（.exe / .dmg / .AppImage）出现在 GitHub Release 页面
3. `CHANGELOG.md` 正确记录版本变更
4. CONTRIBUTING.md 包含完整的开发环境搭建说明
5. Issue 模板在 GitHub Issues 页面可选择
