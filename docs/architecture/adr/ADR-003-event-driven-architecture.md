---
tags:
  - adr
  - architecture
  - decision
  - event-driven
  - messaging
description: ADR-003 - 采用事件驱动架构实现模块解耦
created: 2025-11-23T15:00:00
updated: 2026-09-08T09:00:00+08:00
---

# ADR-003: 事件驱动架构

**状态**: 历史决策（事件语义保留；实现由 ADR-033 / ADR-064 修订）
**日期**: 2024-09-01  
**决策者**: @BakerSean168  

## 2026-09-08 实现状态

本 ADR 保留“通知式跨模块协作使用事件”的历史方向，但不再代表当前 EventBus 的具体实现。当前规则由 ADR-033/064 收敛：请求-响应使用 Port / IPC / HTTP；runtime-local EventBus 使用 Emittery，业务 `send()` 保持通知语义，可靠基础设施边界使用 delivery-scoped `dispatch()`。历史 mitt-RPC / 全局 drain 不属于当前架构。

## 背景

MemoFlow 包含多个业务模块（目标、任务、提醒、通知等），这些模块之间需要通信和协作。例如：

- 目标完成时 → 发送通知
- 任务截止时 → 创建提醒
- 日程变更时 → 更新相关任务
- 用户操作时 → 记录日志

我们需要一种机制来实现：
1. **模块解耦** - 模块不直接依赖彼此
2. **扩展性** - 新增监听者不影响发布者
3. **一致性** - 确保相关操作都能完成
4. **可追溯** - 事件流清晰可追踪

### 可选方案

1. **直接调用** - 模块间直接方法调用
2. **消息队列** (RabbitMQ, Kafka)
3. **事件总线** (内存事件系统)
4. **事件溯源** (Event Sourcing)

## 决策

采用 **事件驱动架构**，使用：
- **内存事件总线** (本地通信)
- **Redis Pub/Sub** (跨进程通信)
- **Server-Sent Events (SSE)** (服务器到客户端)

## 理由

### 为什么选择事件驱动？

✅ **松耦合**
- 发布者不知道订阅者
- 新增订阅者不影响现有代码
- 模块可独立开发和测试

✅ **可扩展**
- 轻松添加新的事件监听者
- 支持多个订阅者
- 易于实现新功能

✅ **可维护**
- 事件流清晰
- 业务逻辑分离
- 易于追踪和调试

✅ **最终一致性**
- 异步处理
- 不阻塞主流程
- 提升性能

### 为什么这样组合？

#### 内存事件总线 (NestJS EventEmitter)

**用途**: 单进程内模块间通信

✅ **优点**:
- 零延迟
- 无需外部依赖
- 实现简单
- 适合本地事件

❌ **缺点**:
- 仅单进程
- 重启丢失
- 不支持分布式

**使用场景**:
```typescript
// 发布事件
eventEmitter.emit('goal.completed', { goalUuid: '...' });

// 监听事件
@OnEvent('goal.completed')
handleGoalCompleted(event: GoalCompletedEvent) {
  // 创建通知
}
```

#### Redis Pub/Sub

**用途**: 跨进程通信、持久化

✅ **优点**:
- 支持多进程
- 支持持久化
- 高性能
- 简单可靠

❌ **缺点**:
- 需要 Redis
- 不保证顺序（无序）
- 无消息持久化（除非配置）

**使用场景**:
```typescript
// 跨 API 实例通信
redis.publish('task.deadline.approaching', JSON.stringify(event));

redis.subscribe('task.deadline.approaching', (message) => {
  // 处理事件
});
```

#### Server-Sent Events (SSE)

**用途**: 服务器推送到客户端

✅ **优点**:
- 标准 Web API
- 自动重连
- 单向推送
- 实现简单

❌ **缺点**:
- 仅单向（服务器→客户端）
- 不支持 IE
- 连接数限制

**使用场景**:
```typescript
// 服务器推送
sseService.sendEvent(userId, {
  type: 'notification.new',
  data: { message: '...' }
});

// 客户端接收
const eventSource = new EventSource('/api/events');
eventSource.onmessage = (event) => {
  // 更新 UI
};
```

### 为什么不选其他方案？

❌ **直接调用**
- 紧耦合
- 难以扩展
- 循环依赖风险

❌ **消息队列 (RabbitMQ, Kafka)**
- 过度设计（当前规模）
- 运维复杂
- 成本高
- 可在未来扩展时引入

❌ **事件溯源**
- 过度复杂
- 实现成本高
- 查询困难
- 不适合当前需求

## 实施

### 事件命名规范

遵循统一的命名约定：

```
{module}.{entity}.{action}
```

**示例**:
- `goal.created` - 目标创建
- `goal.completed` - 目标完成
- `task.deadline.approaching` - 任务截止临近
- `reminder.triggered` - 提醒触发
- `notification.sent` - 通知已发送

