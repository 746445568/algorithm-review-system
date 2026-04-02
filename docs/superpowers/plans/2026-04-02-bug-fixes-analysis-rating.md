# Bug 修复：AI 分析单题按钮 + SM-2 评分按钮样式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复单题分析按钮始终禁用的 Bug，以及 SM-2 评分按钮（忘了/困难/一般/简单）无 CSS 样式导致与整体 UI 风格冲突的问题。

**Architecture:** Bug A 是字段名不匹配：Go 后端返回 `id` 字段，前端 `ProblemSearchSelector` 却读 `problemId`，导致选中题目后 ID 始终为 `undefined`，按钮始终 disabled。Bug B 是 CSS 缺失：`rd-rate-btn*` 系列 class 在 JSX 中引用但 `styles.css` 中完全没有定义，按钮以浏览器默认样式渲染。两个 bug 独立，可顺序修复。

**Tech Stack:** React 19 (JSX, 无 TypeScript), Vite 7, CSS 变量主题系统（`--good/--warn/--bad/--accent`）

---

## 文件改动清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx` | 修改 | 将 `ProblemSearchSelector` 中 4 处 `problem.problemId` 改为 `problem.id` |
| `apps/desktop-electron/renderer/src/styles.css` | 修改 | 在 `.rd-status-key` 后插入 `rd-rate-btn*` + `rd-srs-hint` 样式 |

---

## Task 1：修复 ProblemSearchSelector 字段名（Bug A）

**根因：** `api.getProblems()` 返回 Go `Problem` 结构体，JSON 字段为 `"id"`（不是 `"problemId"`）。`ProblemSearchSelector` 用 `problem.problemId`（始终 `undefined`），导致：
- `onChange(undefined)` → `selectedProblemId` 保持 `null`
- 按钮 `disabled={problemLoading || !selectedProblemId}` → 始终 disabled

**Files:**
- Modify: `apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx:89,126-129`

- [ ] **Step 1: 验证字段名**

在终端运行（需要 ojreviewd 在 38473 端口运行）：
```bash
curl http://127.0.0.1:38473/api/problems | python3 -m json.tool | head -20
```
预期输出中每个对象有 `"id": 123`，**没有** `"problemId"` 字段。

- [ ] **Step 2: 修改 AnalysisPage.jsx 中 ProblemSearchSelector 的 4 处字段引用**

找到文件第 89 行和第 124-133 行，将所有 `problem.problemId` 改为 `problem.id`：

```jsx
// 第 89 行 — 查找当前选中项
const selectedProblem = problems.find((p) => p.id === value);

// 第 124-133 行 — 下拉列表渲染
filteredProblems.map((problem) => (
  <div
    key={problem.id}
    className={`an-dropdown-item${problem.id === value ? " an-dropdown-item--selected" : ""}`}
    onClick={() => {
      onChange(problem.id);
      setIsOpen(false);
      setSearchTerm("");
    }}
  >
```

完整改动（用 Edit 工具执行）：

**改动 1**（第 89 行）：
- old: `const selectedProblem = problems.find((p) => p.problemId === value);`
- new: `const selectedProblem = problems.find((p) => p.id === value);`

**改动 2**（第 126 行）：
- old: `key={problem.problemId}`
- new: `key={problem.id}`

**改动 3**（第 127 行）：
- old: `className={\`an-dropdown-item${problem.problemId === value ? " an-dropdown-item--selected" : ""}\`}`
- new: `className={\`an-dropdown-item${problem.id === value ? " an-dropdown-item--selected" : ""}\`}`

**改动 4**（第 129 行）：
- old: `onChange(problem.problemId);`
- new: `onChange(problem.id);`

- [ ] **Step 3: 在浏览器中验证**

访问 `http://localhost:5180`，点击侧边栏「AI 分析」，在「单题分析」面板：
1. 点击题目选择器，应显示题目列表（有题目数据的前提下）
2. 点击任意一题，选择器显示该题标题
3. 「生成分析」按钮变为可点击状态（不再灰色）

