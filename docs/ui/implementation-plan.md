# OJReview UI Redesign — Implementation Plan

> 本文档是前端 UI 审查结果，供 Codex 或开发者按顺序执行。  
> 约束：不改后端接口、不改业务逻辑、不改仪表盘近期比赛模块结构。

---

## 1. 原型页面结构提炼

HTML 原型共包含 **6 个一级视图** 和 **1 个全局 Shell**，结构如下：

### 1.1 全局 Shell

| 区域 | 说明 |
|------|------|
| `nav.nav` | 顶部导航栏，高度 54px，包含 Logo、6 个导航按钮、在线状态、同步按钮、主题切换按钮 |
| `div.shell` | 视图容器，position fixed，填满 nav 以下区域 |
| `div.toast` | 全局 Toast 提示，固定在右下角 |

### 1.2 仪表盘 (`#dashboard`)

```
page (max-width: 1060px)
├── hero (渐变英雄区，含今日任务数、进度条、统计数字)
├── panel 今日到期 (due-list)
├── grid2
│   ├── panel 评分目标 (goal-row × 2)
│   └── panel 近期比赛 ← 不改结构
└── panel 本周提交 (week-submit-grid → 两个 fixed-bar-chart)
```

### 1.3 错题复习 (`#review`)

```
review-shell (grid: 310px | 1fr, 全屏高度)
├── aside.review-list
│   ├── review-list-head (标题 + 统计)
│   ├── review-search (搜索框)
│   ├── review-cards (题目卡片列表，可滚动)
│   └── review-help (快捷键提示)
└── main.review-main
    ├── problem-head (题目标题 + 标签 + tabs)
    ├── review-body
    │   ├── tab: 复习状态 (status-strip + notes-grid + AI 辅助分析)
    │   ├── tab: 提交记录 (submission rows)
    │   └── tab: AI 分析 (ai-detail-grid)
    └── review-bottom (SM-2 评分条 + 保存按钮，fixed 底部)
```

### 1.4 AI 分析 (`#ai`)

```
page-wide (max-width: 1220px)
└── ai-layout (grid: 1.06fr | 0.94fr)
    ├── 左列
    │   ├── ai-hero (渐变英雄区 + 3 个分数卡片)
    │   ├── ai-report-card 本周诊断结论 (ai-list)
    │   └── ai-report-card 下周训练建议 (ai-detail-grid)
    └── 右列
        ├── ai-report-card 单题分析
        │   ├── problem-picker (自定义下拉选择器，非原生 select)
        │   ├── ai-problem-summary (摘要卡片)
        │   ├── ai-analysis-list (① ② ③ ④ 分析条目)
        │   └── ai-analysis-actions (按钮组)
        └── ai-report-card 推荐补题 (recommend-row 列表)
```

### 1.5 比赛日历 (`#contests`)

```
page
├── contest-toolbar (标题 + filter-tabs: 全部 / CF / AT)
├── contest-summary (grid3: 全部 / CF / AT 统计卡片)
└── contestGroups (按周分组的 panel，每组含 calendar-item 列表)
```

### 1.6 统计 (`#stats`)

```
page
├── grid4 (4 个 stat-card: 总提交 / AC率 / 复习完成率 / 连续天数)
├── switch-row (本周 / 本月 切换)
├── grid2 (总提交趋势 + AC 趋势，fixed-bar-chart 从底部向上)
└── grid2 (标签正确率 rate-track + 热力图 heatmap)
```

### 1.7 设置 (`#settings`)

```
page
└── settings-grid (grid: 1fr 1fr)
    ├── panel AI 服务 (form-group × 3 + 保存按钮)
    ├── panel 绑定平台账号 (form-group × 2 + 保存按钮)
    └── panel 运行时信息 (settings-wide, runtime-grid)
    注意：无外观切换卡片，主题切换仅在 nav 右上角
```

---

## 2. 需要修改的页面/组件

根据原型与 requirements 对比，以下是需要变更的清单：

### 2.1 必须修改

