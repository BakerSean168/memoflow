# @memoflow/patterns

通用设计模式和框架库，为 MemoFlow 应用提供可复用的基础组件。

## 概述

`@memoflow/patterns` 包含跨模块可复用的通用模式实现，包括：

- **Scheduler**: 任务调度相关的数据结构和接口
- **Repository**: 仓储模式基类（待实现）
- **Cache**: 缓存实现（待实现）
- **Events**: 事件处理器抽象（待实现，注：事件总线在 `@memoflow/utils`）

## 安装

```bash
pnpm add @memoflow/patterns
```

## 使用

### Scheduler 模式

#### MinHeap（最小堆）

优先队列的底层数据结构，按 `nextRunAt` 时间戳排序：

```typescript
import { MinHeap, type HeapItem } from '@memoflow/patterns/scheduler';

const heap = new MinHeap<HeapItem>();

heap.insert({ taskUuid: '1', nextRunAt: 100 });
heap.insert({ taskUuid: '2', nextRunAt: 50 });

const next = heap.extractMin(); // { taskUuid: '2', nextRunAt: 50 }
```

#### IScheduleTimer

Timer 抽象接口，支持不同运行时实现：

```typescript
import { NodeTimer, FakeTimer } from '@memoflow/patterns/scheduler';

// 生产环境
const timer = new NodeTimer();

// 测试环境
const fakeTimer = new FakeTimer(0);
fakeTimer.setTimeout(() => console.log('triggered'), 100);
fakeTimer.tick(100); // 手动推进时间
```

#### IScheduleMonitor

调度监控接口，用于收集执行统计：

```typescript
import { InMemoryScheduleMonitor } from '@memoflow/patterns/scheduler';

const monitor = new InMemoryScheduleMonitor();

monitor.recordExecutionStart('task-1', 'My Task');
monitor.recordExecutionSuccess('task-1', 'My Task', 150);

const stats = monitor.getStats();
console.log(stats.totalExecutions); // 1
console.log(stats.averageExecutionDuration); // 150
```

## 架构原则

### L4.5 Patterns 层

在五层架构中，`patterns` 位于 L4.5 层：

```
L1: Contracts（数据契约）
L2: Domain（领域模型）
L3: Infrastructure（基础设施）
L4: Application（应用服务）
L4.5: Patterns（通用模式）← 本包
L5: Apps（应用入口）
```

### 依赖规则

- ✅ **可依赖**: `@memoflow/contracts`
- ❌ **禁止依赖**: domain/infrastructure/application 层
- ✅ **被依赖**: application/infrastructure 层可使用 patterns

### 职责边界

- ✅ **包含**: 通用数据结构、框架接口、设计模式基类
- ❌ **不包含**: 业务逻辑、特定领域规则、具体实现

**注意：**

- 事件总线（EventBus）的具体实现在 `@memoflow/utils` 包中
- patterns 中的 Events 模块将提供事件处理器的通用抽象（BaseEventHandler、IEventDispatcher 等）

## 开发指南

### 添加新模式

1. 在对应目录创建文件（如 `src/repository/BaseRepository.ts`）
2. 在 `index.ts` 中导出
3. 添加单元测试到 `__tests__` 目录
4. 更新 README

### 测试

```bash
# 运行测试
pnpm nx test patterns

# 类型检查
pnpm nx typecheck patterns
```

## 迁移指南

从旧位置迁移到 patterns 的文件：

| 旧位置                                                      | 新位置                                         | 说明           |
| ----------------------------------------------------------- | ---------------------------------------------- | -------------- |
| `application-server/schedule/scheduler/MinHeap.ts`          | `patterns/scheduler/priority-queue/MinHeap.ts` | 最小堆数据结构 |
| `application-server/schedule/scheduler/IScheduleTimer.ts`   | `patterns/scheduler/IScheduleTimer.ts`         | Timer 抽象     |
| `application-server/schedule/scheduler/IScheduleMonitor.ts` | `patterns/scheduler/IScheduleMonitor.ts`       | 监控接口       |

## 许可证

MIT
