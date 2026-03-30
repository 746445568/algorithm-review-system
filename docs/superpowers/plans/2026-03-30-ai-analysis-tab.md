# AI 分析 Tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ReviewDetail 页面新增"AI 分析"Tab，让用户能一键触发全局弱点分析、实时查看生成进度并阅读结果。

**Architecture:** 前端通过两个新 API 方法（generateAnalysis / getAnalysisTask）调用已有的 Go 后端分析端点；ReviewDetail 内用轮询（每 2 秒）驱动任务状态机；分析结果复用现有的 SimpleMarkdown 组件渲染。

**Tech Stack:** React 19 JSX（无 TypeScript）、已有 `api.js` 封装、已有 `styles.css` CSS 变量体系

---

## 背景知识（零上下文工程师必读）

### Go 后端已有的两个端点

```
POST /api/analysis/generate
  Body: {} （空对象即可；provider/model 由后端从已保存的 AI 设置读取）
  → HTTP 202  { task: AnalysisTask, reused: bool }

GET /api/analysis/{taskId}
  → HTTP 200  AnalysisTask
```

`AnalysisTask` 的 JSON 字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 任务 ID |
| `status` | string | `"PENDING"` \| `"RUNNING"` \| `"SUCCESS"` \| `"FAILED"` |
| `provider` | string | `"openai"` / `"deepseek"` / `"ollama"` |
| `model` | string | 模型名 |
| `resultText` | string | AI 返回的 Markdown 分析文本 |
| `errorMessage` | string | 失败时的错误信息 |
| `updatedAt` | string | ISO 时间戳 |

### 重要约束

- 分析是**全局的**（覆盖所有题目的复习数据），不是针对单道题
- 若 AI 未配置，`POST /api/analysis/generate` 返回 400，错误信息为：
  `"provider and model are required; configure AI settings first"`
- 无测试框架，无需写单元测试，任务中只提供手动验证步骤

### 关键文件位置

| 文件 | 说明 |
|------|------|
| `apps/desktop-electron/renderer/src/lib/api.js` | 前端 API 封装，已有 `api` 对象 |
| `apps/desktop-electron/renderer/src/pages/ReviewDetail.jsx` | 复习详情面板（482 行） |
| `apps/desktop-electron/renderer/src/styles.css` | 全局样式，1700+ 行，尾部追加 |

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `apps/desktop-electron/renderer/src/lib/api.js` | 新增 2 个分析 API 方法 |
| 修改 | `apps/desktop-electron/renderer/src/styles.css` | 新增 AI 面板 CSS（`rd-ai-*`） |
| 修改 | `apps/desktop-electron/renderer/src/pages/ReviewDetail.jsx` | 新增状态、轮询逻辑、AI Tab UI |

---

## Task 1：api.js — 新增分析 API 方法

**Files:**
- Modify: `apps/desktop-electron/renderer/src/lib/api.js:161-221`

- [ ] **Step 1：在 `api` 对象末尾追加两个方法**

  打开 `api.js`，找到第 178 行附近的 `exportDiagnostics` 方法。在 `getProblems` 之前（当前第 183 行），插入：

  ```javascript
  generateAnalysis: (opts = {}) =>
    request("/api/analysis/generate", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  getAnalysisTask: (taskId) => request(`/api/analysis/${taskId}`),
  ```

  插入后，`api` 对象从 `exportDiagnostics` 到 `getProblems` 之间看起来像这样：

  ```javascript
  exportDiagnostics: () =>
    request("/api/settings/data/export-diagnostics", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  generateAnalysis: (opts = {}) =>
    request("/api/analysis/generate", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  getAnalysisTask: (taskId) => request(`/api/analysis/${taskId}`),
  getProblems: async (query = {}) => {
  ```

- [ ] **Step 2：手动验证**

  启动 Go 服务（`cd apps/server && go run ./cmd/ojreviewd`），打开浏览器控制台：

  ```javascript
  // 先配置 AI 设置，再测试：
  const { task } = await window.__api?.generateAnalysis({})
  // 期望：task.id 是数字，task.status 是 "PENDING" 或 "RUNNING"

  const result = await window.__api?.getAnalysisTask(task.id)
  // 期望：返回 AnalysisTask 对象，字段齐全
  ```

  若未配置 AI，期望 `generateAnalysis` 抛出带 "provider and model are required" 的错误。

