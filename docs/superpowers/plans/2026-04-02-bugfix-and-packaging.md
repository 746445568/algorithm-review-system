# Bug 修复 + 打包发布 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 6 个已确认 bug（3 个主进程高危 + 1 个渲染层 + 2 个 Go 服务），然后完成 Windows 桌面端完整打包发布（NSIS 安装包 + 首次启动引导 + 自动更新 + 数据备份迁移）。

**Architecture:** 阶段 0 只改现有文件，不新增文件；阶段 1 新增 `OnboardingPage.jsx` 和 `updater.mjs`，Go 服务 `/health` 响应增加 `firstRun` 字段作为引导触发的单一来源，`electron-updater` 替代原生 `autoUpdater` 与 NSIS 配合。

**Tech Stack:** Electron 37（ESM .mjs）、React 19（JSX，无 TypeScript）、Go 1.26、electron-builder 25、electron-updater、node:test（桌面端测试）、go test（Go 测试）

---

## 文件变更总览

### 阶段 0 — Bug 修复
| 文件 | 操作 | 涉及 Bug |
|---|---|---|
| `apps/desktop-electron/main/index.mjs` | 修改 | Bug 1, 2, 3 |
| `apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx` | 修改 | Bug 4 |
| `apps/server/internal/jobs/queue.go` | 修改 | Bug 6 |
| `apps/server/internal/storage/sqlite.go` | 修改 | Bug 5 |
| `apps/server/internal/storage/sqlite_analysis_test.go` | 修改 | Bug 5 测试 |

### 阶段 1 — 打包发布
| 文件 | 操作 | 功能 |
|---|---|---|
| `apps/desktop-electron/package.json` | 修改 | 添加 electron-updater 依赖 + publish 配置 |
| `apps/desktop-electron/main/updater.mjs` | 新建 | 自动更新逻辑（封装 electron-updater） |
| `apps/desktop-electron/main/index.mjs` | 修改 | 引入 updater，暴露更新 IPC |
| `apps/desktop-electron/preload/index.mjs` | 修改 | contextBridge 暴露更新 API |
| `apps/desktop-electron/renderer/src/pages/OnboardingPage.jsx` | 新建 | 首次启动引导页（4 步） |
| `apps/desktop-electron/renderer/src/App.jsx` | 修改 | firstRun 检测，插入引导流程 |
| `apps/server/internal/api/server.go` | 修改 | `/health` 增加 `firstRun` 字段 |
| `apps/desktop-electron/renderer/src/pages/SettingsPage.jsx` | 修改 | 数据备份/恢复按钮 |
| `apps/server/internal/api/server.go` | 修改 | 备份/恢复 API 端点 |

---

## Chunk 1: 阶段 0 — Electron 主进程 Bug 修复（Bug 1/2/3）

**文件：** `apps/desktop-electron/main/index.mjs`

### Task 1: Bug 1 — `ensureStarted()` 并发锁

**Files:**
- Modify: `apps/desktop-electron/main/index.mjs:50-61, 81-210`

- [ ] **Step 1: 在 constructor 中添加 `startPromise` 字段**

  在 `ServiceManager` 的 constructor（约第 51 行）中添加 `this.startPromise = null;`：

  ```js
  constructor() {
    this.child = null;
    this.startPromise = null;  // 并发锁：in-flight 时非 null
    this.status = { ... };
  }
  ```

- [ ] **Step 2: 重构 `ensureStarted()` 使用锁**

  将 `ensureStarted()` 改为：若 `startPromise` 已存在则直接返回，否则新建并赋值；失败分支清空。替换整个方法：

  ```js
  async ensureStarted() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._startImpl();
    return this.startPromise;
  }

  async _startImpl() {
    const runtimeDir = this.getRuntimeDir();
    // ...将原 ensureStarted() 全部内容移到这里...
    // 每个 state: "error" 的 return this.getStatus() 前插入：
    //   this.startPromise = null;
    //
    // 注意：成功路径（state: "healthy"）**不**清空 startPromise，
    // 这是有意为之：后续调用直接返回已完成的 Promise，避免重复启动。
    // restart() 在调用 ensureStarted() 前会主动清空 startPromise。
  }
  ```

  具体地，在 `_startImpl` 中所有 `state: "error"` 的 return 前插入 `this.startPromise = null;`：
  - 第一处：`existingHealth` 版本不兼容（约原第 92-99 行）
  - 第二处：`!launch`（约原第 112-119 行）
  - 第三处：`preflightError`（约原第 122-130 行）
  - 第四处：spawn 抛出异常的 catch（约原第 143-150 行）
  - 第五处：health 超时后（约原第 175-183 行）
  - 第六处：运行中版本不兼容（约原第 186-195 行）

