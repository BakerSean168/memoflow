# 🚀 MemoFlow Codespaces 快速入门

## 第一次使用？

欢迎！这个 Codespace 已经为你配置好了所有开发工具。

### ✅ 已为你准备好的环境

```
✓ Node.js 22.20.0
✓ pnpm 10.18.3
✓ Docker
✓ Git & GitHub CLI
✓ VS Code 扩展:
  - GitHub Copilot
  - Copilot MCP (AI 增强工具)
  - Nx Console
  - Vue Volar
  - Oxfmt
  - 中文语言包
✓ MCP 工具:
  - nx-mcp-server (Nx 工作区管理)
  - playwright-mcp (浏览器自动化)
  - chrome-devtools (Chrome 调试)
```

---

## 📋 5 分钟上手

### 1️⃣ 验证环境 (30秒)

```bash
# 检查版本
node --version    # 应显示 v22.20.0
pnpm --version    # 应显示 10.18.3
```

### 2️⃣ 安装依赖 (如果未自动安装)

```bash
pnpm install
```

### 3️⃣ 启动开发服务器 (2分钟)

**终端 1 - 启动 API 服务器**:

```bash
pnpm exec nx run api:dev
```

**终端 2 - 启动 Web 前端**:

```bash
pnpm exec nx run web:dev
```

### 4️⃣ 访问应用

Codespaces 会自动转发端口，点击弹出的通知即可访问：

- **API**: http://localhost:3001
- **Web**: http://localhost:5173

---

## 🎯 常用命令

### Nx 工作区管理

```bash
# 查看项目依赖图（可视化）
pnpm exec nx graph

# 查看所有项目
pnpm exec nx show projects

# 查看受影响的项目
pnpm exec nx show projects --affected

# 运行特定项目的命令
pnpm exec nx run <项目名>:<目标>
```

### 构建 & 测试

```bash
# 构建所有项目
pnpm exec nx run-many --target=build --all

# 只构建受影响的项目
pnpm exec nx affected:build

# 运行测试
pnpm exec nx run-many --target=test --all

# 运行特定项目的测试
pnpm exec nx run api:test
pnpm exec nx run web:test
```

### 代码质量

```bash
# Lint 检查
pnpm exec nx run-many --target=lint --all

# 格式化代码
pnpm exec nx format:write

# 检查格式
pnpm exec nx format:check
```

---

## 🛠️ 使用 MCP 工具

这个 Codespace 集成了 3 个强大的 MCP 工具，可以通过 GitHub Copilot Chat 使用：

### 1. Nx MCP Server (Nx 工作区管理)

在 Copilot Chat 中尝试：

```
@workspace 显示项目结构
@workspace 运行 api 的 dev 任务
@workspace 查看 web 项目的依赖
```

### 2. Playwright MCP (浏览器自动化)

在 Copilot Chat 中尝试：

```
帮我打开浏览器并访问 http://localhost:5173
帮我测试登录功能
截取当前页面的截图
```

### 3. Chrome DevTools MCP

在 Copilot Chat 中尝试：

```
分析当前页面的网络请求
查看 Console 日志
检查页面性能
```

---

## 📁 项目结构快速导航

```
MemoFlow/
├── apps/
│   ├── api/          # 后端 API (NestJS + Prisma)
│   ├── web/          # 前端 Web (Vue 3 + Vite)
│   └── desktop/      # 桌面应用 (Electron)
├── packages/
│   ├── contracts/    # 前后端共享类型
│   ├── domain-client/# 客户端领域层
│   ├── domain-server/# 服务端领域层
│   ├── ui/          # 共享 UI 组件
│   └── utils/       # 工具库
├── docs/            # 文档
└── bmad/            # BMAD 方法论配置
```

---

## 🔥 热门工作流

### 开发新功能

```bash
# 1. 创建新分支
git checkout -b feature/your-feature

# 2. 开发 (使用 Copilot 辅助)
# - 使用 @workspace 查询项目信息
# - 让 Copilot 生成代码

# 3. 测试
pnpm exec nx affected:test

# 4. 提交
git add .
git commit -m "feat: your feature description"

# 5. 推送
git push origin feature/your-feature
```

### 修复 Bug

```bash
# 1. 运行测试定位问题
pnpm exec nx run <project>:test

# 2. 使用 Copilot 分析错误
# 在 Chat 中: "分析这个错误: <错误信息>"

# 3. 修复后重新测试
pnpm exec nx affected:test
```

### 代码审查前检查

```bash
# 完整检查流程
pnpm exec nx affected:lint    # Lint 检查
pnpm exec nx affected:test    # 运行测试
pnpm exec nx affected:build   # 构建验证
pnpm exec nx format:check     # 格式检查
```

---

## 🐛 常见问题

### Q: 端口被占用怎么办？

```bash
# 查看占用端口的进程
lsof -i :3001

# 杀死进程
kill -9 <PID>
```

### Q: pnpm 安装依赖失败？

```bash
# 清除缓存重试
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

### Q: MCP 工具无法使用？

1. 检查扩展是否安装: `Ctrl+Shift+X` 搜索 "copilot-mcp"
2. 重新加载窗口: `F1` → "Developer: Reload Window"
3. 查看输出: `View` → `Output` → "Copilot MCP"

### Q: Git safe.directory 警告？

```bash
git config --global --add safe.directory /workspaces/MemoFlow
```

---

## 💡 小贴士

1. **使用 Nx Console**: 点击左侧 Nx 图标，可视化管理项目
2. **快捷键**:
   - `Ctrl+Shift+P` (F1): 命令面板
   - `Ctrl+` `: 打开终端
   - `Ctrl+B`: 切换侧边栏
3. **多终端**: 可以同时运行多个终端（API + Web）
4. **端口转发**: Codespaces 自动处理，点击通知即可访问
5. **Copilot Chat**: 遇到问题直接问 Copilot！

---

## �� 进阶资源

- [完整文档](./README.md)
- [Nx 官方文档](https://nx.dev/)
- [Vue 3 文档](https://vuejs.org/)
- [Prisma 文档](https://www.prisma.io/)
- [MCP Protocol](https://modelcontextprotocol.io/)

---

## 🎉 开始开发吧！

有问题随时在 Copilot Chat 中问我：

```
@workspace 我该如何开始？
帮我创建一个新的 API 端点
如何运行 E2E 测试？
```

祝编码愉快！🚀
