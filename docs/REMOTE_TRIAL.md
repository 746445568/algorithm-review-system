# 不上线的小范围异地试用

这份说明用于“你的电脑本地运行服务 + Cloudflare Tunnel 暴露前端地址 + 少量朋友异地访问”。

## 目标架构

- 前端运行在 `127.0.0.1:3000`
- 后端运行在 `127.0.0.1:3001`
- 只对外暴露前端地址
- 前端继续代理 `/api` 到本地后端
- 所有人通过各自 Codeforces 账号登录，数据按用户隔离

## 前置条件

- 你的电脑需要保持开机
- 已安装 Node.js、npm、PM2
- 已安装 `cloudflared`
- `.env` 已配置好：
  - `BACKEND_ORIGIN=http://127.0.0.1:3001`
  - `CODEFORCES_OIDC_CLIENT_ID`
  - `CODEFORCES_OIDC_CLIENT_SECRET`

## 推荐做法：固定 HTTPS 地址

推荐使用 **Cloudflare Named Tunnel**，这样外部地址稳定，不需要频繁改 Codeforces 回调地址。

### 1. 准生产方式启动本机服务

```bash
npm run serve:friends
```

这会自动执行：

- 清理 `3000` / `3001` 端口
- 构建前后端
- 用 PM2 托管前后端

日志默认写到：

- `logs/frontend.out.log`
- `logs/frontend.error.log`
- `logs/backend.out.log`
- `logs/backend.error.log`

### 2. 配置 Cloudflare Tunnel

先登录 Cloudflare：

```bash
cloudflared tunnel login
```

创建 named tunnel：

```bash
cloudflared tunnel create algorithm-review-system
```

参考 `deploy/cloudflared-config.example.yml` 创建你自己的配置文件，例如：

```yaml
tunnel: your-tunnel-id
credentials-file: /home/your-user/.cloudflared/your-tunnel-id.json

ingress:
  - hostname: review.your-domain.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

启动 tunnel：

```bash
cloudflared tunnel run algorithm-review-system
```

### 3. 更新登录回调地址

把 `.env` 里的回调地址改成外部 HTTPS 地址：

```env
CODEFORCES_OIDC_REDIRECT_URI=https://review.your-domain.com/api/auth/codeforces/callback
```

同时在 Codeforces OAuth 应用后台把回调地址改成同一个值。

改完后重启本机服务：

```bash
npm run pm2:stop
npm run pm2:start
```

## 临时做法：随机 trycloudflare 地址

如果你只是临时演示，也可以直接运行：

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

注意：

- 地址会变化
- 每次地址变化后都要同时更新：
  - `.env` 里的 `CODEFORCES_OIDC_REDIRECT_URI`
  - Codeforces 应用后台回调地址

## 验收顺序

1. 打开本机 `http://127.0.0.1:3000`
2. 打开外部 HTTPS 地址，确认首页可访问
3. 使用外部 HTTPS 地址发起 Codeforces 登录
4. 登录后回到外部地址的 `/auth/syncing`
5. 进入题库，确认只看到自己的数据
6. 让一位朋友重复上述流程，确认双方数据互不可见
7. 朋友生成一次复盘并进入复习页

## 常用命令

```bash
npm run ports:clean
npm run serve:friends
npm run pm2:start
npm run pm2:stop
npm run ops:smoke
npm run ops:backup
pm2 logs
pm2 status
```

## 限制

- 你的电脑休眠、断网、重启时，朋友访问会中断
- SQLite 只适合少量朋友低频使用
- 不建议作为 24/7 长期稳定托管方案