- [ ] **Step 3: 在 `restart()` 中清空锁**

  `restart()` 调用 `stop()` 再 `ensureStarted()`，需在 stop 前清空 startPromise，否则重试会拿到旧的失败 Promise：

  ```js
  async restart() {
    this.startPromise = null;
    await this.stop();
    return this.ensureStarted();
  }
  ```

- [ ] **Step 4: 手动验证**

  启动 `npm run dev`，在 DevTools Console 中并发调用多次 `window.desktopBridge.getServiceStatus()`，确认只有一个 ojreviewd 进程（任务管理器中只出现一个 `ojreviewd.exe`）。

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop-electron/main/index.mjs
  git commit -m "fix: ensureStarted 添加并发锁，防止多进程启动"
  ```

---

### Task 2: Bug 2 — spawn `error` 事件监听

**Files:**
- Modify: `apps/desktop-electron/main/index.mjs:133-172`

- [ ] **Step 1: 在 spawn 后注册 `error` 监听器**

  在 `this.child.stdout?.on(...)` 之前（约原第 156 行附近），添加 error 监听器：

  ```js
  this.child.once("error", (err) => {
    this.child = null;
    this.startPromise = null;
    this.updateStatus({
      state: "error",
      runtimeDir,
      source: launch.source,
      message: `failed to launch local service: ${String(err)}`,
    });
  });
  ```

- [ ] **Step 2: 手动验证**

  将 `launch.command` 临时改为不存在的路径（如 `/nonexistent`），确认应用状态栏显示错误而不是崩溃。改回后重新验证正常启动。

- [ ] **Step 3: Commit**

  ```bash
  git add apps/desktop-electron/main/index.mjs
  git commit -m "fix: spawn 后注册 error 监听器，防止 ENOENT 变成未处理异常"
  ```

---

### Task 3: Bug 3 — `before-quit` 不 await stop

**Files:**
- Modify: `apps/desktop-electron/main/index.mjs:478-480`

- [ ] **Step 1: 修复 `before-quit` 处理器**

  将：
  ```js
  app.on("before-quit", () => {
    void serviceManager.stop();
  });
  ```

  替换为：
  ```js
  let isQuitting = false;
  app.on("before-quit", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    serviceManager.stop().finally(() => app.quit());
  });
  ```

  `isQuitting` 守护防止 `app.quit()` 触发第二次 `before-quit` 导致递归。

- [ ] **Step 2: 手动验证**

  启动应用，确认 Go 服务运行中，然后关闭窗口/从托盘退出。用任务管理器确认关闭后无残留 `ojreviewd.exe` 进程。

- [ ] **Step 3: Commit**

  ```bash
  git add apps/desktop-electron/main/index.mjs
  git commit -m "fix: before-quit 改为 await stop，防止僵尸进程"
  ```

---

## Chunk 2: 阶段 0 — 渲染层 + Go 服务 Bug 修复（Bug 4/5/6）

### Task 4: Bug 4 — `problemSubmitRef` 轮询终态未重置

**Files:**
- Modify: `apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx:299-316`

- [ ] **Step 1: 定位 `scheduleProblemPoll` 的终态分支**

  在 `AnalysisPage.jsx` 约第 307-309 行，SUCCESS/FAILED 分支目前只有：
  ```js
  } else {
    setProblemLoading(false);
  }
  ```

- [ ] **Step 2: 添加 ref 重置**

  改为：
  ```js
  } else {
    setProblemLoading(false);
    problemSubmitRef.current = false;
  }
  ```

- [ ] **Step 3: 写测试验证**

  在 `apps/desktop-electron/test/review-detail-analysis.test.mjs` 中追加（用 node:test）：

  ```js
  test("scheduleProblemPoll resets problemSubmitRef on SUCCESS", async () => {
    // 用 mock 的 api.getAnalysisTask 返回 { status: "SUCCESS" }
    // 调用 scheduleProblemPoll
    // 断言 problemSubmitRef.current === false
  });
  ```

  > 注：AnalysisPage 是 React 组件，这个行为更适合手动验证。用端到端测试步骤替代：启动服务，触发一次分析，等待完成，再次点击"生成分析"按钮，确认能触发新一次请求（不是静默无响应）。

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx
  git commit -m "fix: 分析轮询终态重置 problemSubmitRef，修复重复点击无响应"
  ```

