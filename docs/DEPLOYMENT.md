# 部署说明

当前版本面向少量朋友公开访问，推荐单机部署：

- 一台低配 Linux VPS
- 一个 Next.js 前端进程
- 一个 Express 后端进程
- SQLite 数据库
- Nginx 反向代理

## 建议环境

- Ubuntu 22.04+
- Node.js 20+
- npm 10+
- Nginx

## 首次部署

### 1. 拉取代码并安装依赖

```bash
git clone <your-repo-url>
cd algorithm-review-system
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少填写：

```env
PORT=3001
DATABASE_URL="file:./dev.db"
BACKEND_ORIGIN=http://127.0.0.1:3001
CODEFORCES_OIDC_CLIENT_ID=
CODEFORCES_OIDC_CLIENT_SECRET=
CODEFORCES_OIDC_REDIRECT_URI=https://your-domain.com/api/auth/codeforces/callback
LLM_API_KEY=
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

说明：

- `CODEFORCES_OIDC_REDIRECT_URI` 必须和 Codeforces 应用后台配置一致。
- 公开部署时建议将回调地址配置成你的正式域名。
- 如果没有模型 Key，系统仍可正常使用模板复盘。

### 3. 初始化数据库

```bash
npm run db:generate
npm run db:migrate
```

### 4. 构建项目

```bash
npm run build
```

## 启动方式

### 直接启动

```bash
npm run start:backend
npm run start:frontend
```

### 使用 PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## Nginx 示例

参考 `deploy/nginx.conf`

## 备份建议

重点备份：

- `prisma/dev.db`
- `.env`

建议至少每天执行一次：

```bash
npm run ops:backup
```

恢复时：

```bash
bash ./scripts/restore-sqlite.sh /path/to/backup.db
```

## 上线后检查

```bash
npm run ops:smoke
```

验收清单见 `docs/LAUNCH_CHECKLIST.md`

## 当前限制

- 只支持 Codeforces 登录
- 只同步非 AC 提交
- 不同步源码
- 不抓取完整题面页面内容
