#!/bin/bash
# 一键启动 OJ 错题复盘系统（AI 分析版）

echo "🚀 启动 OJ 错题复盘系统..."

# 1. 检查并安装 Go
if ! command -v go &> /dev/null; then
    echo "📦 安装 Go..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq golang-go
    export PATH=$PATH:/usr/local/go/bin
fi

echo "✅ Go 版本: $(go version)"

# 2. 进入项目目录
cd /home/r9000p746445568/.openclaw/workspace/algorithm-review-system

# 3. 构建 Go 服务（如果不存在）
if [ ! -f apps/desktop-electron/bin/ojreviewd ]; then
    echo "🔨 构建 Go 服务..."
    cd apps/server
    go mod tidy
    go build -o ../desktop-electron/bin/ojreviewd ./cmd/ojreviewd
    cd ../..
    echo "✅ Go 服务构建完成"
fi

# 4. 启动 Go 服务
echo "🟢 启动 Go 后端服务..."
killall ojreviewd 2>/dev/null
sleep 1
apps/desktop-electron/bin/ojreviewd &
GO_PID=$!
sleep 2

# 5. 检查服务是否启动
if curl -s http://localhost:38473/health > /dev/null; then
    echo "✅ Go 服务已启动 (PID: $GO_PID)"
else
    echo "❌ Go 服务启动失败"
    exit 1
fi

# 6. 启动 Electron
echo "🖥️  启动 Electron 桌面应用..."
cd apps/desktop-electron
npm run dev &
ELECTRON_PID=$!

echo ""
echo "=========================================="
echo "✅ 系统已启动！"
echo ""
echo "📊 服务状态:"
echo "  - Go 后端: http://localhost:38473 (PID: $GO_PID)"
echo "  - Electron: 正在启动中..."
echo ""
echo "⚠️  注意:"
echo "  - Electron 窗口可能需要几秒钟弹出"
echo "  - 首次启动可能需要下载依赖"
echo "  - 按 Ctrl+C 可以停止本脚本，但服务会继续运行"
echo ""
echo "🛑 停止服务:"
echo "  kill $GO_PID"
echo "  kill $ELECTRON_PID"
echo "=========================================="

# 保持脚本运行
wait