---

### Task 5: Bug 5 — `findReusableAnalysisTask` 无 status 过滤

**Files:**
- Modify: `apps/server/internal/storage/sqlite.go:1252-1259`
- Modify: `apps/server/internal/storage/sqlite_analysis_test.go`

- [ ] **Step 1: 写失败测试**

  在 `sqlite_analysis_test.go` 末尾添加（`openTestDB` 和 `CreateAnalysisTaskWithTypedSnapshot` 均已存在）：

  ```go
  func TestFindReusableAnalysisTask_SkipsFailedTask(t *testing.T) {
      db := openTestDB(t)

      // 创建 PENDING 任务
      task, _, err := db.CreateAnalysisTaskWithTypedSnapshot(
          "openai", "gpt-4o", `{"summary":"test"}`, "problem", nil,
      )
      if err != nil {
          t.Fatalf("create task: %v", err)
      }

      // 将任务标记为 FAILED
      err = db.MarkAnalysisTaskFinished(task.ID, models.TaskFailed, "", "", "intentional failure")
      if err != nil {
          t.Fatalf("mark failed: %v", err)
      }

      // findReusableAnalysisTask 不应返回 FAILED 任务（期望 sql.ErrNoRows）
      _, err = db.findReusableAnalysisTask(task.InputSnapshotID, "openai", "gpt-4o")
      if err == nil {
          t.Error("expected no reusable task for FAILED status, but got one")
      }
  }
  ```

- [ ] **Step 2: 运行测试，确认失败**

  ```bash
  cd apps/server
  go test ./internal/storage/... -run TestFindReusableAnalysisTask_SkipsFailedTask -v
  ```
  预期：FAIL（当前 SQL 会返回 FAILED 任务）

- [ ] **Step 3: 修改 SQL，加状态白名单**

  在 `sqlite.go` 第 1256 行的 WHERE 子句末尾加条件：

  ```go
  WHERE input_snapshot_id = ? AND provider = ? AND model = ?
    AND status IN ('PENDING', 'RUNNING', 'SUCCESS')
    AND created_at >= datetime('now', '-10 minutes')
  ```