- [ ] **Step 3：提交**

  ```bash
  cd apps/desktop-electron
  git add renderer/src/lib/api.js
  git commit -m "feat: 新增 generateAnalysis / getAnalysisTask API 方法"
  ```

---

## Task 2：styles.css — 新增 AI 面板样式

**Files:**
- Modify: `apps/desktop-electron/renderer/src/styles.css`（在文件末尾追加）

- [ ] **Step 1：在 styles.css 末尾追加以下内容**

  找到文件末尾（当前约 1750 行），在最后一行后追加：

  ```css
  /* ─── AI Analysis tab (rd-ai-*) ──────────────────────── */
  .rd-ai-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 160px;
  }

  /* Empty / trigger state */
  .rd-ai-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 36px 16px;
    text-align: center;
  }
  .rd-ai-hint {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    max-width: 300px;
    line-height: 1.6;
  }
  .rd-ai-error-msg {
    margin: 0;
    font-size: 13px;
    color: var(--bad);
  }

  /* Progress state */
  .rd-ai-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 36px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
  }
  .rd-ai-provider-hint { font-size: 11px; }

  /* Failed state */
  .rd-ai-failed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 28px 16px;
    text-align: center;
  }

  /* Success state */
  .rd-ai-result-area {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .rd-ai-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .rd-ai-provider-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
  }
  .rd-ai-regen-btn {
    margin-left: auto;
    font-size: 12px;
    padding: 4px 10px;
  }
  .rd-ai-result {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--bg);
    font-size: 14px;
    line-height: 1.7;
    max-height: 480px;
    overflow-y: auto;
  }
  ```

- [ ] **Step 2：手动验证**

  在 Vite 开发服务器运行时（`npm run dev:renderer`），打开浏览器 DevTools → Elements，
  确认 `.rd-ai-panel`, `.rd-ai-empty`, `.rd-ai-result` 等类名能在样式面板中找到，且 CSS 变量（`var(--accent-soft)` 等）能正常解析。

- [ ] **Step 3：提交**

  ```bash
  git add renderer/src/styles.css
  git commit -m "feat: 新增 AI 分析面板样式 (rd-ai-*)"
  ```

---

## Task 3：ReviewDetail.jsx — 新增 AI 分析 Tab

**Files:**
- Modify: `apps/desktop-electron/renderer/src/pages/ReviewDetail.jsx`

本任务分三个子步骤：添加状态/refs、添加分析逻辑函数、添加 Tab 声明和 Tab 面板 JSX。

### 子步骤 A：添加状态变量和 analysisPollRef

- [ ] **Step 1：在已有 state 声明块末尾（第 109 行之后）插入分析状态**

  找到第 109 行：
  ```javascript
  const [activeTab, setActiveTab] = useState("state");
  ```

  在其**正下方**插入：
  ```javascript
  const [analysisTask, setAnalysisTask] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  ```

- [ ] **Step 2：在已有 refs 声明处（第 111 行之后）添加 analysisPollRef**

  找到第 111-112 行：
  ```javascript
  const seqRef = useRef(0);
  const autoAdvRef = useRef(null);
  ```

  在 `autoAdvRef` 声明**正下方**插入：
  ```javascript
  const analysisPollRef = useRef(null);
  ```

- [ ] **Step 3：更新已有 cleanup effect（第 192 行）以停止轮询**

  找到第 192 行：
  ```javascript
  useEffect(() => () => clearTimeout(autoAdvRef.current), []);
  ```

  替换为：
  ```javascript
  useEffect(() => () => {
    clearTimeout(autoAdvRef.current);
    clearTimeout(analysisPollRef.current);
  }, []);
  ```

### 子步骤 B：添加分析逻辑函数