| 组件/页面 | 修改内容 | 原因 |
|-----------|---------|------|
| **全局主题系统** | 新增 CSS custom properties (dark/light)，替换所有 hardcoded 颜色 | 原型定义了完整的双主题 token 体系 |
| **导航栏** | 统一样式：logo-mark 渐变、nav-btn active 态、badge-dot 红点、右侧 sync-btn + icon-btn | 与原型对齐 |
| **主题切换** | 从设置页移除外观卡片，仅保留 nav 右上角 `#themeToggle` 按钮 | requirements 明确要求 |
| **AI 分析页 - 单题选择器** | 用 `.problem-picker` 自定义下拉替换原生 `<select>` | requirements 明确要求 |
| **统计页 - 柱状图** | 使用 `align-items: end` 的 grid + 百分比高度，确保从底部基线向上增长 | requirements 明确要求 |
| **比赛日历页** | 增加 `.filter-tabs` 三按钮筛选 (全部 / Codeforces / AtCoder) | requirements 明确要求 |
| **设置页** | 移除外观切换，改为 `settings-grid` 两列布局 + 运行时信息 `settings-wide` | requirements + 原型结构 |
| **Hero 区** | 仪表盘 + AI 分析页各一个渐变 hero 组件 | 全新视觉样式 |
| **Panel 组件** | 统一圆角、阴影、border、padding | 原型定义了标准 panel 样式 |
| **所有按钮** | 统一为 btn-primary / btn-ghost / btn-soft 三种 | 原型标准化了按钮体系 |

### 2.2 不需要修改

| 组件/页面 | 原因 |
|-----------|------|
| **仪表盘 - 近期比赛模块** | requirements 明确不改结构 |
| **后端 API 接口** | 不在范围内 |
| **业务逻辑** (SM-2 算法、同步逻辑、数据持久化) | 不在范围内 |
| **Electron 主进程** | 不在范围内 |
| **数据模型** (problems/contests/submissions 结构) | 不在范围内 |

---

## 3. 组件拆分建议

将单文件原型拆分为可维护的组件结构：

```
src/
├── styles/
│   ├── tokens.css          # CSS custom properties (见第 4 节)
│   ├── reset.css           # 全局 reset + scrollbar + body
│   ├── components/
│   │   ├── nav.css
│   │   ├── panel.css
│   │   ├── chip.css        # chip + tag
│   │   ├── buttons.css     # btn-primary / btn-ghost / btn-soft
│   │   ├── forms.css       # form-input / form-select / form-label
│   │   ├── toast.css
│   │   └── bar-chart.css   # fixed-bar-chart + bar-cell + tooltip
│   └── pages/
│       ├── dashboard.css   # hero + due-list + goal-row + contest-card
│       ├── review.css      # review-shell + review-card + rating + tabs
│       ├── ai.css          # ai-layout + ai-hero + problem-picker + analysis
│       ├── contests.css    # filter-tabs + calendar-item + summary-card
│       ├── stats.css       # stat-card + switch-btn + heatmap + tag-rate
│       └── settings.css    # settings-grid + runtime-grid
│
├── components/
│   ├── Nav.js              # 导航栏 (logo + nav-btns + sync + theme toggle)
│   ├── Panel.js            # 通用 panel 容器 (title + sub + slot)
│   ├── ProblemPicker.js    # 自定义下拉选择器 (AI 页 + 可复用)
│   ├── BarChart.js         # 柱状图组件 (从底部向上增长)
│   ├── Heatmap.js          # 热力图组件
│   ├── FilterTabs.js       # 通用筛选 tab 组件 (比赛日历用)
│   ├── ChipBadge.js        # platform chip + verdict chip
│   ├── RatingBar.js        # SM-2 评分条
│   ├── Toast.js            # 全局 toast
│   └── ThemeToggle.js      # 主题切换 (仅在 Nav 中使用)
│
├── pages/
│   ├── Dashboard.js
│   ├── Review.js
│   ├── AiAnalysis.js
│   ├── Contests.js
│   ├── Stats.js
│   └── Settings.js
│
└── utils/
    ├── theme.js            # applyTheme / getTheme / localStorage 管理
    └── dom.js              # $ / $all / showView / showToast 封装
```