- [ ] **Step 4: 运行测试，确认通过**

  ```bash
  cd apps/server
  go test ./internal/storage/... -run TestFindReusableAnalysisTask -v
  ```
  预期：PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/server/internal/storage/sqlite.go apps/server/internal/storage/sqlite_analysis_test.go
  git commit -m "fix: findReusableAnalysisTask 加状态白名单，FAILED 任务不再阻止重试"
  ```

---

### Task 6: Bug 6 — `Enqueue()` goroutine 泄漏 + inflight 污染

**Files:**
- Modify: `apps/server/internal/jobs/queue.go:22-96`

- [ ] **Step 1: 在 Queue struct 添加 ctx 字段，并在 `NewQueue` 中初始化**

  在 `Queue` struct（第 22 行）加 `ctx context.Context`：

  ```go
  type Queue struct {
      ctx              context.Context  // 添加这一行；由 Start() 在锁内覆写
      db               *storage.DB
      // ...其余字段不变...
  }
  ```

  在 `NewQueue`（第 35 行）的 return 语句中初始化为 `context.Background()`（防止 `ResumePending` 在 `Start()` 前调用时 nil panic）：

  ```go
  func NewQueue(db *storage.DB) *Queue {
      return &Queue{
          ctx:              context.Background(), // ← 添加：安全默认值
          db:               db,
          workerCh:         make(chan Job, 32),
          analysisParallel: 2,
          inflight:         make(map[string]struct{}),
          adapters:         make(map[models.Platform]judges.Adapter),
      }
  }
  ```

- [ ] **Step 2: 在 `Start()` 中保存 ctx（锁内写入，防止数据竞争）**

  在 `Start` 方法中，在 `q.once.Do` **前**，用 `q.mu` 锁写入 ctx：

  ```go
  func (q *Queue) Start(ctx context.Context) {
      q.mu.Lock()
      q.ctx = ctx
      q.mu.Unlock()
      q.once.Do(func() {
          // ...不变...
      })
  }
  ```

- [ ] **Step 3: 修改 `Enqueue()` goroutine，在锁内捕获 ctx + 加 ctx 感知 + inflight 清理**

  `q.ctx` 必须在持有锁时读取（避免数据竞争）。将 `Enqueue` 中 `q.mu.Unlock()` 前捕获 ctx，再在 goroutine 里使用：

  ```go
  func (q *Queue) Enqueue(job Job) bool {
      q.mu.Lock()
      if _, exists := q.inflight[job.Key]; exists {
          q.mu.Unlock()
          return false
      }
      q.inflight[job.Key] = struct{}{}
      ctx := q.ctx  // ← 在持有锁时捕获，防止与 Start() 的写入竞争
      q.mu.Unlock()

      go func() {
          timer := time.NewTimer(20 * time.Millisecond)
          defer timer.Stop()
          select {
          case <-timer.C:
              q.workerCh <- job
          case <-ctx.Done():
              q.mu.Lock()
              delete(q.inflight, job.Key)
              q.mu.Unlock()
          }
      }()
      return true
  }
  ```

- [ ] **Step 4: 写测试（不启动 workers，隔离 ctx-cancel 路径）**

  在 `apps/server/internal/jobs/` 新建 `queue_test.go`。
  **关键：不调用 `q.Start(ctx)`**，这样 `workerCh` 无消费者，goroutine 必须走 `ctx.Done()` 分支：

  ```go
  package jobs

  import (
      "context"
      "testing"
      "time"
  )

  func TestEnqueue_CancelCleansInflight(t *testing.T) {
      q := NewQueue(nil)
      ctx, cancel := context.WithCancel(context.Background())

      // 直接写入 q.ctx（同包可访问），不启动 workers
      q.mu.Lock()
      q.ctx = ctx
      q.mu.Unlock()

      job := Job{Key: "test-key", Run: func(context.Context) error { return nil }}
      ok := q.Enqueue(job)
      if !ok {
          t.Fatal("first enqueue should succeed")
      }

      // 此时 key 应在 inflight 中
      q.mu.Lock()
      _, exists := q.inflight[job.Key]
      q.mu.Unlock()
      if !exists {
          t.Fatal("key should be inflight after enqueue")
      }

      // 取消 ctx → goroutine 走 ctx.Done() 分支 → 清理 inflight
      cancel()
      time.Sleep(100 * time.Millisecond)

      q.mu.Lock()
      _, exists = q.inflight[job.Key]
      q.mu.Unlock()
      if exists {
          t.Error("inflight key should be cleared after ctx cancel")
      }
  }
  ```

- [ ] **Step 5: 运行测试**

  ```bash
  cd apps/server
  go test ./internal/jobs/... -v
  ```
  预期：PASS

- [ ] **Step 6: Commit**

  ```bash
  git add apps/server/internal/jobs/queue.go apps/server/internal/jobs/queue_test.go
  git commit -m "fix: Enqueue goroutine 加 ctx 取消感知，防止泄漏和 inflight 表污染"
  ```

---

## Chunk 3: 阶段 1 — NSIS 安装包完善 + 自动更新

### Task 7: 完善 NSIS 安装包配置

**Files:**
- Modify: `apps/desktop-electron/package.json`

- [ ] **Step 1: 检查 build/icon.ico 是否存在**

  ```bash
  ls apps/desktop-electron/build/
  ```
  如果没有 `icon.ico`，需要创建（至少 256×256 px，可用任意图片转换）。

- [ ] **Step 2: 在 package.json 的 `build` 节添加 `publish` 配置**

  在 `"nsis"` 同级添加：

  ```json
  "publish": {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",
    "repo": "algorithm-review-system"
  }
  ```

  > 替换 `owner` 为实际 GitHub 用户名。

- [ ] **Step 3: 添加 `electron-updater` 依赖（必须进 `dependencies`，不能是 `devDependencies`）**

  ```bash
  cd apps/desktop-electron
  npm install electron-updater
  ```

  **重要**：`electron-updater` 是运行时模块，必须在 `package.json` 的 `"dependencies"` 中，不能用 `--save-dev`。否则打包后找不到模块。确认 `package.json` 中：
  ```json
  "dependencies": {
    "electron-updater": "^x.x.x",
    ...
  }
  ```

- [ ] **Step 4: 试运行打包（不发布）**

  ```bash
  cd apps/desktop-electron
  npm run pack
  ```
  预期：`dist/win-unpacked/` 目录出现，无错误。

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop-electron/package.json apps/desktop-electron/package-lock.json
  git commit -m "feat: 添加 electron-updater 依赖和 GitHub publish 配置"
  ```

