# Judges 适配器内部分层 Design Spec — 2026-04-26（P3）

## 背景

`apps/server/internal/adapters/judges/codeforces.go`（546 行 / 28 顶层声明）和 `atcoder.go`（512 行 / 22 顶层声明）已超出项目规则中 800 行的合理上限并显著大于其他文件。每个适配器内部混合了：HTTP 客户端逻辑、wire types（与远端 JSON 对应的 struct）、解析/编码 helper、verdict / status mapper 与 Adapter interface 实现。

外部接口（`Adapter` interface in `adapter.go`）已经设计良好，本次只重构**适配器内部**。

## 目标

- 把 `codeforces.go` 与 `atcoder.go` 各自拆为 4 个职责清晰的文件
- 拆分后 Adapter interface 行为字节级一致，外部调用方零感知
- 全程 `go test ./...` 绿色

## 非目标

- 不修改 `Adapter` / `ContestAdapter` interface
- 不修改任何函数/方法签名
- 不动 `adapter.go`、`htmlmd.go`、`placeholders.go`、`codeforces_test.go` 的逻辑（test 可保留原状）
- 不引入新依赖
- 不动其他目录

## 与 codex 并行执行的边界

**Codex 正在并行执行** P0（拆 `apps/server/internal/api/server.go`）。本 spec 限定在 `apps/server/internal/adapters/judges/` 目录内，与 codex 的修改文件零交集，git commit 互不冲突。

---

## 设计：拆分结构

### Codeforces（546 → 4 个文件）

```
apps/server/internal/adapters/judges/
├── codeforces.go          # CodeforcesAdapter struct + 构造器 + Adapter interface 方法
├── codeforces_client.go   # HTTP client（getJSON / waitRateLimit / isRetryableError / fetchProblemStatement / containsProblemStatement）
├── codeforces_types.go    # wire types（codeforcesAPIEnvelope / User / Problem / SubmissionRaw / ProblemSetResult / Contest）
└── codeforces_mapper.go   # 解析/编码 + verdict/status 映射（parse*, format*, toCodeforcesSubmissionRaw, optionalInt, mapCodeforcesVerdict, normalizeContestStatus）
```

**`codeforces.go` 保留：**
- 顶部 const block（line 21）—— 含 baseURL 等基础常量
- `type CodeforcesAdapter struct`
- `NewCodeforcesAdapter()` 构造器
- 所有实现 `Adapter` interface 的方法：`FetchContests`、`ValidateAccount`、`FetchProfile`、`FetchSubmissions`、`FetchProblemMetadata`、`NormalizeSubmission`、`NextCursor`、`FetchStatement`

### AtCoder（512 → 4 个文件）

```
apps/server/internal/adapters/judges/
├── atcoder.go             # AtCoderAdapter struct + 构造器 + Adapter interface 方法 + var _ Adapter = (*AtCoderAdapter)(nil)
├── atcoder_client.go      # HTTP client（fetchSubmissionsRaw / loadProblems / setAtCoderHeaders / atCoderBody）
├── atcoder_types.go       # wire types（atCoderSubmission / atCoderProblem / atCoderContest）
└── atcoder_mapper.go      # parsers + mappers（parseAtCoderCursor / parseAtCoderProblemID / parseAtCoderSubmission / mapAtCoderVerdict / atCoderTaskURL / normalizeAtCoderContestStatus）
```

**`atcoder.go` 保留：**
- 顶部 const block（line 20）
- `var _ Adapter = (*AtCoderAdapter)(nil)` 类型断言
- `type AtCoderAdapter struct`
- `NewAtCoderAdapter()` 构造器
- 所有实现 `Adapter` interface 的方法

---

## 拆分原则

1. **纯搬运**：所有函数/方法签名、内部逻辑保持字节级一致（仅缩进/位置变化）
2. **同包**：所有新文件仍在 `package judges`，跨文件可直接相互调用
3. **import 按需**：每个新文件只 import 实际用到的包
4. **职责边界**：
   - `*_types.go`：仅 wire 数据结构 (struct)
   - `*_client.go`：所有访问外部网络的逻辑、限流、重试判定
   - `*_mapper.go`：纯函数（解析/编码 cursor、problem ID、verdict 映射等）
   - `*.go`（主文件）：Adapter interface 实现（编排上述三层）

---

## 验收标准

| # | 标准 | 验证方式 |
|---|---|---|
| 1 | 拆分后 `codeforces.go` ≤ 250 行 | `wc -l` |
| 2 | 拆分后 `atcoder.go` ≤ 250 行 | `wc -l` |
| 3 | 任何单个 `*_client.go / _types.go / _mapper.go` ≤ 250 行 | `wc -l` |
| 4 | `go test ./...` 全部 PASS | `go test ./...` |
| 5 | `go vet ./...` 无警告 | `go vet ./...` |
| 6 | `go build ./...` 成功 | `go build ./...` |
| 7 | `go.mod` 无变化 | `git diff` |
| 8 | `codeforces_test.go` 不修改 | `git status` |
| 9 | `adapter.go` 不修改 | `git status` |

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 跨文件未导出标识符引用错误 | 同包不存在可见性问题；编译会立即暴露 |
| const block 拆分导致未定义引用 | const block 整段保留在主文件 `codeforces.go` / `atcoder.go` 顶部 |
| `var _ Adapter = (*AtCoderAdapter)(nil)` 类型断言遗漏 | 明确要求保留在 `atcoder.go` |
| import 漏掉或多余 | 每搬一个文件后跑 `go vet`，通常会提示未使用 import |
| 与 codex 拆 server.go 撞 commit | 两者修改文件零交集（不同目录），commit 互不影响 |

---

## 执行说明

- **执行人**：Gemini CLI（通过用户 `/workflow` 触发）
- **分支**：当前分支直接做（同 codex）
- **commit 粒度**：按 plan 中每个 Task 一个 commit，中文格式
