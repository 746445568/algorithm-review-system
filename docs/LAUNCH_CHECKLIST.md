# 上线验收清单

## 登录与同步

- Codeforces 应用已配置正式回调地址
- `CODEFORCES_OIDC_CLIENT_ID` / `CODEFORCES_OIDC_CLIENT_SECRET` 已写入 `.env`
- 登录成功后可以跳转到 `auth/syncing`
- 首次同步只导入非 AC 提交
- 再次同步不会生成重复题目和重复提交
- 全量重同步可以正常完成

## 运行与监控

- `GET /api/health` 返回 `200`
- `npm run ops:smoke` 通过
- PM2 已保存进程配置
- Nginx 已反向代理前端和健康检查
- HTTPS 已配置

## 数据与备份

- SQLite 文件目录已确认
- `npm run ops:backup` 可生成备份
- `bash ./scripts/restore-sqlite.sh <backup>` 可恢复备份
- `.env` 已备份到安全位置

## 体验回归

- 首页、题库、题目详情、复习页、统计页、周报页全部可访问
- 会话过期后会重新要求登录
- 同步失败时设置页能看到失败原因
- 未配置 LLM Key 时仍可生成模板复盘