详见 [[../../concepts/event-driven#event-naming|事件命名规范]]。

### 事件结构

```typescript
interface DomainEvent<T = any> {
  type: string;              // 事件类型
  payload: T;                // 事件数据
  metadata: {
    timestamp: Date;         // 时间戳
    correlationId: string;   // 关联 ID（追踪）
    userId?: string;         // 触发用户
    source: string;          // 事件源
  };
}
```

### 实现架构

```
┌─────────────────────────────────────────────────┐
│                  Client (Web)                   │
│  ┌──────────────────────────────────────────┐  │
│  │     SSE Connection (实时推送)             │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ SSE
                      ▼
┌─────────────────────────────────────────────────┐
│              API Server (NestJS)                │
│  ┌────────────────────────────────────────┐    │
│  │    Internal Event Bus (EventEmitter)   │    │
│  └────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────┐    │
│  │    Redis Publisher/Subscriber          │    │
│  └────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────┘
                      │ Redis Pub/Sub
                      ▼
┌─────────────────────────────────────────────────┐
│                   Redis                         │
│  ┌────────────────────────────────────────┐    │
│  │     Pub/Sub Channels                   │    │
│  └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 代码示例

#### 1. 定义事件类型

```typescript
// packages/contracts/src/goal/events.types.ts
export interface GoalCompletedEvent {
  type: 'goal.completed';
  payload: {
    goalUuid: string;
    userId: string;
    completedAt: Date;
  };
}
```

#### 2. 发布事件

```typescript
// apps/api/src/modules/goal/goal.service.ts
@Injectable()
export class GoalService {
  constructor(
    private eventEmitter: EventEmitter2,
    private redisPublisher: RedisService,
  ) {}

  async completeGoal(uuid: string, userId: string): Promise<void> {
    // 业务逻辑
    await this.goalRepository.markAsCompleted(uuid);

    // 发布本地事件
    this.eventEmitter.emit('goal.completed', {
      type: 'goal.completed',
      payload: { goalUuid: uuid, userId, completedAt: new Date() }
    });

    // 发布跨进程事件（如果需要）
    await this.redisPublisher.publish('goal.completed', {
      type: 'goal.completed',
      payload: { goalUuid: uuid, userId, completedAt: new Date() }
    });
  }
}
```

#### 3. 订阅事件

```typescript
// apps/api/src/modules/notification/listeners/goal.listener.ts
@Injectable()
export class GoalEventListener {
  constructor(private notificationService: NotificationService) {}

  @OnEvent('goal.completed')
  async handleGoalCompleted(event: GoalCompletedEvent): Promise<void> {
    await this.notificationService.create({
      userId: event.payload.userId,
      type: 'goal_completed',
      title: '🎉 目标完成！',
      message: `恭喜你完成了目标！`,
    });
  }
}
```

#### 4. SSE 推送到客户端

```typescript
// apps/api/src/modules/sse/sse.service.ts
@Injectable()
export class SseService {
  private connections = new Map<string, Response>();

  @OnEvent('notification.new')
  async handleNewNotification(event: NotificationNewEvent): Promise<void> {
    const userId = event.payload.userId;
    const connection = this.connections.get(userId);
    
    if (connection) {
      connection.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
```

#### 5. 客户端接收

```typescript
// apps/web/src/modules/notification/composables/useNotifications.ts
export function useNotifications() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('notification.new', (event) => {
    const notification = JSON.parse(event.data);
    // 更新 UI
    showNotification(notification);
  });

  onUnmounted(() => {
    eventSource.close();
  });
}
```

## 影响

### 正面影响

✅ **模块解耦** - 模块间依赖降低 80%  
✅ **可扩展性** - 新增功能无需修改现有代码  
✅ **实时体验** - SSE 实现实时通知推送  
✅ **可追溯性** - 事件流清晰，易于调试  
✅ **性能提升** - 异步处理，主流程不阻塞  

### 负面影响

⚠️ **复杂度增加**
- 事件流需要追踪
- 调试困难（异步）
- 需要日志和监控

⚠️ **最终一致性**
- 不是强一致性
- 需要处理失败场景
- 幂等性要求

⚠️ **依赖 Redis**
- 需要运维 Redis
- 单点故障风险（可用集群解决）

## 最佳实践

### DO ✅

1. **事件命名一致** - 遵循 `module.entity.action` 格式
2. **事件版本化** - 支持事件结构演进
3. **幂等处理** - 事件处理器支持重复执行
4. **错误处理** - 失败重试和死信队列
5. **事件日志** - 记录所有事件用于追踪

### DON'T ❌

1. **不要阻塞事件处理** - 使用异步
2. **不要在事件中传递大对象** - 只传 ID
3. **不要循环依赖** - A → B → A 的事件链
4. **不要忽略失败** - 必须处理错误场景
5. **不要过度使用** - 简单场景直接调用即可

## 监控与调试

### 事件追踪

使用 `correlationId` 追踪事件流：

```typescript
const correlationId = uuid();

// 事件 A
eventEmitter.emit('goal.completed', {
  metadata: { correlationId, ... }
});

// 事件 B (由 A 触发)
eventEmitter.emit('notification.sent', {
  metadata: { correlationId, ... }
});

// 查询日志：搜索 correlationId 查看完整事件链
```

### 事件日志

```typescript
@OnEvent('**')  // 监听所有事件
async logEvent(event: DomainEvent): Promise<void> {
  await this.logger.log({
    type: event.type,
    correlationId: event.metadata.correlationId,
    timestamp: event.metadata.timestamp,
  });
}
```

## 相关决策

- [ADR-002: DDD 架构模式](./ADR-002-ddd-pattern.md) - 领域事件是 DDD 的关键
- [ADR-001: Nx Monorepo](./ADR-001-use-nx-monorepo.md) - 事件类型在 contracts 包共享

## 参考资料

- [Event-Driven Architecture (Martin Fowler)](https://martinfowler.com/articles/201701-event-driven.html)
- [NestJS Event Emitter](https://docs.nestjs.com/techniques/events)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)
- [[../../concepts/event-driven|事件驱动架构指南]] - 项目内实践

---

**教训**: 事件驱动不是为了炫技，而是为了解耦。在模块边界使用事件，模块内部可以直接调用。权衡复杂度和收益。