### 关键拆分说明

**ProblemPicker 组件** — 核心交互组件，替代原生 select：
- 包含 picker-btn（触发器）、picker-menu（下拉面板）、problem-option（选项）
- 支持 click-outside 关闭、active 高亮、平台 chip + verdict chip 行内显示
- 在 AI 分析页使用，未来可扩展到复习页

**BarChart 组件** — 统一柱状图渲染：
- 接收 `values[]`、`type (total|ac)`、`labels[]`
- 内部使用 CSS grid + `align-items: end` 确保从底部向上生长
- 支持 hover tooltip
- 在仪表盘和统计页复用

**FilterTabs 组件** — 通用筛选器：
- 接收 `tabs[]`、`activeFilter`、`onChange` 回调
- 比赛日历使用 (全部/CF/AT)
- 统计页周/月切换也可复用

---

## 4. CSS Token / Theme Token 设计

### 4.1 颜色 Token

```css
:root {
  /* === 背景层级 === */
  --bg:             #f6f8fc;      /* 页面底色 */
  --surface:        #ffffff;      /* 卡片/面板背景 */
  --surface2:       #f0f4fb;      /* 次级面板、hover 态 */
  --surface3:       #e8eef8;      /* 进度条轨道等 */

  /* === 导航 === */
  --nav-bg:         #ffffff;
  --nav-border:     #e4eaf4;

  /* === 主色 === */
  --accent:         #2563eb;
  --accent-rgb:     37, 99, 235;  /* 用于 rgba() 透明度计算 */
  --accent-light:   #eff4ff;      /* 选中态背景、soft button */
  --accent-hover:   #1d4ed8;

  /* === 文本 === */
  --text:           #111827;      /* 主文本 */
  --text2:          #4b5563;      /* 次要文本 */
  --text3:          #9ca3af;      /* 辅助说明 */

  /* === 边框 === */
  --border:         #e4eaf4;      /* 主边框 */
  --border2:        #f0f4fb;      /* 轻边框 */

  /* === 语义色 === */
  --success:        #16a34a;
  --success-bg:     #f0fdf4;
  --success-border: #bbf7d0;
  --warn:           #d97706;
  --warn-bg:        #fffbeb;
  --error:          #dc2626;
  --error-bg:       #fef2f2;
  --error-border:   #fecaca;
  --due:            #dc2626;      /* 到期标记色，同 error */

  /* === 表单 === */
  --input-bg:       #ffffff;
  --input-border:   #d1d9ef;

  /* === 杂项 === */
  --pill-bg:        #f1f5f9;
  --shadow:         0 1px 3px rgba(37,99,235,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow-md:      0 10px 30px rgba(37,99,235,.10);
}

[data-theme="dark"] {
  --bg:             #0B1020;
  --surface:        #111827;
  --surface2:       #172033;
  --surface3:       #1E293B;
  --nav-bg:         #0F172A;
  --nav-border:     #1E293B;
  --accent:         #60A5FA;
  --accent-rgb:     96, 165, 250;
  --accent-light:   rgba(96,165,250,.14);
  --accent-hover:   #3B82F6;
  --text:           #E5E7EB;
  --text2:          #94A3B8;
  --text3:          #64748B;
  --border:         #243044;
  --border2:        #1E293B;
  --input-bg:       #0F172A;
  --input-border:   #334155;
  --success:        #22C55E;
  --success-bg:     rgba(34,197,94,.12);
  --success-border: rgba(34,197,94,.24);
  --warn:           #F59E0B;
  --warn-bg:        rgba(245,158,11,.12);
  --error:          #F87171;
  --error-bg:       rgba(248,113,113,.12);
  --error-border:   rgba(248,113,113,.24);
  --due:            #F87171;
  --pill-bg:        #1E293B;
  --shadow:         0 1px 3px rgba(0,0,0,.45);
  --shadow-md:      0 12px 30px rgba(0,0,0,.35);
}
```

### 4.2 布局 Token

