# 移除手动同步 UI，改为纯后台自动同步

**日期：** 2026-05-07  
**状态：** 已批准

## 目标

将顶部导航栏的"同步"按钮和"服务可达"状态指示点全部去除，同时清理设置页的同步队列区块和 `useOfflineData` 的冗余公开接口。后台自动同步逻辑保持不变，用户无感知地持续同步。

## 改动范围

| 文件 | 改动说明 |
|------|----------|
| `App.jsx` | 删除"同步"按钮、`handleSync`、`renderedIndicator` 渲染；删除 `isSyncing`、`lastSyncAt`、`syncQueue` 解构；保留两条自动 sync useEffect |
| `useOfflineData.js` | 从返回对象移除 `isSyncing`、`lastSyncAt`、`syncQueue`；删除对应 `useState` 和内部 `setIsSyncing`/`setLastSyncAt` 调用 |
| `AccountsPage.jsx` | 删除 `syncTasks` state、`getSyncTasks` API 调用、同步队列 section JSX；将"绑定平台账号"表单与"已绑定账号"列表合并为单个"平台账号" section |

## 数据流（改动后）

```
App 挂载       → useEffect → sync()（静默）
每 5 分钟      → useEffect → sync()（静默）
服务变健康时   → useEffect → syncAllAccounts()（静默）
```

没有任何组件消费 `isSyncing` 或 `lastSyncAt`，不产生多余 re-render。

## AccountsPage 布局

单 section"平台账号"：
1. 绑定表单（平台下拉 + 用户名输入 + 保存按钮）
2. 分隔线
3. 已绑账号列表（每条：平台、handle、评分、刷新评分 / 立即同步 / 删除）
4. 无账号时显示占位文案

错误和成功消息保留在 section 内。

## 不变的逻辑

- `sync.js` 全部保留，`setupAutoSync` 函数不删
- `App.jsx` 两条自动 sync useEffect 不动
- `runtimeStatus.js` 中 `getRenderedServiceIndicator` 函数保留，仅移除 `App.jsx` 中的调用

## 验收标准

- 顶部导航栏无同步按钮、无状态指示点
- 设置页账号区块为单 section，表单与列表合并显示
- 控制台无新增错误
- 后台每 5 分钟仍自动触发 sync（可通过 console 确认）
