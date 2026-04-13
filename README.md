# OJ Review Desktop

> 算法竞赛错题复盘工具 — Windows 桌面应用

一款面向算法竞赛选手的本地离线工具，帮助你系统地复盘错题、分析原因、安排复习，让每一道做过的题都真正变成提升。

---

## 这个软件能做什么

### 同步提交记录
从 Codeforces 自动拉取你的历史提交，不需要手动录入。后续计划支持 AtCoder 等更多 OJ。

### AI 分析错误原因
对每道错题调用 AI 接口，分析你的解法思路哪里出了问题、正确思路是什么、容易踩的坑在哪里。支持自定义 OpenAI 兼容接口（可接 DeepSeek、本地模型等）。

### 间隔重复复习计划
基于间隔重复算法（类似 Anki）自动安排复习时间。做对了推迟下次复习，做错了提前复习，让记忆效果最大化。

### 本地离线，数据自己掌控
所有数据存在本机 SQLite，不上传任何内容。AI 接口密钥加密存储。支持手动备份和恢复。

---

## 下载安装

前往 [Releases](../../releases) 页面，下载最新版 `OJReviewDesktop-{version}-win-x64.exe`，双击安装即可。

**系统要求：** Windows 10 / 11，x64

---

## 首次使用

1. 安装后打开应用，会出现初始配置向导
2. 填入 AI 接口的 API Key 和接口地址（支持 OpenAI / DeepSeek / 其他兼容接口）（如果没有api,可以随便输一下，ai功能不可用，其他功能可正常运行）
3. 在「账号管理」页绑定你的 Codeforces 账号
4. 点击「立即同步」拉取历史提交记录
5. 在「AI 分析」页选择题目，生成分析报告
6. 在「错题复习」页按计划复习

---

## 开发背景

这个项目从一个在线原型（Next.js + Express）演变而来。Web 版因为部署和数据隐私问题被废弃，重新设计为本地优先的桌面端：

- **Electron 37** 作为桌面壳，纯 ESM 模块
- **React 19 + Vite 7** 渲染层，无 TypeScript，轻量 JSX
- **Go 1.26** 编写本地服务 `ojreviewd`，负责数据库、任务队列、AI 调用
- **SQLite** 本地持久化，Go 直连，无 ORM
- **electron-updater** 支持应用内自动检测更新

整个运行链路完全离线，Go 服务以子进程方式嵌入 Electron，随应用启动和退出。

---

## 本地开发

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/algorithm-review-system.git
cd algorithm-review-system/apps/desktop-electron

# 安装依赖
npm install

# 启动开发模式（Electron + Vite + Go 服务）
npm run dev
```

需要本机安装 [Go 1.26+](https://go.dev/dl/) 和 Node.js 20+。

### 构建安装包

```bash
# 先编译 Go 服务
cd apps/server
go build -o ../desktop-electron/bin/ojreviewd.exe ./cmd/ojreviewd

# 生成 NSIS 安装包
cd ../desktop-electron
npm run dist
# 输出：dist/OJReviewDesktop-{version}-win-x64.exe
```

---

## 目录结构

```
algorithm-review-system/
├── apps/
│   ├── desktop-electron/   # Electron 桌面端（主线）
│   │   ├── main/           # 主进程（index.mjs, updater.mjs）
│   │   ├── preload/        # contextBridge
│   │   └── renderer/src/   # React UI
│   └── server/             # Go 本地服务（ojreviewd）
├── frontend/               # 历史遗留 Web 前端（仅参考）
└── backend/                # 历史遗留 Web 后端（仅参考）
```

---

## License

MIT