```css
:root {
  --nav-h:    54px;
  --radius:   14px;           /* 大卡片圆角 */
  --radius-sm: 9px;           /* 按钮、输入框圆角 */
  --radius-xs: 6px;           /* chip 圆角 */
  --mono:     "SFMono-Regular", "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  --page-max: 1060px;         /* 标准页面最大宽度 */
  --page-wide: 1220px;        /* AI 页面最大宽度 */
}
```

### 4.3 平台专属 Token

```css
/* Codeforces 芯片 */
.chip-cf { background: #eef2ff; color: #4f46e5; }
[data-theme="dark"] .chip-cf { background: rgba(99,102,241,.18); color: #A5B4FC; }

/* AtCoder 芯片 */
.chip-at { background: #fff7ed; color: #c2410c; }
[data-theme="dark"] .chip-at { background: rgba(249,115,22,.16); color: #FDBA74; }
```

### 4.4 Hero 渐变 Token

```css
/* 浅色模式 hero */
.hero { background: linear-gradient(135deg, #1e40af 0%, #2563eb 58%, #3b82f6 100%); }

/* 深色模式 hero - 深夜蓝 */
[data-theme="dark"] .hero {
  background: linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #2563eb 100%);
  border: 1px solid rgba(96,165,250,.22);
}
```

### 4.5 热力图色阶

```css
/* dark (默认) */
.heat-cell { background: var(--surface3); }
.heat-1 { background: #1E3A8A; }
.heat-2 { background: #2563EB; }
.heat-3 { background: #3B82F6; }
.heat-4 { background: #93C5FD; }

/* light */
[data-theme="light"] .heat-cell { background: #e8eef8; }
[data-theme="light"] .heat-1 { background: #dbeafe; }
[data-theme="light"] .heat-2 { background: #93c5fd; }
[data-theme="light"] .heat-3 { background: #3b82f6; }
[data-theme="light"] .heat-4 { background: #1d4ed8; }
```

---

## 5. 不要改的部分（明确清单）

| 范围 | 具体项 |
|------|--------|
| 仪表盘近期比赛模块 | `#dashboardContestList` 的 HTML 结构和 `contest-card` 样式保持现有 |
| 后端 API | 所有 fetch / IPC 调用不变 |
| 业务逻辑 | SM-2 算法、间隔复习计算、同步流程、数据持久化 |
| Electron 主进程 | main.js / preload.js |
| 数据模型 | problems / contests / submissions 的字段定义不变 |
| 快捷键逻辑 | J/K 导航、1-5 评分、Ctrl+S 保存 |
| localStorage key | `ojreview-theme`、`ojreview-view`、`ojreview-selected` |

---

## 6. 执行顺序（给 Codex）

按优先级从高到低排列，每一步完成后可独立验证。

### Phase 1: 基础层（布局 + 主题）

**Step 1.1** — 创建 `tokens.css`  
把第 4 节的全部 CSS custom properties 写入 `src/styles/tokens.css`，在入口文件最先引入。

**Step 1.2** — 创建 `reset.css`  
从原型提取全局 reset：`box-sizing: border-box`，`html/body overflow:hidden`，字体栈 `Inter, -apple-system, ...`，scrollbar 样式。

**Step 1.3** — 导航栏 UI 对齐  
按原型实现 `nav.nav`：54px 高度、logo-mark 渐变圆角、nav-btn hover/active 态、badge-dot 红点、右侧 sync-btn + icon-btn + themeToggle。

**Step 1.4** — Shell + View 切换  
确保 `.shell` 填满 nav 以下，`.view` 默认 `display:none`，`.view.active` 显示，切换时加 `.fade` 动画。

### Phase 2: 通用组件

**Step 2.1** — Panel 组件样式  
统一所有 `.panel` 的 background、border、border-radius(14px)、box-shadow、padding(18px)。

**Step 2.2** — 按钮体系  
实现 `.btn-primary`（accent 色 + shadow）、`.btn-ghost`（border + 透明背景）、`.btn-soft`（accent-light 背景）。注意 dark/light 下 btn-primary 文字色差异。