- [ ] **Step 4：在 `useReviewFlow` 调用之后（第 200 行之后）、空状态判断之前插入分析函数**

  找到第 202-203 行：
  ```javascript
  // ── Empty state ──
  if (!selectedProblem) {
  ```

  在这两行**正上方**插入以下函数（这些是组件内部的普通函数，不需要 useCallback）：

  ```javascript
  // ── AI Analysis ──
  function stopAnalysisPoll() {
    if (analysisPollRef.current) { clearTimeout(analysisPollRef.current); analysisPollRef.current = null; }
  }

  function scheduleAnalysisPoll(taskId) {
    stopAnalysisPoll();
    analysisPollRef.current = setTimeout(async () => {
      try {
        const task = await api.getAnalysisTask(taskId);
        setAnalysisTask(task);
        if (task.status !== "SUCCESS" && task.status !== "FAILED") {
          scheduleAnalysisPoll(taskId);
        } else {
          setAnalysisLoading(false);
        }
      } catch (err) {
        setAnalysisLoading(false);
        setAnalysisError(err.message);
      }
    }, 2000);
  }

  async function handleGenerateAnalysis() {
    if (analysisLoading) return;
    stopAnalysisPoll();
    setAnalysisLoading(true);
    setAnalysisTask(null);
    setAnalysisError(null);
    try {
      const { task } = await api.generateAnalysis({});
      setAnalysisTask(task);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        setAnalysisLoading(false);
      } else {
        scheduleAnalysisPoll(task.id);
      }
    } catch (err) {
      setAnalysisLoading(false);
      setAnalysisError(err.message);
    }
  }
  ```

### 子步骤 C：添加 Tab 声明和 Tab 面板

- [ ] **Step 5：在 Tab 列表中追加"AI 分析"项**

  找到第 322-337 行的 Tab 列表：
  ```javascript
  {[
    { id: "state",       label: "复习状态" },
    { id: "submissions", label: `提交记录${hasSubmissions ? ` (${selectedSubmissions.length})` : ""}` },
    { id: "raw",         label: "原始数据" },
  ].map((tab) => (
  ```

  替换为：
  ```javascript
  {[
    { id: "state",       label: "复习状态" },
    { id: "submissions", label: `提交记录${hasSubmissions ? ` (${selectedSubmissions.length})` : ""}` },
    { id: "raw",         label: "原始数据" },
    { id: "analysis",    label: "AI 分析" },
  ].map((tab) => (
  ```

- [ ] **Step 6：在原始数据 Tab 面板之后插入 AI 分析 Tab 面板**

  找到第 458-468 行（Raw 面板结束处）：
  ```javascript
        {/* Tab: Raw Data */}
        {activeTab === "raw" && (
          <div className="panel rd-raw-panel">
            <p className="rd-raw-note muted">当前服务返回 raw_json（提交元数据），非源代码。</p>
            {representativeSubmission ? (
              <pre className="rd-raw-pre">{formatRawJSON(representativeSubmission.rawJson)}</pre>
            ) : (
              <p className="muted">无可用原始数据。</p>
            )}
          </div>
        )}
  ```

  在 Raw 面板的 `)}` **正下方**插入：

  ```javascript
        {/* Tab: AI Analysis */}
        {activeTab === "analysis" && (
          <div className="panel rd-ai-panel">
            {/* Empty / error state */}
            {!analysisTask && !analysisLoading && (
              <div className="rd-ai-empty">
                <p className="rd-ai-hint">基于全部复习数据生成个性化弱点分析，帮助你找到最需要补强的知识点。</p>
                {analysisError && (
                  <p className="rd-ai-error-msg">
                    {analysisError.includes("provider and model are required")
                      ? "请先在设置页面配置 AI 服务（提供商 + 模型 + API Key）"
                      : `分析失败：${analysisError}`}
                  </p>
                )}
                <button
                  type="button"
                  className="primary-button"
                  disabled={serviceUnavailable}
                  onClick={() => void handleGenerateAnalysis()}
                >
                  生成 AI 分析
                </button>
                {serviceUnavailable && <p className="muted" style={{ fontSize: 12 }}>等待本地服务就绪…</p>}
              </div>
            )}

            {/* Submitting / polling progress */}
            {(analysisLoading || (analysisTask && analysisTask.status !== "SUCCESS" && analysisTask.status !== "FAILED")) && (
              <div className="rd-ai-progress">
                <span className="rd-spinner" />
                <span>
                  {!analysisTask && "正在提交…"}
                  {analysisTask?.status === "PENDING" && "排队等待中…"}
                  {analysisTask?.status === "RUNNING" && "AI 分析中，请稍候…"}
                </span>
                {analysisTask && (
                  <span className="rd-ai-provider-hint muted">
                    {analysisTask.provider} · {analysisTask.model}
                  </span>
                )}
              </div>
            )}

            {/* Failed state */}
            {analysisTask?.status === "FAILED" && (
              <div className="rd-ai-failed">
                <p className="rd-ai-error-msg">
                  {analysisTask.errorMessage || "分析任务失败，请重试"}
                </p>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => { setAnalysisTask(null); setAnalysisError(null); }}
                >
                  重试
                </button>
              </div>
            )}

            {/* Success state */}
            {analysisTask?.status === "SUCCESS" && (
              <div className="rd-ai-result-area">
                <div className="rd-ai-meta">
                  <span className="rd-ai-provider-badge">{analysisTask.provider}</span>
                  <span className="muted">·</span>
                  <span className="muted">{analysisTask.model}</span>
                  <span className="muted">·</span>
                  <span className="muted">{formatDate(analysisTask.updatedAt)}</span>
                  <button
                    type="button"
                    className="ghost-button rd-ai-regen-btn"
                    disabled={analysisLoading}
                    onClick={() => void handleGenerateAnalysis()}
                  >
                    重新生成
                  </button>
                </div>
                <div className="rd-ai-result">
                  <SimpleMarkdown text={analysisTask.resultText} />
                </div>
              </div>
            )}
          </div>
        )}
  ```

