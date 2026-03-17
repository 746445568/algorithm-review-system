# Windows 打包

本目录用于 OJ 复盘系统桌面版的 Windows 安装包构建流程。

## 计划中的打包职责

- 打包 Electron 桌面应用
- 打包 `ojreviewd` 本地服务二进制文件
- 首次运行时初始化应用目录
- 跨版本升级时保留 SQLite 数据
- 向用户展示迁移和回滚失败信息

## 打包目标

- 一键 Windows 安装包
- 数据存储在当前用户的本地应用数据目录下

## 当前二进制文件查找规则

Electron 应用按以下顺序查找本地服务二进制文件：

1. `process.resourcesPath/bin/ojreviewd.exe`（已打包环境）
2. `app.getAppPath()/bin/ojreviewd.exe`（开发环境）
3. `apps/server/bin/ojreviewd.exe`（仓库开发环境）
4. 开发回退：`go run ./cmd/ojreviewd`

## Electron 打包

应用使用 Electron 标准打包流程：

```bash
cd apps/desktop-electron
npm run build
```

渲染层输出目录为 `apps/desktop-electron/renderer/dist`。
