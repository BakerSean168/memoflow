---
tags:
  - adr
  - architecture
  - decision
  - electron
  - ipc
  - desktop
description: ADR-006 - Desktop IPC 通信架构与依赖注入集成
created: 2025-12-06
updated: 2025-12-06
---

# ADR-006: Desktop IPC 通信架构与依赖注入集成

**状态**: ✅ 已采纳  
**日期**: 2025-12-06  
**决策者**: @BakerSean168  
**关联**: ADR-004 (Electron 桌面应用架构)

## 背景

> 注：本 ADR 中若干 `GoalContainer` / container-based 代码片段仅作为历史记录保留。
> 当前桌面实现已迁移到 module composition roots、shared IPC channel contracts、
> preload allowlists 与 transport-neutral module APIs。

在 ADR-004 中，我们决定采用分层提取策略，将业务逻辑提取到共享包中。现在需要明确 Electron 主进程与渲染进程之间的通信架构，以及如何将 `@memoflow/infrastructure-client` 和 `@memoflow/infrastructure-server` 包集成到 Desktop 应用中。

### 现有基础设施

已提取的包：

- `@memoflow/infrastructure-client`: 12 Container, 21 IPC Adapters
- `@memoflow/infrastructure-server`: 11 Container
- `configureDesktopDependencies(electronApi)`: 渲染进程 DI 配置函数

### 核心问题

1. 渲染进程如何与主进程通信？
2. 如何保持类型安全？
3. 如何利用现有的 Container 模式？
4. 如何处理错误和调试？

### 可选方案

1. **方案 A**: 直接使用 ipcRenderer/ipcMain
   - 每个模块手动编写 IPC 调用
   - 无抽象层

2. **方案 B**: invoke/handle 模式 + IPC Adapter
   - 使用 Promise 风格的 IPC
   - IPC Adapter 实现统一接口

3. **方案 C**: 自定义 RPC 框架
   - 开发独立的 RPC 层
   - 自动生成代理

## 决策

选择 **方案 B: invoke/handle 模式 + IPC Adapter**

## 架构设计

### 1. 整体数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer Process (渲染进程)                                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Vue Application                            │   │
│  │                                                               │   │
│  │  Component → Composable → Service → injected adapter         │   │
│  │                                                               │   │
│  │  GoalView.vue                                                 │   │
│  │      ↓                                                        │   │
│  │  useGoal()  (composable)                                      │   │
│  │      ↓                                                        │   │
│  │  GetAllGoalsService  (@memoflow/application-client)           │   │
│  │      ↓                                                        │   │
│  │  injected goal client adapter                                 │
│  │      ↓                                                        │   │
│  │  GoalIpcAdapter.getGoals()                                    │   │
│  │      ↓                                                        │   │
│  │  ipcClient.invoke('goal:list', params)                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                    │                                 │
│  ┌─────────────────────────────────▼────────────────────────────┐   │
│  │              window.electronAPI (Preload 暴露)                │   │
│  │                                                               │   │
│  │  invoke(channel, ...args) → ipcRenderer.invoke(...)          │   │
│  │  on(channel, callback)    → ipcRenderer.on(...)              │   │
│  │  off(channel, callback)   → ipcRenderer.removeListener(...)  │   │
│  └──────────────────────────────────┬───────────────────────────┘   │
│                                     │                                │
└─────────────────────────────────────┼────────────────────────────────┘
                                      │ IPC Channel
┌─────────────────────────────────────▼────────────────────────────────┐
│ Main Process (主进程)                                                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    IPC Handlers                               │   │
│  │                                                               │   │
│  │  ipcMain.handle('goal:list', async (event, params) => {      │   │
│  │    try {                                                      │   │
│  │      return await goalModule.api.listGoals(params, ctx);      │   │
│  │    } catch (error) {                                          │   │
│  │      log.error('goal:list failed', error);                    │   │
│  │      throw error;                                             │   │
│  │    }                                                          │   │
│  │  });                                                          │   │
│  └──────────────────────────────────┬───────────────────────────┘   │
│                                     │                                │
│  ┌──────────────────────────────────▼───────────────────────────┐   │
│  │         module api + repository adapters                      │   │
│  │      ↓                                                        │   │
│  │  PowerSync local database runtime                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. ElectronAPI 接口定义

```typescript
// @memoflow/infrastructure-client/src/shared/ipc-client.types.ts
export interface ElectronAPI {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, callback: (...args: unknown[]) => void): void;
  off(channel: string, callback: (...args: unknown[]) => void): void;
}
```

**设计理由**:

- `invoke`: Promise 风格，适合请求-响应模式
- `on/off`: 事件订阅，适合主进程推送（如通知）
- 泛型 `<T>`: 保持类型安全

### 3. IPC 通道命名规范