- [ ] **Step 7：手动验证端到端流程**

  1. 启动 Electron 开发模式：`cd apps/desktop-electron && npm run dev`
  2. 进入复习页面，选择任意题目
  3. 点击"AI 分析" Tab → 应看到空状态 + "生成 AI 分析"按钮
  4. **若未配置 AI**：点击按钮 → 应显示"请先在设置页面配置 AI 服务"提示
  5. **配置 AI 后**：点击按钮 → 应看到 spinner + "正在提交…" → 几秒后变为"AI 分析中…" → 出现分析结果文本
  6. 切换到其他 Tab 再切回"AI 分析" → 结果应保留（不重新触发）
  7. 切换到其他题目再切回 → 结果应保留（分析是全局的，不随题目变化）
  8. 点击"重新生成" → 清空结果并重新分析

- [ ] **Step 8：提交**

  ```bash
  git add renderer/src/pages/ReviewDetail.jsx
  git commit -m "feat: ReviewDetail 新增 AI 分析 Tab，支持触发、轮询、结果展示"
  ```

---

## 自检清单

### Spec 覆盖

| 需求 | 覆盖任务 |
|------|---------|
| 前端调用 POST /api/analysis/generate | Task 1 |
| 前端轮询 GET /api/analysis/{taskId} | Task 1 + Task 3B |
| "生成 AI 分析"触发按钮 | Task 3C Step 6 |
| 加载进度（PENDING/RUNNING 状态） | Task 3C Step 6 |
| 结果展示（Markdown 渲染） | Task 3C Step 6 |
| 失败/错误提示 | Task 3C Step 6 |
| AI 未配置时友好提示 | Task 3C Step 6 |
| 重新生成按钮 | Task 3C Step 6 |
| CSS 样式 | Task 2 |

### 无占位符扫描

- [x] 无 "TBD" / "TODO" / "similar to Task N"
- [x] 每个代码步骤都提供了完整代码块
- [x] 类型/函数名在各任务间一致（`analysisTask`, `analysisLoading`, `analysisError`, `analysisPollRef`, `handleGenerateAnalysis`, `scheduleAnalysisPoll`, `stopAnalysisPoll`, `rd-ai-*`）

### 类型一致性

- `api.generateAnalysis({})` → 返回 `{ task, reused }`，Task 3B 中解构 `const { task } = ...` ✓
- `api.getAnalysisTask(taskId)` → 返回 `AnalysisTask`，Task 3B 中直接 `setAnalysisTask(task)` ✓
- `analysisTask.status` 的字符串值与 Go `TaskStatus` 常量一致：`"PENDING"` / `"RUNNING"` / `"SUCCESS"` / `"FAILED"` ✓
- `SimpleMarkdown` 组件已在 ReviewDetail.jsx 中定义（第 40 行），无需 import ✓
- `formatDate` 已在 ReviewDetail.jsx 第 3 行 import ✓
