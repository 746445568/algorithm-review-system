# 上线验收清单

> 为避免混用，本清单拆分为 **Web legacy 原型** 与 **Desktop v1（Windows-first）** 两部分。执行前请先确认目标形态。

## A. Web legacy 原型（`frontend/` + `backend/`）

### 登录与同步

- Codeforces 应用已配置正式回调地址
- `CODEFORCES_OIDC_CLIENT_ID` / `CODEFORCES_OIDC_CLIENT_SECRET` 已写入 `.env`
- 登录成功后可以跳转到 `auth/syncing`
- 首次同步只导入非 AC 提交
- 再次同步不会生成重复题目和重复提交
- 全量重同步可以正常完成

### 运行与监控

- `GET /api/health` 返回 `200`
- `npm run ops:smoke` 通过
- PM2 已保存进程配置
- Nginx 已反向代理前端和健康检查
- HTTPS 已配置

### 数据与备份

- SQLite 文件目录已确认
- `npm run ops:backup` 可生成备份
- `bash ./scripts/restore-sqlite.sh <backup>` 可恢复备份
- `.env` 已备份到安全位置

### 体验回归

- 首页、题库、题目详情、复习页、统计页、周报页全部可访问
- 会话过期后会重新要求登录
- 同步失败时设置页能看到失败原因
- 未配置 LLM Key 时仍可生成模板复盘

## B. Desktop v1（Windows-first）

- 入口文档已统一为 `apps/desktop-electron/README.md`
- 使用 `docs/RELEASE_CHECKLIST_DESKTOP.md` 完成发布前核对
- 安装包可安装、可启动、可重启
- 客户端与本地服务在 `127.0.0.1` 连通正常
- 发布工件 hash/体积/签名状态已记录并复核