```
格式: {module}:{action}

示例:
├── goal:list          获取目标列表
├── goal:get           获取单个目标
├── goal:create        创建目标
├── goal:update        更新目标
├── goal:delete        删除目标
├── goal:activate      激活目标
├── goal-folder:list   获取目标文件夹列表
├── task:list          获取任务列表
├── schedule:list      获取日程列表
├── reminder:trigger   触发提醒
└── ...
```

**设计理由**:

- 清晰的命名空间隔离
- 易于日志过滤和调试
- 与 IPC Adapter 中的 channel 属性一致

### 4. Preload 脚本设计

```typescript
// apps/desktop/src/preload/main.ts
import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    // 安全检查：只允许预定义的通道
    const allowedChannels = [
      'goal:',
      'goal-folder:',
      'task:',
      'schedule:',
      'reminder:',
      'account:',
      'auth:',
      'notification:',
      'ai:',
      'dashboard:',
      'repository:',
      'setting:',
    ];

    if (!allowedChannels.some((prefix) => channel.startsWith(prefix))) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    }

    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args));
  },

  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

**安全考虑**:

- 白名单机制防止任意 IPC 调用
- contextBridge 隔离渲染进程

### 5. 主进程 Handler 注册模式

旧的 `GoalContainer` handler 示例已删除。
当前推荐模式：Electron entry 创建模块实例，IPC handlers 调用 module API，
错误包装、认证上下文和参数验证都在 transport layer 中显式处理。

**设计理由**:

- 统一的错误处理和日志
- Handler 函数简洁
- 易于测试

### 6. 依赖注入初始化顺序

```
应用启动顺序:

Main Process:
┌─────────────────────────────────────────────────────────────────┐
│ 1. app.whenReady()                                               │
│ 2. openPowerSyncLocalOnly()       ← PowerSync 本地数据库连接     │
│ 3. create/start modules           ← composition root 装配       │
│ 4. registerAllIpcHandlers()       ← IPC Handler 注册            │
│ 5. createMainWindow()             ← 创建窗口                    │
└─────────────────────────────────────────────────────────────────┘

Renderer Process:
┌─────────────────────────────────────────────────────────────────┐
│ 1. DOM Ready                                                     │
│ 2. configureDesktopDependencies(window.electronAPI)             │
│ 3. createApp(App)                 ← Vue 应用创建                │
│ 4. app.mount('#app')              ← 挂载                        │
└─────────────────────────────────────────────────────────────────┘
```

## 理由

### 为什么选择方案 B？

✅ **与现有架构完美契合**

- IPC Adapter 已实现，只需正确连接
- Container 模式在两端一致

✅ **Promise 风格简洁**

- `invoke/handle` 比 `send/on` 更直观
- 自动处理请求-响应匹配

✅ **类型安全**

- `@memoflow/contracts` 定义的 DTO 在两端共享
- TypeScript 编译时检查

✅ **易于调试**

- 统一日志格式
- Channel 命名清晰

### 为什么不选其他方案？

❌ **方案 A (直接 IPC)**

- 代码重复
- 无抽象层，难以测试
- 与共享包不兼容

❌ **方案 C (自定义 RPC)**

- 过度工程
- 额外学习成本
- 已有 IPC Adapter 无需重复造轮子

## 实现计划

### Infrastructure Setup (STORY-002/003/004)

1. **主进程 DI** (STORY-002)
   - 创建 `desktop-main.composition-root.ts`
   - 配置 PowerSync Repository

2. **Preload 修复** (STORY-004)
   - 新增 `electronAPI` 暴露
   - 匹配 `ElectronAPI` 接口

3. **IPC Handler** (STORY-004)
   - 实现 11 个模块的 Handler
   - 统一错误处理

4. **渲染进程 DI** (STORY-003)
   - 调用 `configureDesktopDependencies`
   - 验证端到端通信

### Validation & POC

- 选择 Goal 模块作为 POC
- 完成 CRUD 全流程验证
- 性能基准测试

## 风险与缓解

| 风险           | 概率 | 影响 | 缓解措施                            |
| -------------- | ---- | ---- | ----------------------------------- |
| IPC 序列化失败 | 中   | 高   | 确保只传递 Plain Object，无循环引用 |
| 大数据量传输慢 | 中   | 中   | 实现分页，流式传输                  |
| 类型不同步     | 低   | 高   | 使用 `@memoflow/contracts` 统一 DTO |
| 调试困难       | 中   | 中   | electron-log 统一日志               |

## 相关决策

- **ADR-004**: Electron 桌面应用架构与包提取策略
- **ADR-002**: DDD 分层架构
- **ADR-003**: 事件驱动架构

## 参考

- [Electron IPC 文档](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [contextBridge 安全指南](https://www.electronjs.org/docs/latest/api/context-bridge)
- `packages/infrastructure-client/src/shared/ipc-client.types.ts`
- `packages/infrastructure-client/src/di/composition-roots/desktop.composition-root.ts`

---

**审核**: @Architect Winston  
**批准**: 2025-12-06
