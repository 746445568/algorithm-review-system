# 算法错题复盘系统 - 启动指南

## ✅ 项目已创建完成！

项目位置：`~/.openclaw/workspace/algorithm-review-system`

## 🚀 快速启动

### 1. 配置 API Key

首先复制环境变量文件并配置你的 LLM API Key：

```bash
cd ~/.openclaw/workspace/algorithm-review-system
cp .env.example .env
```

然后编辑 `.env` 文件，设置你的 API Key：

```env
# 使用 OpenAI
LLM_API_KEY=sk-your-openai-key
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-3.5-turbo

# 或使用智谱 GLM
# LLM_API_KEY=your-zhipu-key
# LLM_API_BASE=https://open.bigmodel.cn/api/paas/v4
# LLM_MODEL=glm-4

# 或使用通义千问
# LLM_API_KEY=your-dashscope-key
# LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
# LLM_MODEL=qwen-turbo
```

### 2. 启动服务

```bash
# 方式一：同时启动前后端（推荐）
npm run dev

# 方式二：分别启动
# 终端 1 - 启动后端
npm run dev:backend

# 终端 2 - 启动前端
npm run dev:frontend
```

### 3. 访问应用

- 🌐 前端：http://localhost:3000
- 🔌 后端 API：http://localhost:3001
- 📊 API 健康检查：http://localhost:3001/health

## 📋 使用流程

1. **录入题目**
   - 访问 http://localhost:3000/problems/new
   - 填写题目信息（标题、描述、难度、标签等）
   - 点击保存

2. **提交代码**
   - 在题目列表点击题目进入详情页
   - 点击"+ 新提交"按钮
   - 粘贴你的代码，选择语言和状态
   - 如果有错误，填写错误信息

3. **生成 AI 复盘**
   - 在提交记录旁边点击"生成 AI 复盘"按钮
   - 等待 AI 分析（约 5-10 秒）
   - 查看错误分析、改进建议和学习要点

4. **复习题目**
   - 访问 http://localhost:3000/reviews
   - 查看待复习的题目和 AI 复盘
   - 点击"完成复习"标记已学习

## 🛠️ 常用命令

```bash
# 查看数据库
npm run db:studio

# 重新生成 Prisma 客户端
npm run db:generate

# 创建新的数据库迁移
npx prisma migrate dev --name your_migration_name

# 重置数据库（谨慎使用！）
npx prisma migrate reset
```

## 📁 项目结构

```
algorithm-review-system/
├── backend/              # 后端服务 (Express + TypeScript)
│   ├── src/
│   │   ├── routes/       # API 路由
│   │   │   ├── problems.ts    # 题目管理
│   │   │   ├── submissions.ts # 提交记录
│   │   │   └── reviews.ts     # AI 复盘
│   │   ├── services/
│   │   │   └── llm.ts    # LLM 调用服务
│   │   └── index.ts      # 入口文件
│   └── package.json
├── frontend/             # 前端应用 (Next.js 14)
│   ├── src/app/
│   │   ├── page.tsx           # 首页（题目列表）
│   │   ├── problems/
│   │   │   ├── new/page.tsx   # 录入题目
│   │   │   └── [id]/page.tsx  # 题目详情
│   │   └── reviews/page.tsx   # 复习列表
│   └── package.json
├── prisma/
│   ├── schema.prisma     # 数据库模型
│   └── dev.db            # SQLite 数据库文件
├── .env.example          # 环境变量示例
├── .env                  # 环境变量配置（需自行创建）
└── README.md             # 详细文档
```

## 🎯 已完成功能（一期）

✅ 题目录入与管理
✅ 代码提交与错误记录
✅ AI 复盘分析（调用 LLM）
✅ 标签筛选与搜索
✅ 复习队列管理

## 🔮 待开发功能（二期）

🔲 相似题推荐（使用向量检索）
🔲 错因统计分析图表
🔲 自动生成周报
🔲 导出功能（PDF/Markdown）
🔲 用户系统

## 💡 提示

1. **API Key**: 如果没有 LLM API Key，系统会使用默认模板生成复盘（功能受限）
2. **数据库**: 当前使用 SQLite，如需 PostgreSQL 请修改 `prisma/schema.prisma`
3. **部署**: 前后端分离，可分别部署到 Vercel（前端）和 Railway/Render（后端）

## 🐛 遇到问题？

1. 检查 `.env` 文件是否正确配置
2. 确保端口 3000 和 3001 未被占用
3. 查看控制台错误信息
4. 重启开发服务器

祝你学习进步！📚✨
