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
- 修复：用 `startPromise` 互斥锁序列化启动，已有进程或启动中则提前返回

**Bug 2：spawn 无 `error` 监听器**
- 文件：`apps/desktop-electron/main/index.mjs:133-172`
- 问题：`ENOENT`/权限等异步 spawn 错误变成未处理异常，状态无法更新
- 修复：`spawn()` 后立即注册 `this.child.once("error", ...)` 并更新服务状态/清理资源

**Bug 3：`before-quit` 不等待 stop 完成**
- 文件：`apps/desktop-electron/main/index.mjs:478-480`
- 问题：`void serviceManager.stop()` 不 await，Electron 可能在 Go 进程被杀死前退出，留下僵尸进程
- 修复：阻止退出直到 shutdown 完成，await 后再允许 app 终止

#### 渲染层（中危，用户可见）

**Bug 4：`problemSubmitRef` 轮询终态未重置**
- 文件：`apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx:174`
- 问题：轮询到 `SUCCESS`/`FAILED` 后未清除 ref，单题分析按钮永久禁用
- 修复：在轮询终态分支中同样执行 `problemSubmitRef.current = false`

#### Go 服务（中危）

**Bug 5：`FAILED` 任务阻止重试**
- 文件：`apps/server/internal/storage/sqlite.go:983-1001`
- 问题：复用任务时未排除 `FAILED` 状态，失败任务阻止真正的重试
- 修复：复用限制在 `PENDING`/`RUNNING`/`SUCCESS`，明确排除 `FAILED`/`CANCELLED`

**Bug 6：`Enqueue()` goroutine 泄漏**
- 文件：`apps/server/internal/jobs/queue.go:82-95`
- 问题：ctx 取消后 goroutine 永久阻塞在 channel send 上
- 修复：`select` 中加入 `ctx.Done()` 分支使 send 具备上下文感知

---

### 阶段 1 — 完整打包发布

#### 1.1 NSIS 安装包完善
- 目标：`npm run dist` 产出可直接分发的 Windows 安装包
- 包含：应用图标、版本号、卸载程序、快捷方式

#### 1.2 首次启动引导
- 触发：检测到数据库不存在（全新安装）
- 步骤：
  1. 欢迎页（产品简介）
  2. AI 配置（API Key、Base URL、模型选择）
  3. 数据目录确认（默认 `%AppData%/OJReviewDesktop`，可自定义）
  4. 完成页，跳转 Dashboard
- 实现：新增 `OnboardingPage.jsx`，在 `App.jsx` 中检测首次启动标志后插入

#### 1.3 应用内自动更新
- 机制：Electron `autoUpdater` 模块，对接 GitHub Releases
- 行为：后台静默检查 → 有新版本时在状态栏提示 → 用户手动触发下载安装
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