**Step 2.3** — Chip + Tag  
实现 `.chip`（通用）、`.chip-cf`、`.chip-at`、`.chip-green`、`.chip-red`、`.chip-warn`、`.tag`。

**Step 2.4** — 表单控件  
`.form-input`、`.form-select`、`.form-label`，统一 border-radius(9px)、focus 态 border-color。

**Step 2.5** — Toast 组件  
`.toast` 固定右下角，`box-shadow-md`，fade 动画。

### Phase 3: 页面级修改

**Step 3.1** — 仪表盘  
- Hero 区渐变 + 装饰圆 (::before, ::after) + 白色 CTA 按钮
- 今日到期 panel + due-row
- 评分目标 goal-row（CF/AT 独立色）
- 本周提交 week-submit-grid（两个 BarChart）
- **不改** 近期比赛模块结构

**Step 3.2** — 错题复习  
- review-shell 左右分栏 (310px | 1fr)
- review-card 列表（active 态 accent-light、due 态左红线）
- tabs 组件（底部 2px accent 下划线）
- review-bottom 固定底栏（毛玻璃背景 + rating-btns）
- notes-grid 2×2 textarea 布局

**Step 3.3** — AI 分析  
- ai-layout 双列网格 (1.06fr | 0.94fr)
- ai-hero 渐变英雄区 + ai-score-grid
- **ProblemPicker 自定义选择器**（最关键组件）：
  - `.problem-picker-btn` 作为触发器
  - `.problem-picker-menu` 绝对定位下拉面板
  - `.problem-option` 选项行 (chip + name + verdict)
  - click-outside 关闭
  - `.open` class 控制展开
- ai-problem-summary 摘要卡片 (渐变边框背景)
- ai-analysis-list (① ② ③ ④ 分析条目)

**Step 3.4** — 比赛日历  
- contest-toolbar 标题 + filter-tabs
- filter-tabs 三按钮：全部 / Codeforces / AtCoder
- contest-summary 三列统计卡片
- 按周分组 panel + calendar-item
- `.hidden` class 控制筛选隐藏

**Step 3.5** — 统计  
- grid4 四个 stat-card
- switch-row 本周/本月切换
- **BarChart 确保从底部向上增长** (`align-items: end` + 百分比 height)
- 标签正确率 rate-track + rate-fill
- 热力图 13 列 grid + 4 级色阶

**Step 3.6** — 设置  
- settings-grid 两列
- 移除外观切换卡片
- AI 服务 + 绑定账号 两个 panel
- 运行时信息 settings-wide (grid-column: 1/-1)
- runtime-grid 2×2

### Phase 4: 验证

**Step 4.1** — 主题切换  
验证 nav 右上角按钮在 dark/light 间正确切换，所有页面配色一致。

**Step 4.2** — 响应式  
检查 `@media (max-width: 960px)` 和 `@media (max-width: 1050px)` 断点下的布局降级。

**Step 4.3** — 交互完整性  
- ProblemPicker 展开/收起/选中正常
- BarChart tooltip 正常显示
- 比赛日历筛选正确过滤
- 快捷键不受影响
- Toast 显示正常

---

## 7. 注意事项

1. **btn-primary 文字色**：dark 模式下是 `#08111f`（深色），light 模式下是 `#fff`（白色），需要用 `[data-theme="light"] .btn-primary { color: #fff }` 覆盖。
2. **review-bottom 毛玻璃**：使用 `backdrop-filter: blur(10px)` + 半透明背景，dark 和 light 背景色不同。
3. **fixed-bar-chart**：核心 CSS 是 `display: grid; align-items: end;`，bar-rect 用百分比 height + `border-radius: 5px 5px 0 0`。
4. **ProblemPicker 的 z-index**：下拉面板 z-index 需 ≥ 40，避免被其他 panel 遮挡。
5. **热力图 aspect-ratio**：`.heat-cell` 使用 `aspect-ratio: 1/1` 保持正方形。
6. **settings 页无外观卡片**：原型中设置页的 panel-sub 明确写了"主题切换已统一放在右上角"，不要再添加 theme-row。
