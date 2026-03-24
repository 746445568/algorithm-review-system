# OJ 复盘系统 Electron 桌面端

## 当前范围

- Electron 主进程，含本地服务生命周期管理
- Preload 桥接层，提供运行时状态与服务重启能力
- React 渲染层，包含 `Dashboard`、`Accounts` 和 `Review` 页面
- 通过 `http://127.0.0.1:38473` 进行真实 API 读取
- `Review` 状态保存依赖 `ojreviewd` 服务，来源仅支持显式环境变量、Electron 资源目录 / `apps/server/bin`，或开发态 `go run` 回退

## 开发

前置条件：

- Node.js 20+
- 优先准备 `OJREVIEW_SERVICE_PATH` 指向的 `ojreviewd`，或 `apps/server/bin/ojreviewd(.exe)`；若未提供二进制，则安装 Go 供开发态回退到 `go run ./cmd/ojreviewd`

命令：

```bash
cd apps/desktop-electron
npm install
npm run dev
```

如果仓库运行在 `\\wsl.localhost\...` 或映射的网络驱动器上，且 Vite 文件监听失败，请改用静态路径方式：

```bash
cd apps/desktop-electron
npm run start:static
```

`start:static` 现在会在打开真正窗口之前运行 Electron 引导探测。
如果 Electron 在当前机器上无法解析自身的主进程 API，该命令会提前失败并输出详细的诊断信息，而不是稍后崩溃并报 `app is undefined` 错误。

在 Windows `cmd.exe` 下，也可以使用包装脚本：

```cmd
apps\desktop-electron\run-static.cmd
```

`run-static.cmd` 是推荐的 Windows 启动入口。它会用 `pushd` 映射 UNC 路径，优先复用 `OJREVIEW_SERVICE_PATH` 或 `apps/server/bin/ojreviewd.exe`，然后运行相同的引导检查静态启动流程。
它还会在启动 Electron 前清除继承的 `ELECTRON_RUN_AS_NODE` 环境变量。

如果 `Dashboard` 和 `Accounts` 能加载但 `Review` 显示
`/api/review/items/{problemId}` 的 404 错误，说明运行中的 `ojreviewd` 版本比渲染层旧。请从 `apps/server` 重新构建 `apps/server/bin/ojreviewd(.exe)`，或更新 `OJREVIEW_SERVICE_PATH` 指向的新二进制后，再重新运行
`apps\\desktop-electron\\run-static.cmd`。

在 `\\wsl.localhost\...` 路径下使用 PowerShell 时，运行时启动应避免使用 `npm.cmd`。
安装完依赖后，可以直接用以下命令启动 Electron：

```powershell
node .\apps\desktop-electron\scripts\dev.mjs
```

如果已经有构建好的服务二进制文件（推荐来自 `apps/server/bin` 或 `OJREVIEW_SERVICE_PATH`），可以用以下命令为 Electron 准备好：

```powershell
.\apps\desktop-electron\prepare-service.ps1
```

或指定自定义二进制文件路径：

```powershell
$env:OJREVIEW_SERVICE_PATH = "C:\path\to\ojreviewd.exe"
.\apps\desktop-electron\prepare-service.ps1
```

## 构建

```bash
cd apps/desktop-electron
npm run build
```

渲染层输出目录为 `apps/desktop-electron/renderer/dist`。
