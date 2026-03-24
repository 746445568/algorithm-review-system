# Desktop V1 发布说明（唯一入口）

本文档定义 **OJ Review Desktop V1** 的唯一发布入口与完整步骤，避免手工发布时流程不一致。

## 唯一发布入口

> 使用仓库根目录脚本：`scripts/release-desktop-v1.sh`

该脚本是 Desktop V1 的标准发布入口，串联以下动作：

1. 校验 Node 版本（要求 `>=18`）
2. 安装 Electron 端依赖（`npm ci`）
3. 构建 Go 本地服务 `ojreviewd`
4. 复制二进制到 `apps/desktop-electron/bin`
5. 在 `apps/desktop-electron` 执行 `npm run dist`

## 本地发布步骤

在仓库根目录执行：

```bash
bash ./scripts/release-desktop-v1.sh
```

可选参数：

- `--skip-install`：跳过 `npm ci`（依赖已就绪时加速）
- `--version <x.y.z>`：覆盖默认版本号，传给 `npm version --no-git-tag-version`

示例：

```bash
bash ./scripts/release-desktop-v1.sh --version 1.0.1
bash ./scripts/release-desktop-v1.sh --skip-install
```

## 产物命名规范

Electron 打包产物统一使用以下格式：

```text
OJReviewDesktop-<version>-<platform>-<arch>.<ext>
```

示例：

- `OJReviewDesktop-1.0.0-win-x64.exe`
- `OJReviewDesktop-1.0.0-win-x64.zip`

## CI 发布入口（GitHub Actions）

CI 通过 tag 触发：`v*`（如 `v1.0.0`）。

工作流会自动执行：

1. checkout
2. 安装 Node/Go
3. 构建 `ojreviewd`
4. 运行 Electron 打包
5. 上传 `dist/` 工件并创建 GitHub Release

对应工作流文件：`.github/workflows/desktop-release.yml`。