- [ ] **Step 4: 提交**

```bash
cd /home/r9000p746445568/.openclaw/workspace/algorithm-review-system
git add apps/desktop-electron/renderer/src/pages/AnalysisPage.jsx
git commit -m "fix(analysis): 修复 ProblemSearchSelector 使用 problem.id 而非 problem.problemId"
```

---

## Task 2：添加 SM-2 评分按钮 CSS 样式（Bug B）

**根因：** `ReviewDetail.jsx` 引用了以下 CSS class，但 `styles.css` 中完全没有定义：
- `.rd-rate-btns` — 容器
- `.rd-rate-btn` — 基础按钮
- `.rd-rate-btn--forgot` — 忘了（红色语义）
- `.rd-rate-btn--hard` — 困难（橙/警告色）
- `.rd-rate-btn--medium` — 一般（蓝色/accent）
- `.rd-rate-btn--easy` — 简单（绿色）
- `.rd-rate-key` — 快捷键角标
- `.rd-srs-hint` — 间隔/熟练度提示文字

样式要与 `.rd-status-btn`（状态按钮）保持一致的基础结构，用语义颜色区分难度。

**Files:**
- Modify: `apps/desktop-electron/renderer/src/styles.css:1572`（在 `.rd-status-key` 块之后插入）

- [ ] **Step 5: 在 styles.css 的 `.rd-status-key` 块后插入 rd-rate-btn 系列样式**

在第 1572 行（`.rd-status-key` 结束的 `}` 后）、第 1574 行 `/* Notes */` 注释前，插入以下内容：

```css
/* SM-2 Rate Buttons */
.rd-rate-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.rd-rate-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--panel-strong);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  color: var(--text);
}
.rd-rate-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.rd-rate-btn--forgot:hover:not(:disabled)  { border-color: var(--bad);    color: var(--bad);    background: var(--bad-soft);  }
.rd-rate-btn--hard:hover:not(:disabled)    { border-color: var(--warn);   color: var(--warn);   background: var(--warn-soft); }
.rd-rate-btn--medium:hover:not(:disabled)  { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.rd-rate-btn--easy:hover:not(:disabled)    { border-color: var(--good);   color: var(--good);   background: var(--good-soft); }
.rd-rate-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.6;
  flex-shrink: 0;
}
.rd-srs-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }

```

- [ ] **Step 6: 在浏览器中验证**

访问 `http://localhost:5180`，进入「错题复习」页，打开任意一道题的详情（ReviewDetail）：
1. 向下滚动到「间隔重复评分」区域
2. 四个按钮（忘了/困难/一般/简单）应有与状态按钮相同基础样式（圆角、边框、padding）
3. 鼠标悬停各按钮时分别显示红/橙/蓝/绿高亮
4. 按钮右上角有快捷键角标（Q/W/E/R）

- [ ] **Step 7: 提交**

```bash
cd /home/r9000p746445568/.openclaw/workspace/algorithm-review-system
git add apps/desktop-electron/renderer/src/styles.css
git commit -m "fix(styles): 添加 SM-2 评分按钮 rd-rate-btn 系列 CSS 样式"
```

---

## 备注：全局 AI 报告 400 错误

全局报告生成按钮返回 400 "provider and model are required" 是**正常服务器行为**——AI 设置（模型名称、API Key、API Base URL）未配置时 Go 服务拒绝请求。

解决方法：进入「设置」页面，填写 AI 相关配置（API Key / Model / Base URL）后重试。前端已正确展示错误信息，无需代码修复。

---

## 自检

1. **spec 覆盖**：Bug A（字段名）→ Task 1；Bug B（CSS 缺失）→ Task 2；Bug C（AI 未配置）→ 备注说明。全部覆盖。
2. **placeholder 扫描**：无 TBD/TODO，每步含完整代码或命令。
3. **类型一致性**：`problem.id` 在 Task 1 全部 4 处统一使用；CSS class 名与 JSX 中完全一致。
