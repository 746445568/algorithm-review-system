# OJ Review Desktop - Phase 5-9 Integration Plan

## 执行摘要

**目标**: 完成基础架构集成，使 Codeforces/AtCoder 同步、错题本聚合、AI 分析真正可用。

**前置条件**: Phase 1-4 已完成（适配器、AI Provider、存储方法）

**执行策略**: 并行执行 4 个集成任务，然后构建验证

---

## Phase 5: 连接队列到真实适配器

### 文件修改

#### 1. apps/server/internal/jobs/queue.go

添加适配器支持：
- 在 Queue 结构体中添加 adapters 字段
- 添加 SetAdapters 方法
- 确保 ResumePending 可以使用 adapters

#### 2. apps/server/cmd/ojreviewd/main.go

重新排序初始化：
- 当前：先创建 queue，再创建 server
- 新顺序：先创建 server（初始化 adapters），再注入到 queue

#### 3. apps/server/internal/api/server.go

添加 Adapters getter 方法

---

## Phase 6: 实现真实同步逻辑

### 文件修改

#### apps/server/internal/api/server.go

修改 handleSyncAccount：
- 将 placeholder Run 函数替换为真实同步逻辑
- 调用 s.runSyncTask(ctx, accountID, taskID, platform)

添加 runSyncTask 方法：
- 获取账号和适配器
- 分页拉取提交记录
- 对每个提交：获取题目元数据、保存题目、保存提交
- 更新账号游标
- 标记任务完成状态

---

## Phase 7: 实现错题本聚合

### 文件修改

#### apps/server/internal/storage/sqlite.go

添加索引（在 ensureSchema 中）：
- idx_submissions_verdict_submitted_at
- idx_submissions_problem_verdict  
- idx_problem_tags_tag_name_problem

添加 GetReviewSummary 方法

#### apps/server/internal/api/server.go

修改 handleReviewSummary 调用真实聚合

---

## Phase 8: 实现 Submissions/Problems API

### 文件修改

#### apps/server/internal/api/server.go

添加 handleSubmissions 和 handleProblems 处理函数
添加查询参数解析辅助函数

---

## Phase 9: 构建验证

运行 go build ./... 和测试

---

## 执行命令

```
/start-work ojreview-phase5-9
```
