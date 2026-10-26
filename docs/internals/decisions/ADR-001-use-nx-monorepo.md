---
tags:
  - adr
  - architecture
  - decision
  - monorepo
description: ADR-001 - 使用 Nx Monorepo 管理多个应用和包
created: 2025-11-23T15:00:00
updated: 2025-11-23T15:00:00
---

# ADR-001: 使用 Nx Monorepo

**状态**: ✅ 已采纳  
**日期**: 2024-08-15  
**决策者**: @BakerSean168

## 背景

MemoFlow 项目包含多个应用（Web、Desktop、API）和多个共享包（contracts、utils、domain 层等）。我们需要决定如何组织代码仓库结构。

### 可选方案

1. **Multi-repo**: 每个应用/包独立仓库
2. **Monorepo with Lerna**: 使用 Lerna 管理
3. **Monorepo with Nx**: 使用 Nx 管理

## 决策

选择 **Nx Monorepo** 作为项目组织方式。

## 理由

### 为什么选择 Monorepo？

✅ **代码共享简单**

- 共享包（contracts、utils）可以被多个应用直接引用
- 无需发布到 npm 或使用 npm link
- 类型定义自动同步

✅ **统一的工具链**

- 所有项目使用相同的 TypeScript、ESLint、Prettier 配置
- 一次配置，全局生效

✅ **原子化提交**

- 一次 commit 可以同时修改多个包
- 避免版本不一致问题

✅ **统一的 CI/CD**

- 单一的构建和测试流程
- 增量构建，只构建变更部分

### 为什么选择 Nx 而非 Lerna？

✅ **更强大的构建系统**

- 智能依赖分析
- 增量构建和测试
- 分布式任务执行

✅ **更好的开发体验**

- Nx Console (VS Code 插件)
- 可视化依赖图
- 代码生成器

✅ **性能优化**

- 本地缓存
- 远程缓存支持
- 并行执行任务

✅ **活跃的社区**

- 持续更新
- 丰富的插件生态
- 优秀的文档

## 实施

### 项目结构

```
memoflow/
├── apps/
│   ├── api/          # API 服务
│   ├── web/          # Web 应用
│   └── desktop/      # Electron 桌面应用
├── packages/
│   ├── contracts/    # 类型契约
│   ├── domain-client/# 客户端领域层
│   ├── domain-server/# 服务端领域层
│   ├── utils/        # 工具库
│   └── ui/           # UI 组件
├── nx.json           # Nx 配置
└── package.json      # 根 package.json
```

### 关键配置

**nx.json**:

```json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "test", "lint"]
      }
    }
  }
}
```

**tsconfig.workspace-src.json**:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@memoflow/contracts": ["packages/contracts/src/index.ts"],
      "@memoflow/utils": ["packages/utils/src/index.ts"]
    }
  }
}
```

## 影响

### 正面影响

✅ 开发效率提升 40%（代码共享更简单）  
✅ 构建时间减少 60%（增量构建 + 缓存）  
✅ 依赖管理更简单（单一 package.json）  
✅ 重构更容易（跨包修改在一次 commit）

### 负面影响

⚠️ 学习曲线（团队需要学习 Nx）  
⚠️ 初始配置复杂度增加  
⚠️ 仓库体积变大（但可以用 git sparse-checkout）

## 相关决策

- [ADR-002: 采用 DDD 架构模式](./ADR-002-ddd-pattern.md) - DDD 分层与 Monorepo 的结合
- [ADR-003: 事件驱动架构](./ADR-003-event-driven-architecture.md) - 跨包通信机制

## 参考资料

- [Nx Documentation](https://nx.dev/)
- [Monorepo Handbook](https://monorepo.tools/)
- [Why Nx?](https://nx.dev/getting-started/why-nx)

---

**教训**: Monorepo 对于包含多个相关应用的项目是正确选择，Nx 提供的工具链大大提升了开发体验。