---

### Task 8: 实现自动更新模块

**Files:**
- Create: `apps/desktop-electron/main/updater.mjs`
- Modify: `apps/desktop-electron/main/index.mjs`
- Modify: `apps/desktop-electron/preload/index.mjs`

- [ ] **Step 1: 创建 `updater.mjs`**

  项目为 `"type": "module"` + `.mjs` 文件，**不能用 `createRequire`** 加载 `electron-updater`（在 ASAR 打包后路径解析会失败）。使用静态 `import`，用 `app.isPackaged` 在开发模式下跳过：

  ```js
  // apps/desktop-electron/main/updater.mjs
  import { autoUpdater } from "electron-updater";

  export function initAutoUpdater(ipcMain, app, getWindow) {
    // 开发模式跳过（避免找不到 latest.yml 报错）
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = false; // 用户手动触发下载
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-available", (info) => {
      const win = getWindow();
      win?.webContents.send("updater:update-available", {
        version: info.version,
        releaseNotes: info.releaseNotes ?? "",
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const win = getWindow();
      win?.webContents.send("updater:download-progress", {
        percent: Math.round(progress.percent),
      });
    });

    autoUpdater.on("update-downloaded", () => {
      const win = getWindow();
      win?.webContents.send("updater:update-downloaded");
    });

    autoUpdater.on("error", (err) => {
      console.error("[updater] error:", err);
    });

    // IPC handlers
    ipcMain.handle("updater:check", () => autoUpdater.checkForUpdates());
    ipcMain.handle("updater:download", () => autoUpdater.downloadUpdate());
    ipcMain.handle("updater:install", () => autoUpdater.quitAndInstall());

    // 启动后 5 秒自动检查一次
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  }
  ```

- [ ] **Step 2: 在 `index.mjs` 引入 updater**

  在 `ipcMain.handle(...)` 区块之后，`app.whenReady().then(...)` 之前添加：

  ```js
  import { initAutoUpdater } from "./updater.mjs";
  ```

  在 `app.whenReady().then(() => {` 内、`createWindow()` 之后添加：

  ```js
  let mainWindow = createWindow();
  initAutoUpdater(ipcMain, app, () => mainWindow);
  ```

  （同时将原来的 `const window = createWindow()` 替换为 `let mainWindow = createWindow()`，`window` 后续引用改为 `mainWindow`。）

- [ ] **Step 3: 在 `preload/index.mjs` 暴露更新 API**

  在 `preload/index.mjs` 的 `contextBridge.exposeInMainWorld("desktopBridge", { ... })` 对象中追加（与现有 `onServiceStatus` 保持一致，监听器函数必须返回 cleanup 函数）：

  ```js
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    onUpdateAvailable: (cb) => {
      const listener = (_e, info) => cb(info);
      ipcRenderer.on("updater:update-available", listener);
      return () => ipcRenderer.removeListener("updater:update-available", listener);
    },
    onDownloadProgress: (cb) => {
      const listener = (_e, p) => cb(p);
      ipcRenderer.on("updater:download-progress", listener);
      return () => ipcRenderer.removeListener("updater:download-progress", listener);
    },
    onUpdateDownloaded: (cb) => {
      const listener = () => cb();
      ipcRenderer.on("updater:update-downloaded", listener);
      return () => ipcRenderer.removeListener("updater:update-downloaded", listener);
    },
  },
  ```

