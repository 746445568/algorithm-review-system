# AI 分析页功能设计文档

**日期：** 2026-03-30
**状态：** 已确认，待实施

---

## 目标

为桌面端（Electron + React + Go ojreviewd）新增独立的 AI 分析页，提供两大功能：

1. **全局报告**：按时段（本周/本月）生成数据摘要 + AI 叙述分析 + 环比板块
2. **单题分析**：对单道题目的提交记录、用户笔记、题目标签进行 AI 分析

---

## 用户流程

```
仪表盘 AI 分析卡片
    └─ 点击 → 跳转到 AI 分析页（全局报告默认展开）

复习详情页（ReviewDetail）
    └─ "分析这道题"按钮 → 跳转到 AI 分析页，右侧自动选中该题并触发分析

AI 分析页（左右分栏）
    ├─ 左：全局报告（本周/本月切换 → 生成 → 轮询 → 展示）
    │       └─ 环比板块（后端合并两期数据，单次 LLM 调用）
    └─ 右：单题分析（搜索选题 或 从复习页跳入自动选中 → 生成 → 轮询 → 展示）
```

---

## 架构

### 页面布局

`AnalysisPage.jsx` — 左右分栏，响应式：宽屏并排，窄屏上下叠放。

```
┌──────────────────────────────────────────────────────────────┐
│  AI 分析                                        ← 返回仪表盘  │
├──────────────────────┬───────────────────────────────────────┤
│  全局报告            │  单题分析                              │
│                      │                                        │
│  [本周] [本月]       │  [搜索题目选择器]                      │
│  [生成报告]          │  [生成分析]                            │
│                      │                                        │
│  数据摘要条          │  轮询进度 / 分析结果（Markdown）       │
│  AI 分析文本         │                                        │
│                      │                                        │
│  ── 环比板块 ──      │                                        │
│  [生成环比]          │                                        │
│  跨期对比结果        │                                        │
└──────────────────────┴───────────────────────────────────────┘
```

### 导航

新建 `renderer/src/lib/NavigationContext.jsx`，提供：

```javascript
// Context value
{ page: string, navigateTo(page: string, state?: object): void }

// 使用方式（任意组件内）
const { navigateTo } = useNavigation();
navigateTo("analysis", { problemId: 123 });
```

`App.jsx` 在顶层提供 Provider，消除跨层 prop drilling。现有 `setPage` 逻辑迁移进 Context。

---

## 后端设计（Go ojreviewd）

### 数据库迁移

`review_snapshots` 表新增两列（schema version 升级，ALTER TABLE 方式）：

```sql
ALTER TABLE review_snapshots ADD COLUMN snapshot_type TEXT NOT NULL DEFAULT 'global';
-- 取值：'global' | 'global_comparison' | 'problem'
ALTER TABLE review_snapshots ADD COLUMN problem_id INTEGER;
-- snapshot_type='problem' 时填写，其余为 NULL
```

`findReusableAnalysisTask` 的重用匹配条件更新为：
`(snapshot_type, problem_id, provider, model)` 四元组，避免跨类型误命中。

### 内部函数（不改现有签名）

新增 `GetReviewSummaryForPeriod(start, end time.Time) (*ReviewSummary, error)`，原 `GetReviewSummary()` 不变（仪表盘继续使用原函数）。

### API 端点

#### 已有端点（修改）

```
POST /api/analysis/generate
Body: {
  period: "week" | "month",   // 新增，必填
  provider?: string,
  model?: string
}
```

- 后端根据 `period` 计算 `startDate`/`endDate`（自然周：周一~周日；自然月：月初~月末）
- 调用 `GetReviewSummaryForPeriod` 生成时段 snapshot（`snapshot_type = 'global'`）
- 其余逻辑不变（入队、重用、返回 `{ task, reused }`）

#### 新增端点

```
POST /api/analysis/generate-comparison
Body: {
  period: "week" | "month",   // 对比维度（本周 vs 上周 / 本月 vs 上月）
  provider?: string,
  model?: string
}
→ 202 { task, reused }
```

- 后端分别查本期和上期两个 `ReviewSummary`
- 将两个 summary **合并进同一个 snapshot**（`snapshot_type = 'global_comparison'`），prompt 中明确标注时段
- 单次 LLM 调用，AI 能看到完整跨期数据，输出真正的对比洞察

```
POST /api/analysis/generate-problem/{problemId}
Body: { provider?: string, model?: string }
→ 202 { task, reused }
```

- 查该题：题目元数据 + 所有提交记录 + 用户 notes（从 `problem_review_states`）+ tags
- 生成 snapshot（`snapshot_type = 'problem'`, `problem_id = problemId`）
- 入队，返回 `{ task, reused }`

```
GET /api/analysis/latest
→ 200 AnalysisTask | 204（无历史）
```

- 返回最近一次 `snapshot_type = 'global'` 的 SUCCESS 任务
- 供仪表盘卡片展示上次分析摘要和时间戳

```
GET /api/analysis/{taskId}（已有，不变）
→ 200 AnalysisTask
```

