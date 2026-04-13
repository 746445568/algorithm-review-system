# 账号管理移至首页 — 实现计划

> 日期：2026-04-09

---

## 目标

1. **移除账号管理页面** - 从导航栏移除，不再作为独立页面
2. **账号管理功能合并到首页** - 在 DashboardPage 中实现完整的账号管理功能
3. **后台自动同步数据** - 应用启动后自动定期同步所有账号

---

## Phase 1 — DashboardPage 增强

### Task 1.1 — 增强账号绑定表单

**文件**：`apps/desktop-electron/renderer/src/pages/DashboardPage.jsx`

在 "已绑定账号" section 添加：
- 平台选择下拉框（Codeforces / AtCoder）
- 用户名输入框
- "保存账号" 按钮

复用 AccountsPage 中的表单逻辑（handleSubmit、form state）。

### Task 1.2 — 增强账号卡片

升级账号卡片：
- 显示评分（rating/maxRating）
- 添加 "刷新评分" 按钮
- 添加 "立即同步" 按钮
- 添加 "删除" 按钮

复用 AccountsPage 中的 handleRefreshRating、triggerSync、deleteAccount 逻辑。

### Task 1.3 — 同步队列预览

在首页保留 "最新任务" section，显示最近同步状态。

---

## Phase 2 — 导航调整

### Task 2.1 — 移除账号管理页面入口

**文件**：`apps/desktop-electron/renderer/src/App.jsx`

1. 从 `navItems` 数组中移除 `{ id: "accounts", ... }` 项
2. 移除 `<AccountsPage />` 的导入和渲染

---

## Phase 3 — 后台自动同步

### Task 3.1 — 应用启动时自动同步

**文件**：`apps/desktop-electron/renderer/src/App.jsx`

服务 healthy 后，自动同步所有已绑定账号。

### Task 3.2 — 定时后台同步

每 30 分钟自动同步所有账号。

---

## 验收标准

1. ✅ 导航栏不再显示 "账号管理"
2. ✅ 首页能完成账号绑定、同步、删除
3. ✅ 应用启动后自动同步
4. ✅ 定时后台同步正常
5. ✅ 编译无错误

---

## 执行顺序

```
Phase 1 → Phase 2 → Phase 3
```