- [ ] **Step 4: 在 SettingsPage 添加更新提示区域**

  在 `SettingsPage.jsx` 中添加"检查更新"按钮，点击调用 `window.desktopBridge?.updater?.check()`，并监听 `onUpdateAvailable` 显示版本号和下载按钮。（具体 UI 参照现有 SettingsPage 的卡片风格。）

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop-electron/main/updater.mjs apps/desktop-electron/main/index.mjs apps/desktop-electron/preload/index.mjs apps/desktop-electron/renderer/src/pages/SettingsPage.jsx
  git commit -m "feat: 集成 electron-updater，实现应用内静默检查和手动更新"
  ```

---

## Chunk 4: 阶段 1 — 首次启动引导

### Task 9: Go 服务 `/health` 增加 `firstRun` 字段

**Files:**
- Modify: `apps/server/internal/api/server.go:96-103`

- [ ] **Step 1: 写测试**

  在 `apps/server/internal/api/` 新建 `health_test.go`（或追加到现有测试文件）：

  ```go
  func TestHealth_FirstRunTrue_WhenNoAIKey(t *testing.T) {
      // 初始化无 AI Key 配置的 Server
      // GET /health
      // 断言响应 JSON 中 firstRun == true
  }

  func TestHealth_FirstRunFalse_WhenAIKeySet(t *testing.T) {
      // 初始化已配置 AI Key 的 Server
      // GET /health
      // 断言 firstRun == false
  }
  ```

- [ ] **Step 2: 运行测试，确认失败**

  ```bash
  cd apps/server
  go test ./internal/api/... -run TestHealth_FirstRun -v
  ```

- [ ] **Step 3: 修改 `handleHealth`**

  `handleHealth` 需要查询 AI Key 是否已配置。在 `server.go` 中：

  ```go
  func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
      aiSettings, _ := s.db.LoadAISettings()  // 注意：方法名为 LoadAISettings，不是 GetAISettings
      firstRun := aiSettings.APIKey == ""
      writeJSON(w, http.StatusOK, map[string]any{
          "status":    "ok",
          "timestamp": time.Now().UTC().Format(time.RFC3339),
          "version":   buildinfo.Version,
          "commit":    buildinfo.Commit,
          "firstRun":  firstRun,
      })
  }
  ```

  > `GetAISettings` 返回 error 时 firstRun 默认 true（保守策略，宁可多显示引导）。

- [ ] **Step 4: 运行测试，确认通过**

  ```bash
  cd apps/server
  go test ./internal/api/... -run TestHealth_FirstRun -v
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/server/internal/api/server.go apps/server/internal/api/health_test.go
  git commit -m "feat: /health 响应增加 firstRun 字段，用于触发首次启动引导"
  ```

---

### Task 10: 前端 首次启动引导页

**Files:**
- Create: `apps/desktop-electron/renderer/src/pages/OnboardingPage.jsx`
- Modify: `apps/desktop-electron/renderer/src/App.jsx`

- [ ] **Step 1: 创建 `OnboardingPage.jsx`**

  四步引导，每步有"下一步"按钮，最后一步完成时调用 `api.saveAISettings(...)` 写入配置，然后通知父组件完成：

  ```jsx
  // apps/desktop-electron/renderer/src/pages/OnboardingPage.jsx
  import { useState } from "react";
  import { api } from "../lib/api.js";

  const STEPS = ["欢迎", "AI 配置", "数据目录", "完成"];

  export function OnboardingPage({ onComplete }) {
    const [step, setStep] = useState(0);
    const [apiKey, setApiKey] = useState("");
    const [apiBase, setApiBase] = useState("https://api.openai.com/v1");
    const [model, setModel] = useState("gpt-4o-mini");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    async function handleFinish() {
      setSaving(true);
      setError(null);
      try {
        await api.saveAISettings({ apiKey, apiBase, model });  // 注意：方法名为 saveAISettings
        onComplete();
      } catch (e) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    }

    return (
      <div className="onboarding-page">
        {/* 步骤指示器 */}
        <div className="onboarding-steps">
          {STEPS.map((s, i) => (
            <span key={s} className={`onboarding-step${i === step ? " active" : i < step ? " done" : ""}`}>{s}</span>
          ))}
        </div>

        {step === 0 && (
          <div className="onboarding-content">
            <h2>欢迎使用 OJ Review</h2>
            <p>算法竞赛错题复盘工具，支持从 Codeforces 同步提交记录，AI 分析错误原因，间隔重复安排复习。</p>
            <button className="btn-primary" onClick={() => setStep(1)}>开始配置</button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-content">
            <h2>配置 AI 分析</h2>
            <label>API Key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." /></label>
            <label>API Base URL<input value={apiBase} onChange={e => setApiBase(e.target.value)} /></label>
            <label>模型<input value={model} onChange={e => setModel(e.target.value)} /></label>
            <div className="onboarding-actions">
              <button onClick={() => setStep(0)}>上一步</button>
              <button className="btn-primary" onClick={() => setStep(2)} disabled={!apiKey}>下一步</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-content">
            <h2>数据目录</h2>
            <p>数据将存储在系统应用数据目录（<code>%AppData%/OJReviewDesktop</code>），无需额外配置。如需自定义，可在设置页修改后重启。</p>
            <div className="onboarding-actions">
              <button onClick={() => setStep(1)}>上一步</button>
              <button className="btn-primary" onClick={() => setStep(3)}>确认</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-content">
            <h2>配置完成</h2>
            <p>已准备就绪，开始使用吧。</p>
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" onClick={handleFinish} disabled={saving}>
              {saving ? "保存中..." : "进入应用"}
            </button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: 在 `App.jsx` 中读取 `firstRun` 并插入引导流程**

  在 `App.jsx` 中，找到服务健康状态的 state（`serviceStatus`），在服务变为 `healthy` 后检查 `firstRun`：

  ```jsx
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 在服务 healthy 后
  useEffect(() => {
    if (serviceStatus?.state === "healthy") {
      api.getHealth().then(payload => {
        if (payload?.firstRun) setShowOnboarding(true);
      }).catch(() => {});
    }
  }, [serviceStatus?.state]);

  // 在渲染主内容前：
  if (showOnboarding) {
    return <OnboardingPage onComplete={() => setShowOnboarding(false)} />;
  }
  ```

  同时在顶部 import：`import { OnboardingPage } from "./pages/OnboardingPage.jsx";`

  `api.getHealth()` 需要在 `lib/api.js` 中添加（调用 `GET /health`）。

- [ ] **Step 3: 在 `lib/api.js` 添加 `getHealth` 方法**

  文件中所有 API 调用均使用内部 `request()` 函数（不存在 `get()` helper）：

  ```js
  getHealth: () => request("/health"),
  ```

- [ ] **Step 4: 添加 OnboardingPage CSS**

  在 `styles.css` 末尾追加基础样式（`.onboarding-page`, `.onboarding-steps`, `.onboarding-step.active`, `.onboarding-content`），参照现有卡片风格。

- [ ] **Step 5: 手动验证**

  清空 AI 设置（直接删除数据库或将 API Key 清空），重启应用，确认出现引导页；完成引导后确认 AI Key 已保存并跳转到 Dashboard。

- [ ] **Step 6: Commit**

  ```bash
  git add apps/desktop-electron/renderer/src/pages/OnboardingPage.jsx apps/desktop-electron/renderer/src/App.jsx apps/desktop-electron/renderer/src/lib/api.js apps/desktop-electron/renderer/src/styles.css
  git commit -m "feat: 添加首次启动引导页（4步），由 /health firstRun 字段触发"
  ```

---

## Chunk 5: 阶段 1 — 数据备份与迁移

### Task 11: Go 服务自动备份 + 手动备份 API

**Files:**
- Modify: `apps/server/internal/api/server.go`
- Modify: `apps/desktop-electron/renderer/src/pages/SettingsPage.jsx`

- [ ] **Step 1: 在 Go 服务中添加备份端点**

  在 `server.go` 的 `routes()` 中添加：

  ```go
  s.mux.HandleFunc("POST /api/settings/data/backup", s.handleBackup)
  s.mux.HandleFunc("POST /api/settings/data/restore", s.handleRestore)
  ```

  **先在 `server.go` 的 import 块中添加缺失的三个包**（当前文件中均不存在）：
  ```go
  import (
      // ...已有的包...
      "io"
      "os"
      "path/filepath"
  )
  ```

  实现 `handleBackup`：

  ```go
  func (s *Server) handleBackup(w http.ResponseWriter, r *http.Request) {
      backupPath := s.cfg.DBPath + ".bak." + time.Now().Format("20060102-150405")
      src, err := os.Open(s.cfg.DBPath)
      if err != nil {
          writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
          return
      }
      defer src.Close()
      dst, err := os.Create(backupPath)
      if err != nil {
          writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
          return
      }
      defer dst.Close()
      if _, err := io.Copy(dst, src); err != nil {
          writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
          return
      }
      writeJSON(w, http.StatusOK, map[string]any{"backupPath": backupPath})
  }
  ```

  实现 `handleRestore`（接受 `backupPath` 参数，复制回主数据库）：

  ```go
  func (s *Server) handleRestore(w http.ResponseWriter, r *http.Request) {
      var body struct{ BackupPath string `json:"backupPath"` }
      if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.BackupPath == "" {
          writeJSON(w, http.StatusBadRequest, map[string]any{"error": "backupPath required"})
          return
      }
      // 安全检查：backup 文件必须在同一目录下
      if filepath.Dir(body.BackupPath) != filepath.Dir(s.cfg.DBPath) {
          writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid backup path"})
          return
      }
      src, err := os.Open(body.BackupPath)
      if err != nil {
          writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
          return
      }
      defer src.Close()
      dst, err := os.Create(s.cfg.DBPath)
      if err != nil {
          writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
          return
      }
      defer dst.Close()
      if _, err := io.Copy(dst, src); err != nil {
          writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
          return
      }
      writeJSON(w, http.StatusOK, map[string]any{"restored": true})
  }
  ```

  在文件顶部 import 添加 `"io"` 和 `"os"` 和 `"path/filepath"`（若未有）。

- [ ] **Step 2: 在 `SettingsPage.jsx` 添加备份/恢复 UI**

  在设置页的"数据"卡片中添加两个按钮：
  - "立即备份" → 调用 `api.backupData()` → 显示备份路径
  - "恢复备份" → 输入备份文件路径 → 调用 `api.restoreData(path)` → 成功后提示重启

  在 `lib/api.js` 中添加：
  ```js
  backupData: () => post("/api/settings/data/backup", {}),
  restoreData: (backupPath) => post("/api/settings/data/restore", { backupPath }),
  ```

- [ ] **Step 3: 手动验证**

  在设置页点击备份，确认数据目录出现 `.bak.` 文件；用备份路径恢复，确认数据库被替换。

- [ ] **Step 4: Commit**

  ```bash
  git add apps/server/internal/api/server.go apps/desktop-electron/renderer/src/pages/SettingsPage.jsx apps/desktop-electron/renderer/src/lib/api.js
  git commit -m "feat: 添加手动数据备份/恢复功能（Go API + SettingsPage UI）"
  ```

---

### Task 12: 生成最终安装包

- [ ] **Step 1: 构建 Go 服务二进制**

  ```bash
  cd apps/server
  go build -o ../desktop-electron/bin/ojreviewd.exe ./cmd/ojreviewd
  ```

- [ ] **Step 2: 构建完整安装包**

  ```bash
  cd apps/desktop-electron
  npm run dist
  ```
  预期：`dist/OJReviewDesktop-{version}-win-x64.exe` 安装包生成。

- [ ] **Step 3: 安装验证**

  双击安装包，完整走一遍首次启动引导；确认快捷方式、卸载程序正常；模拟更新（修改 package.json 版本号后重新打包）验证 electron-updater 能检测到新版本。

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop-electron/bin/ojreviewd.exe
  git commit -m "chore: 更新 ojreviewd.exe 二进制"
  ```

---

## 阶段 2（记录，暂缓）— 综合统计 Dashboard

见 `docs/superpowers/specs/2026-04-02-bugfix-and-packaging-design.md` 阶段 2 章节。待阶段 1 完成后另行展开实施计划。

---

## 执行顺序总结

```
Chunk 1 → Chunk 2（可并行 Task 4/5/6）→ Chunk 3 → Chunk 4 → Chunk 5
```

阶段 0（Chunk 1-2）完成后可独立验收；阶段 1（Chunk 3-5）依赖阶段 0 完成。