---

## 前端设计

### 文件清单

| 操作 | 文件 | 职责 |
|---|---|---|
| **新建** | `renderer/src/lib/NavigationContext.jsx` | 导航 Context，`navigateTo(page, state)` |
| **新建** | `renderer/src/pages/AnalysisPage.jsx` | AI 分析页，左右分栏，组合下列子组件 |
| **修改** | `renderer/src/App.jsx` | 包裹 Provider；navItems + 条件渲染加 analysis |
| **修改** | `renderer/src/lib/api.js` | 新增 5 个 API 方法（见下） |
| **修改** | `renderer/src/pages/DashboardPage.jsx` | 新增 AI 分析卡片 |
| **修改** | `renderer/src/pages/ReviewDetail.jsx` | 新增"分析这道题"按钮 |
| **修改** | `renderer/src/styles.css` | 新增 `an-*` 前缀样式类 |

### api.js 新增方法

```javascript
generateAnalysis: ({ period, provider, model } = {}) =>
  request("/api/analysis/generate", { method: "POST", body: JSON.stringify({ period, provider, model }) }),

generateComparisonAnalysis: ({ period, provider, model } = {}) =>
  request("/api/analysis/generate-comparison", { method: "POST", body: JSON.stringify({ period, provider, model }) }),

generateProblemAnalysis: (problemId, { provider, model } = {}) =>
  request(`/api/analysis/generate-problem/${problemId}`, { method: "POST", body: JSON.stringify({ provider, model }) }),

getAnalysisTask: (taskId) =>
  request(`/api/analysis/${taskId}`),

getLatestAnalysis: () =>
  request("/api/analysis/latest"),
```

### AnalysisPage 状态设计

```javascript
// 全局报告
const [period, setPeriod] = useState("week");          // "week" | "month"
const [globalTask, setGlobalTask] = useState(null);    // AnalysisTask | null
const [globalLoading, setGlobalLoading] = useState(false);
const [globalError, setGlobalError] = useState(null);

// 环比
const [compTask, setCompTask] = useState(null);
const [compLoading, setCompLoading] = useState(false);
const [compError, setCompError] = useState(null);

// 单题分析
const [selectedProblemId, setSelectedProblemId] = useState(initProblemId ?? null);
const [problemTask, setProblemTask] = useState(null);
const [problemLoading, setProblemLoading] = useState(false);
const [problemError, setProblemError] = useState(null);

// 轮询 refs（三条独立，useEffect cleanup 各自管理）
const globalPollRef = useRef(null);
const compPollRef = useRef(null);
const problemPollRef = useRef(null);
```

`initProblemId` 从 NavigationContext 的 `navigationState.problemId` 读取，组件挂载后若存在则自动触发单题分析。

### 轮询策略

- 间隔：2 秒
- 终止条件：`status === 'SUCCESS'` 或 `status === 'FAILED'`
- 最大轮询次数：60 次（2 分钟超时），超出后设为 error 态，提示用户重试
- `useEffect` cleanup 在组件卸载或 `page` 切换时清除所有三个 timer

### DashboardPage AI 卡片

- 页面加载时调 `api.getLatestAnalysis()`
- 有结果：展示时间戳 + `resultText` 前 80 字截断 + "进入分析页 →" 按钮
- 无结果（204）：展示"尚无分析记录，点击生成" 按钮
- 点击均调 `navigateTo("analysis")`

---

## 错误处理

| 场景 | 处理方式 |
|---|---|
| AI 未配置（400） | 提示"请先在设置页配置 AI 服务" + 跳转按钮 |
| 任务失败（FAILED） | 展示 `errorMessage` + 重试按钮 |
| 轮询超时（60次） | "分析超时，请重试" + 重试按钮 |
| 服务不可达 | 复用现有 `serviceUnavailable` 判断，禁用所有生成按钮 |
| 单题无提交记录 | 后端返回 400，前端提示"该题暂无提交记录，无法分析" |

---

## 不在此版本范围内

- 自定义日期范围选择器（仅本周/本月）
- 分析历史列表（只展示最新一条）
- 代码源文件分析（只分析提交元数据，不含源代码）
- AtCoder 以外的新平台
- 移动端/Web 版同步

---

## 实施顺序建议

1. Go：数据库迁移（snapshot 表加列）
2. Go：`GetReviewSummaryForPeriod` 内部函数
3. Go：修改 `handleAnalysisGenerate` 接受 `period`
4. Go：新增 `generate-comparison` 端点
5. Go：新增 `generate-problem/{problemId}` 端点
6. Go：新增 `GET /api/analysis/latest` 端点
7. 前端：`NavigationContext.jsx` + `App.jsx` 迁移
8. 前端：`api.js` 新增方法
9. 前端：`AnalysisPage.jsx`（全局报告左侧）
10. 前端：`AnalysisPage.jsx`（单题分析右侧）
11. 前端：`DashboardPage.jsx` AI 卡片
12. 前端：`ReviewDetail.jsx` "分析这道题"按钮
13. 前端：`styles.css` 样式
