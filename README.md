# 算法错题复盘系统

面向算法竞赛爱好者的错题复盘工具。支持从 Codeforces 自动同步非 AC 提交，AI 分析错误原因，并通过间隔重复算法安排复习计划。

## 快速上手（3 步）

```bash
git clone <本仓库地址>
npm install
npm run dev
```

打开 http://localhost:3000，点击**「演示体验（无需登录）」**即可开始。

无需注册，无需 API Key，首次启动自动初始化数据库并写入演示数据。

---

## 两条产品线

| | Web 版 | 桌面版 |
|---|---|---|
| **适合** | 多人共享、服务器部署 | 单机离线、Windows 本地使用 |
| **技术栈** | Next.js + Express + SQLite | Electron + React + Go 服务 |
| **入口** | 本文档（推荐新手从这里开始） | `apps/desktop-electron/` |

---

## Web 版功能

- 自动同步 Codeforces 非 AC 提交（绑定账号后）
- AI 分析错误原因与改进建议
- 间隔重复复习计划（今日待复习列表）
- 题目多维筛选：来源、标签、错因、复习状态
- 周报生成与分享

---

## 环境变量

复制 `.env.example` 为 `.env`，开箱即用无需修改。如需完整功能，可按需填写：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3001` | 后端端口 |
| `DATABASE_URL` | `file:./dev.db` | SQLite 路径 |
| `BACKEND_ORIGIN` | `http://127.0.0.1:3001` | 前端代理目标 |
| `CODEFORCES_OIDC_CLIENT_ID` | 空 | 绑定 Codeforces 账号需填写 |
| `CODEFORCES_OIDC_CLIENT_SECRET` | 空 | 同上 |
| `LLM_API_KEY` | 空 | AI 分析功能需填写 |
| `LLM_API_BASE` | OpenAI | 可替换为兼容接口 |
| `DEMO_MODE` | 开启 | 设为 `false` 可在生产环境关闭演示入口 |

---

## 常用命令

```bash
npm run dev           # 启动前端(3000) + 后端(3001)
npm run db:migrate    # 手动执行数据库迁移
npm run db:seed       # 手动写入演示数据
npm run db:studio     # 打开数据库可视化
npm run build         # 构建前后端
npm run pm2:start     # 生产环境 PM2 启动
```

---

## Codeforces 账号绑定（可选）

1. 在 [Codeforces OAuth 应用管理](https://codeforces.com/settings/oauth) 注册应用
2. 填写 `CODEFORCES_OIDC_CLIENT_ID` 和 `CODEFORCES_OIDC_CLIENT_SECRET`
3. 回调地址设为 `http://127.0.0.1:3000/api/auth/codeforces/callback`
4. 登录后前往「设置 → 同步状态」触发首次导入

---

## 桌面版

见 `apps/desktop-electron/README.md` 和 `QUICKSTART.md`。

---

## 部署到服务器

见 `docs/DEPLOYMENT.md`。生产环境建议：
- 配置 nginx 反代
- 使用 PM2 管理进程（`npm run pm2:start`）
- 设置 `DEMO_MODE=false` 关闭演示入口
