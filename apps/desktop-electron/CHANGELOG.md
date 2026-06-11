# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [2.0.0](https://github.com/746445568/algorithm-review-system/compare/v1.0.0...v2.0.0) (2026-06-11)


### ⚠ BREAKING CHANGES

* Database schema updated to v4, requires migration for
statement, editorial, and chat message tables

### Features

* /health 响应增加 firstRun 字段，用于触发首次启动引导 ([2f30571](https://github.com/746445568/algorithm-review-system/commit/2f30571e7ec0e8feb9b0c953c3f7b2c799618ca6))
* 创建独立 AI 分析页（左右分栏布局） ([203dc26](https://github.com/746445568/algorithm-review-system/commit/203dc26d35d7e4ecf42ad5543a99e3c53d50e0b1))
* 集成 electron-updater，实现应用内静默检查和手动更新 ([85b72f5](https://github.com/746445568/algorithm-review-system/commit/85b72f56cab10242947c1dec7b498a1ed8b72fab))
* 添加 electron-updater 依赖和 GitHub publish 配置 ([27c20f2](https://github.com/746445568/algorithm-review-system/commit/27c20f23f3f39885e67b953a3c8e4538aaf946da))
* 添加全局导航系统 NavigationContext ([72157e0](https://github.com/746445568/algorithm-review-system/commit/72157e0e421b27d41a67f1af883d7f95d0f507ea))
* 添加手动数据备份/恢复 API 端点（Go） ([7454093](https://github.com/746445568/algorithm-review-system/commit/7454093801f825605cbb959343c9912d66475882))
* 添加首次启动引导页（4步），由 /health firstRun 字段触发 ([cc7a129](https://github.com/746445568/algorithm-review-system/commit/cc7a1298f53b0784919eaab5e6adf6658fcf32c4))
* 新增 analysis 相关 API 方法 ([1b0ca9d](https://github.com/746445568/algorithm-review-system/commit/1b0ca9d8f135aaeecec293149d20b11ee0e21386))
* 仪表盘 midnight-blue 重设计 + 近期提交图表 ([13b41af](https://github.com/746445568/algorithm-review-system/commit/13b41afc6f912dcc38d1fc2874f119542d832322))
* ability radar chart with knowledge mastery ([6e48486](https://github.com/746445568/algorithm-review-system/commit/6e484867ddc5ca13104d97a6b765923481aa930a))
* adapter 接口加 FetchProfile，实现 CF/AtCoder 评分抓取 ([d9f6227](https://github.com/746445568/algorithm-review-system/commit/d9f622772c942817c928033ebf98f267f705145c))
* adaptive SM-2 with quality history tracking ([0f21279](https://github.com/746445568/algorithm-review-system/commit/0f212792854d3892c89a058dbd51180ebcd578fa))
* add knowledge graph storage ([0d32769](https://github.com/746445568/algorithm-review-system/commit/0d327693901101981179e32c8da14302337d50bf))
* add v0.2 dashboard with AtCoder support, contests, stats, and chat ([7152d55](https://github.com/746445568/algorithm-review-system/commit/7152d552e78f774d8f4d4e4b61accce87038b0e3))
* add verdict distribution statistics ([7645d46](https://github.com/746445568/algorithm-review-system/commit/7645d467644cc69a09368ab102848dbf72e653ab))
* AI 分析改为 Markdown 输出，渲染器支持代码块/有序列表/h3/分割线 ([122d71c](https://github.com/746445568/algorithm-review-system/commit/122d71cb663fb9bde52bad9dc6d3e89889816487))
* AI 分析后端实现完成 ([78a82b9](https://github.com/746445568/algorithm-review-system/commit/78a82b9f186f2a9e63512842ea591e615182f16d))
* api.js 新增 contests/goals/statistics/refreshRating 方法 ([0ee12d8](https://github.com/746445568/algorithm-review-system/commit/0ee12d8772f7fb5fc4eec4cb2fad4ac95a73ee96))
* **api:** 补充 generateComparisonAnalysis / generateProblemAnalysis / getLatestAnalysis ([0566e37](https://github.com/746445568/algorithm-review-system/commit/0566e375f79957198bd2f495a0421e9d5774c7ab))
* complete 6-task development plan ([45b7729](https://github.com/746445568/algorithm-review-system/commit/45b7729c64ed4d1243031b228f15c99e73fbe020))
* cross-platform build support for mac/linux ([57f73a5](https://github.com/746445568/algorithm-review-system/commit/57f73a52a09cd726c423a03445b04a3be565c38c))
* Dashboard 添加 AI 分析卡片 ([dfae238](https://github.com/746445568/algorithm-review-system/commit/dfae2385e889ee64127c32804ccdf907fcf7d1c6))
* fetch analysis problem artifacts on demand ([71d096a](https://github.com/746445568/algorithm-review-system/commit/71d096acb14ea71f023be8f3842e964de68b8ae2))
* fetch Codeforces sources with account authorization ([cf4037f](https://github.com/746445568/algorithm-review-system/commit/cf4037f7b055cc4fa75104ef1ccf203c0132d10d))
* **nav:** 新增 NavigationContext，App.jsx 接入导航 + analysis 页面入口 ([d3e3a1a](https://github.com/746445568/algorithm-review-system/commit/d3e3a1a202d2b2cb0a121484fdd4a75a48b267b3))
* parse analysis metadata ([5cd6b3b](https://github.com/746445568/algorithm-review-system/commit/5cd6b3badb7078277d87af1e7f3b78d1c26aec46))
* persist analysis error patterns ([a781414](https://github.com/746445568/algorithm-review-system/commit/a7814147b21728a49c9366a673bd13d512b8d4e2))
* Problem Chat 对话功能基础架构 ([637647a](https://github.com/746445568/algorithm-review-system/commit/637647a4f040ab67135daa80e3efa1bbd847566b))
* rating curve chart with history storage and adapter fetch ([1bc8bcc](https://github.com/746445568/algorithm-review-system/commit/1bc8bccd536f5062e877eafd1db5e3cb5a635226))
* request error pattern metadata from analysis ([e71cc18](https://github.com/746445568/algorithm-review-system/commit/e71cc18da91a39d03ecc2d32d8d44f80aca4c8ae))
* ReviewDetail 添加跳转到分析页按钮 ([e01db8a](https://github.com/746445568/algorithm-review-system/commit/e01db8a34f616fbc92a56792d6aee7189cfc0bab))
* schema v3，platform_accounts 加评分字段，新增 goals 表 ([593b71e](https://github.com/746445568/algorithm-review-system/commit/593b71e83d20a179764e6694324b86d03d577a4c))
* schema v3，platform_accounts 加评分字段，新增 goals 表 ([3bd898f](https://github.com/746445568/algorithm-review-system/commit/3bd898f75100f67bb049fb07372b52fe5a4b4cd5))
* server.go 新增 refresh-rating/goals/statistics 路由和 handler ([4a0855d](https://github.com/746445568/algorithm-review-system/commit/4a0855d984c9d2886bd8512e193692cc9333dc3e))
* sqlite 新增 UpdateAccountRating/统计聚合查询方法 ([168e456](https://github.com/746445568/algorithm-review-system/commit/168e4567290f3334ffcdb65417d56f72acb37756))
* surface knowledge graph in statistics ([8b9b592](https://github.com/746445568/algorithm-review-system/commit/8b9b592c073c4ff59068b930a4d932a733db6f89))
* **ui:** Dashboard AI 卡片 + ReviewDetail 跳转按钮 ([9ac160b](https://github.com/746445568/algorithm-review-system/commit/9ac160b658d8419243cffda284158d82371f04b6))
* v0.2 评分/目标/比赛日历/统计可视化页面 ([7ece546](https://github.com/746445568/algorithm-review-system/commit/7ece546b45aa540fda8853fac0ac2d91241a1731))


### Bug Fixes

* 分析轮询终态重置 problemSubmitRef，修复重复点击无响应 ([c8f240f](https://github.com/746445568/algorithm-review-system/commit/c8f240f6632aee5f570bdea5019972c348b9e249))
* 统一 AnalysisPage CSS 类名前缀为 an-* ([1ca8e60](https://github.com/746445568/algorithm-review-system/commit/1ca8e608d8c203e62ded8e30aedc7e15a7f6e550))
* 修复 NavigationContext 和 AnalysisPage 文件损坏问题 ([49ecfdd](https://github.com/746445568/algorithm-review-system/commit/49ecfddf856201a61edfe7fd289ec8450b8de199))
* 修复代码审查发现的 7 个问题 ([fa29a1e](https://github.com/746445568/algorithm-review-system/commit/fa29a1e75d1b52e38f6067ffd7abec5fe1af75d7))
* 移除 onNavigate prop ([60bd87c](https://github.com/746445568/algorithm-review-system/commit/60bd87c9af2db6249ff529acb724b8db11fd7b63))
* 引导页传参修正，补充 provider 字段和 baseUrl 字段名 ([fb8cd75](https://github.com/746445568/algorithm-review-system/commit/fb8cd75fc8832d78d76aeb8c61ff3875464ed470))
* add explicit Chinese prompt instruction ([2dc8df4](https://github.com/746445568/algorithm-review-system/commit/2dc8df4dcd13b071af84197af5ed5a3950b2cc3e))
* add table name whitelist to prevent SQL injection ([67f20f4](https://github.com/746445568/algorithm-review-system/commit/67f20f4c251b4d34ec9dfda1ce68f13684d09cf0))
* AI 分析改为中文输出，system prompt 改为中文指令 ([a46d3ed](https://github.com/746445568/algorithm-review-system/commit/a46d3ed458a03921a165c9690a979ee8431b17ee))
* AI 接口超时从 60s 延长到 300s，兼容 DeepSeek reasoner 慢响应 ([f7a6952](https://github.com/746445568/algorithm-review-system/commit/f7a6952d8e2b9da12848380c912dee53b0ff555f))
* align analysis metadata parser contract ([3f19596](https://github.com/746445568/algorithm-review-system/commit/3f19596373692e1a6ff9879a28851be707218c01))
* before-quit 改为 await stop，防止僵尸进程 ([3ac62f4](https://github.com/746445568/algorithm-review-system/commit/3ac62f4adefdd5c0e12da07ea52ed1516153e85e))
* **dashboard:** 修复 DashboardPage 函数签名语法错误 ([b1d2dd9](https://github.com/746445568/algorithm-review-system/commit/b1d2dd9b8d2f9cc80c612ed3831f24484e7499a0))
* decode Codeforces authorized source payloads ([31e7ff8](https://github.com/746445568/algorithm-review-system/commit/31e7ff8ce4d00d307177461646869f5712fbba5b))
* electron-updater 改用默认导入，兼容 CommonJS 模块 ([a8265c2](https://github.com/746445568/algorithm-review-system/commit/a8265c217b6322d2c7b1092be2650ae52d404454))
* Enqueue goroutine 加 ctx 取消感知，防止泄漏和 inflight 表污染 ([2b235cf](https://github.com/746445568/algorithm-review-system/commit/2b235cf4d11ac0a016c769e76cc5e6b1c47ea58d))
* ensureStarted 添加并发锁，防止多进程启动 ([18ed690](https://github.com/746445568/algorithm-review-system/commit/18ed690777c8a07605897226a9f7e7465d924627))
* findReusableAnalysisTask 加状态白名单，FAILED 任务不再阻止重试 ([437034c](https://github.com/746445568/algorithm-review-system/commit/437034c61a73559e66eae9c626881bbc9d9e995f))
* harden analysis metadata prompt contract ([9ebd144](https://github.com/746445568/algorithm-review-system/commit/9ebd144853d580ca3c7e3c7c4c3d323219ab781d))
* harden error pattern storage ([945b4eb](https://github.com/746445568/algorithm-review-system/commit/945b4eb61aa24cf36e33f6dad2d7e6b57df99fa1))
* merge task3-sql-injection — SQL注入防护白名单 ([c108d76](https://github.com/746445568/algorithm-review-system/commit/c108d7609c3638dc56f437f9ad84cf0116da014f))
* merge worktree-agent-a25e21cc — AI prompt明确要求Markdown输出 ([01b5247](https://github.com/746445568/algorithm-review-system/commit/01b52478a4b16ab00246a8e9d2fa0a9dbeaa89ab))
* normalize DeepSeek OpenAI base URL ([b2a9c6c](https://github.com/746445568/algorithm-review-system/commit/b2a9c6c59dcd09dcf38242bc07b0b64d12b042ca))
* preserve error pattern insert semantics ([3448701](https://github.com/746445568/algorithm-review-system/commit/34487015b17fc3e52e9722a9ea199d02131400fb))
* preserve patterns when analysis metadata is absent ([638474e](https://github.com/746445568/algorithm-review-system/commit/638474e878aa74b3522de1f58af8ea59ebde153f))
* replace problem error patterns atomically ([cd8a78e](https://github.com/746445568/algorithm-review-system/commit/cd8a78ed50cf9e883c7d022dd093cd523c0067d3))
* require final analysis metadata block ([0aa39bb](https://github.com/746445568/algorithm-review-system/commit/0aa39bbf02d3c9795a681030ce6992772d63e406))
* restore app control styling ([b914b6c](https://github.com/746445568/algorithm-review-system/commit/b914b6c33baec6879f0eea684c80cca594f4daa9))
* spawn 后注册 error 监听器，防止 ENOENT 变成未处理异常 ([618a605](https://github.com/746445568/algorithm-review-system/commit/618a60564761bd1b32f66fe2d86277473d8ce8a4))
* stabilize statistics and contest views ([432d391](https://github.com/746445568/algorithm-review-system/commit/432d3910c0bb060c4b16dce8805233188dc9fd0f))
* use SQLite online backup for data backup and restore ([69ebc55](https://github.com/746445568/algorithm-review-system/commit/69ebc55c98857dada624cab4b02c17916acab92d))
* validate CORS origins and log enqueue failures ([e09182f](https://github.com/746445568/algorithm-review-system/commit/e09182fc88715deda4ad3b09a62b2a0c7602f1e3))
