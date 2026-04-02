# 设计文档：Bug 修复 + 打包发布

**日期：** 2026-04-02  
**产品线：** 桌面端（Electron + Go ojreviewd）  
**状态：** 已确认

---

## 背景

Web 版已废弃，当前专注桌面端。AI 分析功能已合并，基础骨架完整。Codex 静态分析发现若干高危 bug，需在新功能前修复。打包发布是让用户实际用上这个工具的关键一步。

---

## 阶段划分

### 阶段 0 — Bug 修复（前置，必须先完成）

#### Electron 主进程（高危）

**Bug 1：`ensureStarted()` 无并发锁**
- 文件：`apps/desktop-electron/main/index.mjs:81-205`
- 问题：并发调用可绕过健康检查，启动多个 ojreviewd 进程
- 修复：用 `startPromise` 互斥锁序列化启动，已有进程或启动中则提前返回；**启动失败的所有分支（返回前）必须将 `startPromise` 清为 `null`**，确保后续重试（如用户点击"重启服务"触发 `restart()` → `ensureStarted()`）可以重新走完整启动流程，而不是返回缓存的失败 Promise

**Bug 2：spawn 无 `error` 监听器**
- 文件：`apps/desktop-electron/main/index.mjs:133-172`
- 问题：`ENOENT`/权限等异步 spawn 错误变成未处理异常，状态无法更新
- 修复：`spawn()` 后立即注册 `this.child.once("error", ...)` 并更新服务状态/清理资源

**Bug 3：`before-quit` 不等待 stop 完成**
- 文件：`apps/desktop-electron/main/index.mjs:478-480`
- 问题：`void serviceManager.stop()` 不 await，Electron 可能在 Go 进程被杀死前退出，留下僵尸进程
- 修复：`before-quit` 是同步事件，无法直接 await。正确模式：`event.preventDefault()` 阻止退出 → await `serviceManager.stop()` → 用守护标志调用 `app.quit()` 防止递归触发

#### 渲染层（中危，用户可见）

**Bug 4：`problemSubmitRef` 轮询终态未重置**
- 文件：`apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx:299-316, 319`
- 问题：轮询到 `SUCCESS`/`FAILED` 后 `problemSubmitRef.current` 未清除。按钮 UI 上看起来可点击（disabled 条件只看 `problemLoading`），但点击后 `handleGenerateProblemAnalysis` 在第 319 行提前 return，**静默无响应**（不是视觉禁用）
- 修复：在 `scheduleProblemPoll` 的终态分支（SUCCESS/FAILED）中执行 `problemSubmitRef.current = false`；验证方式：分析完成后再次点击按钮应能触发新一轮分析

#### Go 服务（中危）

**Bug 5：`findReusableAnalysisTask` 无 status 过滤**
- 文件：`apps/server/internal/storage/sqlite.go:1252-1259`
- 问题：SQL 查询仅按 `input_snapshot_id + provider + model + 10 分钟内` 匹配，**完全没有 status 过滤**，任何状态的任务（包括 `FAILED`/`CANCELLED`）都会被复用，导致失败后无法重试
- 修复：SQL 加白名单 `AND status IN ('PENDING', 'RUNNING', 'SUCCESS')`，用白名单而非黑名单，避免未来新增状态时漏堵

**Bug 6：`Enqueue()` goroutine 泄漏 + inflight 表污染**
- 文件：`apps/server/internal/jobs/queue.go:82-96, 146-150`
- 问题：ctx 取消后 goroutine 永久阻塞在 channel send 上；且即使加了 `ctx.Done()` 退出，`q.inflight[job.Key]` 清理只在 `runJob`（146-150 行）执行，goroutine 提前退出后 inflight 表中的 key 永久残留，导致同 key 的后续任务全部被拒绝
- 修复：`select` 的 `ctx.Done()` 分支中，退出前同步执行 `delete(q.inflight, job.Key)`（需加锁）

---

### 阶段 1 — 完整打包发布

#### 1.1 NSIS 安装包完善
- 目标：`npm run dist` 产出可直接分发的 Windows 安装包
- 包含：应用图标、版本号、卸载程序、快捷方式

#### 1.2 首次启动引导
- 触发：**单一来源** — Go 服务健康检查响应中新增 `"firstRun": true` 字段（由服务检测数据库是否存在/AI Key 是否已配置）；前端只读这个字段，不自行判断
- 步骤：
  1. 欢迎页（产品简介）
  2. AI 配置（API Key、Base URL、模型选择）
  3. 数据目录确认（默认 `%AppData%/OJReviewDesktop`，可自定义）
  4. 完成页，跳转 Dashboard
- 实现：新增 `OnboardingPage.jsx`，`App.jsx` 在服务就绪后读取 `firstRun` 字段决定是否插入引导流程
- 不使用 localStorage 标志（迁移机器时数据库存在但仍需引导的场景会误判）

#### 1.3 应用内自动更新
- 机制：**`electron-updater`**（`electron-builder` 内置），**不使用** Electron 原生 `autoUpdater`（原生模块在 Windows 上需要 Squirrel.Windows，与 NSIS 安装包不兼容）
- 对接：GitHub Releases，`electron-builder` 的 `publish` 配置指向 repo
- 行为：后台静默检查 → 有新版本时在状态栏提示 → 用户手动触发下载安装
- 前置条件：发布 release 需 GitHub token（`GH_TOKEN` 环境变量）；Windows 代码签名证书为可选项，无证书时更新仍可工作但用户会看到 SmartScreen 警告
- 不做强制更新

#### 1.4 数据备份与迁移
- 升级时自动备份当前数据库（`ojreview.db.bak.{version}`）
- 新版本 schema 变更通过 Go 服务启动时自动执行迁移
- 提供手动备份/恢复入口（在 SettingsPage 中）

---

### 阶段 2（记录，暂缓）— 综合统计 Dashboard

待阶段 1 完成后启动。

#### 规划内容
- 新增 `StatsPage`，导航栏增加入口
- 四个数据卡片：
  - **做题趋势**：每日/周提交量 + AC 率折线
  - **复习进度**：SM-2 队列健康度、到期待复习数量、记忆保留率
  - **薄弱点分析**：按算法标签/难度聚合错误率
  - **全局概览**：总题数、总分析次数、连续打卡天数
- Go 服务新增 `/api/stats` 聚合接口
- 前端轻量图表渲染（SVG，不引入外部图表库）

---

## 备选方案（已记录）

**方向二：统计与打包穿插**
若阶段 1 提前完成，可切换为：阶段 1 前半做统计 dashboard，后半做打包。当前不执行，作为加速选项保留。

---

## 不在范围内

- Web 版任何修改（已废弃）
- AtCoder/LeetCode 等新 OJ 适配（后续规划）
- 移动端
