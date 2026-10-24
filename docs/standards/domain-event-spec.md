---
created: 2026-01-30T19:34:55
updated: 2026-05-11
tags: [ddd, event, standard]
---

# 领域事件开发规范 (Domain Event Standards)

**版本**: 2.0

**核心原则**: 聚合根是事件的工厂，contracts 定义 payload 信封由框架自动包裹。

## 1. 信封与 Payload 的分离

领域事件有两层结构：

1. **信封 (Envelope)** — 由 `IDomainEvent` 定义，由 `addDomainEvent()` 自动生成，开发者不需要手动构造：
   - `eventType: string` — 事件类型 key
   - `payload: P` — 业务数据
   - `aggregateId: string` — 聚合根 ID（自动从 `this.id` 获取）
   - `occurredAt: Date` — 发生时间（自动生成）

2. **Payload** — contracts 中定义的业务数据接口，**只包含业务字段，不包含信封字段**。

```typescript
// packages/contracts/src/shared/domain-event.interface.ts
export interface IDomainEvent<P = any> {
  eventType: string;
  payload: P;
  aggregateId: string;
  occurredAt: Date;
}
```

**规则**: payload 接口中**禁止**出现 `aggregateId`、`occurredAt`/`timestamp`、`eventType` 等信封字段。这些字段由框架自动注入。

## 2. 事件 Key 命名规范

格式: `domain:action-past-tense`

- 聚合根事件: `schedule:task-created`, `task:created`
- 子实体事件: `domain:entity-action` — 如 `task:instance-completed`, `reminder:template-deleted`
- **禁止**使用三冒号 `domain:entity:action` 形态

示例:

```
schedule:task-created        ✅
schedule:task-paused         ✅
schedule:calendar-entry-deleted  ✅
schedule:task:created        ❌ (旧形态，已废弃)
```

## 3. Payload 接口定义 (Contracts)

在 `packages/contracts/src/modules/{module}/domain/events/` 下定义 payload-only 接口。

**命名**: `{Entity}{Action}Event`

**规则**:

- 只包含下游消费所需的最小业务数据
- 字段使用 `readonly`
- 不包含信封字段

```typescript
// packages/contracts/src/modules/schedule/domain/events/schedule-task-created.event.ts
import type { ScheduleTaskId } from '../../../../primitives';
import type { SourceModule } from '../../value-objects';

export interface ScheduleTaskCreatedEvent {
  readonly taskId: ScheduleTaskId;
  readonly name: string;
  readonly sourceModule: SourceModule;
  readonly sourceEntityId: string;
  readonly cronExpression: string;
  readonly nextRunAt: number;
}
```

## 4. Event Map 定义

在 `packages/contracts/src/modules/{module}/protocol/{module}-event-map.ts` 中注册所有事件 key 到 payload 类型的映射。

```typescript
import type { ScheduleTaskCreatedEvent } from '../domain/events';

export type ScheduleEventMap = {
  'schedule:task-created': ScheduleTaskCreatedEvent;
  'schedule:task-paused': ScheduleTaskPausedEvent;
  // ...
};
```

## 5. 聚合根中触发事件

在聚合根的业务方法中使用 `addDomainEvent`，泛型参数引用 event map 中的类型：

```typescript
import type { ScheduleEventMap } from '@memoflow/contracts/schedule';

export class ScheduleTask extends AggregateRoot<ScheduleTaskId> {
  public pause(reason?: string): void {
    this._props.status = ScheduleTaskStatus.Paused;
    this._props.enabled = false;

    // payload 只包含业务数据 — aggregateId 和 occurredAt 由框架自动注入
    this.addDomainEvent<ScheduleEventMap['schedule:task-paused']>('schedule:task-paused', {
      taskId: this.id,
      sourceModule: this._props.sourceModule,
      sourceEntityId: this._props.sourceEntityId,
      reason,
    });
  }
}
```

## 6. 运行时事件消费

运行时通过 `eventBus.on` / `eventBus.send` 消费事件。event map 提供类型安全：

```typescript
// 订阅
eventBus.on('schedule:task-created', handler);

// 发送（直接调用场景）
eventBus.send('schedule:task-deleted', { taskId: id });
```

## 7. 与 IPC Channel 的边界

IPC channel 命名（如 `schedule:task:create`）遵循**不同的约定** — 使用命令式动词，不属于领域事件体系。领域事件使用过去式（created, deleted, paused）。

## 总结

| 要素             | 规范                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| Payload 接口位置 | `packages/contracts/src/modules/{module}/domain/events/`                 |
| Payload 接口命名 | `{Entity}{Action}Event`                                                  |
| Payload 字段     | 只含业务数据，`readonly`，不含信封字段                                   |
| Event Map 位置   | `packages/contracts/src/modules/{module}/protocol/{module}-event-map.ts` |
| Event Key 格式   | `domain:action` 或 `domain:entity-action`（最多两个冒号）                |
| 信封字段         | `aggregateId`、`occurredAt` 由 `addDomainEvent()` 自动生成               |
