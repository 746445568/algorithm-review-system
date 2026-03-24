# OJ 复盘系统桌面端本地服务

本目录包含 Windows 桌面版重构所用的 Go 本地服务。

## 当前范围

- 仅限本地的 HTTP 服务，监听 `127.0.0.1`
- 基于 SQLite 存储用户档案、平台账号、题目、提交记录、同步任务、复习快照、分析任务和应用设置
- 数据库迁移前自动备份
- 持久化的进程内任务队列框架，支持重启恢复
- 加密的本地 AI 设置存储
- 面向桌面端的 REST 接口：健康检查、账号管理、同步任务创建、AI 设置、诊断导出、分析任务创建

## 下一步实现计划

1. 真实 Codeforces 适配器
2. 真实 AtCoder 适配器
3. 从适配器写入标准化的题目/提交数据
4. 按题目聚合复习记录
5. 将 `ojreviewd.exe` 打包集成到 Electron 应用中


## 构建与版本注入

请使用以下脚本构建 `ojreviewd`，它会通过 `-ldflags` 注入版本号与 commit：

```bash
./apps/server/scripts/build-service.sh
```

Windows PowerShell：

```powershell
pwsh ./apps/server/scripts/build-service.ps1
```

也可通过环境变量/参数覆盖：

- `VERSION` / `-Version`
- `COMMIT` / `-Commit`

构建后可用 `apps/server/bin/ojreviewd(.exe) --version-json` 验证注入结果。

