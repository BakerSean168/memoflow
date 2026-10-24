# Database LangGraph Checkpointer - 实施计划

**创建日期**: 2026-06-13  
**预估工作量**: 2-3 天  
**优先级**: Medium（可选增强）  
**前置条件**: 当前 checkpoint 架构已完成

---

## 目标

实现真正的 persistent LangGraph checkpointer，使跨进程/重启后的 durable resume 成为可能。

---

## 当前状态 vs 目标状态

### 当前（90% 完成）

**Snapshot Persistence** ✅:

- `AgentRunCheckpoint` 表存储 run metadata + projected state
- Events/interrupts 完整持久化
- 可查看历史 runs
- 可在同会话内 interrupt/resume

**限制** ⚠️:

- LangGraph 使用 `InMemorySaver`（内存中）
- 服务重启后内存 checkpoint 丢失
- Resume 返回 409 `runtime_checkpoint_missing`

### 目标（100% 完成）

**Durable LangGraph Checkpoint** 🎯:

- LangGraph execution state 持久化到数据库
- 服务重启后可继续 resume
- 多实例间可恢复彼此的 interrupted runs

---

## 技术方案

### 1. Database Schema

需要新增表存储 LangGraph checkpoint 数据：

```prisma
// packages/database/prisma/schema/ai.prisma

model LangGraphCheckpoint {
  id            String   @id @default(uuid())
  threadId      String   @map("thread_id")
  checkpointNs  String   @default("") @map("checkpoint_ns")
  checkpointId  String   @map("checkpoint_id")
  parentCheckpointId String? @map("parent_checkpoint_id")

  // Serialized checkpoint data
  checkpointData Bytes    @map("checkpoint_data")
  metadataData   Json     @map("metadata_data")

  // Channel versions
  channelVersions Json    @map("channel_versions")

  createdAt     DateTime @default(now()) @map("created_at")

  @@unique([threadId, checkpointNs, checkpointId])
  @@index([threadId])
  @@index([checkpointId])
  @@map("langgraph_checkpoints")
}

model LangGraphCheckpointWrite {
  id            String   @id @default(uuid())
  threadId      String   @map("thread_id")
  checkpointNs  String   @default("") @map("checkpoint_ns")
  checkpointId  String   @map("checkpoint_id")

  taskId        String   @map("task_id")
  taskPath      String   @default("") @map("task_path")
  idx           Int

  // Serialized write data
  channel       String
  value         Bytes

  createdAt     DateTime @default(now()) @map("created_at")

  @@unique([threadId, checkpointNs, checkpointId, taskId, idx])
  @@index([threadId])
  @@map("langgraph_checkpoint_writes")
}
```

### 2. Python Implementation

```python
# apps/ai-service/src/ai_service/agent_runtime/database_checkpointer.py

from langgraph.checkpoint.base import BaseCheckpointSaver, CheckpointTuple
from langgraph.checkpoint import Checkpoint, CheckpointMetadata
from typing import Iterator, Any, Sequence
from langchain_core.runnables import RunnableConfig

from .ts_checkpoint_client import TSCheckpointClient


class DatabaseCheckpointSaver(BaseCheckpointSaver):
    """LangGraph checkpointer that persists to database via TS API.

    This enables durable resume across process restarts and multi-instance
    deployments.
    """

    def __init__(self, client: TSCheckpointClient):
        super().__init__()
        self.client = client

    def get_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        """Fetch checkpoint tuple from database."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"].get("checkpoint_id")

        # Call TS API to fetch checkpoint
        checkpoint_data = asyncio.run(
            self.client.get_langgraph_checkpoint(
                thread_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=checkpoint_id,
            )
        )

        if not checkpoint_data:
            return None

        # Deserialize checkpoint
        checkpoint = self.serde.loads(checkpoint_data["checkpointData"])
        metadata = checkpoint_data["metadataData"]

        return CheckpointTuple(
            config=config,
            checkpoint=checkpoint,
            metadata=metadata,
            parent_config=self._build_parent_config(checkpoint_data),
        )

    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: dict,
    ) -> RunnableConfig:
        """Store checkpoint to database."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")

        # Serialize checkpoint
        checkpoint_data = self.serde.dumps(checkpoint)

        # Call TS API to store
        asyncio.run(
            self.client.put_langgraph_checkpoint(
                thread_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=checkpoint["id"],
                parent_checkpoint_id=checkpoint.get("parent_id"),
                checkpoint_data=checkpoint_data,
                metadata_data=metadata,
                channel_versions=new_versions,
            )
        )

        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint["id"],
            }
        }

    def put_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        """Store intermediate writes."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]

        # Serialize writes
        serialized_writes = [
            {
                "channel": channel,
                "value": self.serde.dumps(value),
                "idx": idx,
            }
            for idx, (channel, value) in enumerate(writes)
        ]

        # Call TS API
        asyncio.run(
            self.client.put_langgraph_writes(
                thread_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=checkpoint_id,
                task_id=task_id,
                task_path=task_path,
                writes=serialized_writes,
            )
        )

    def list(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> Iterator[CheckpointTuple]:
        """List checkpoints."""
        # Implementation...
        pass
```

### 3. TS API Implementation

```typescript
// packages/ai/src/controllers/langgraph-checkpoint.controller.ts

export class LangGraphCheckpointController {
  constructor(private readonly checkpointPort: ILangGraphCheckpointPort) {}

  async getCheckpoint(input: GetLangGraphCheckpointInput): Promise<LangGraphCheckpointData | null> {
    return this.checkpointPort.get(input);
  }

  async putCheckpoint(input: PutLangGraphCheckpointInput): Promise<void> {
    await this.checkpointPort.put(input);
  }

  async putWrites(input: PutLangGraphWritesInput): Promise<void> {
    await this.checkpointPort.putWrites(input);
  }

  async listCheckpoints(input: ListLangGraphCheckpointsInput): Promise<LangGraphCheckpointData[]> {
    return this.checkpointPort.list(input);
  }
}

// Prisma adapter
export class LangGraphCheckpointPrismaAdapter implements ILangGraphCheckpointPort {
  constructor(private readonly prisma: PrismaClient) {}

  async get(input: GetLangGraphCheckpointInput): Promise<LangGraphCheckpointData | null> {
    const checkpoint = await this.prisma.langGraphCheckpoint.findUnique({
      where: {
        threadId_checkpointNs_checkpointId: {
          threadId: input.threadId,
          checkpointNs: input.checkpointNs || '',
          checkpointId: input.checkpointId,
        },
      },
    });

    if (!checkpoint) return null;

    return {
      checkpointId: checkpoint.checkpointId,
      parentCheckpointId: checkpoint.parentCheckpointId,
      checkpointData: checkpoint.checkpointData,
      metadataData: checkpoint.metadataData as any,
      channelVersions: checkpoint.channelVersions as any,
    };
  }

  async put(input: PutLangGraphCheckpointInput): Promise<void> {
    await this.prisma.langGraphCheckpoint.upsert({
      where: {
        threadId_checkpointNs_checkpointId: {
          threadId: input.threadId,
          checkpointNs: input.checkpointNs || '',
          checkpointId: input.checkpointId,
        },
      },
      create: {
        threadId: input.threadId,
        checkpointNs: input.checkpointNs || '',
        checkpointId: input.checkpointId,
        parentCheckpointId: input.parentCheckpointId,
        checkpointData: input.checkpointData,
        metadataData: input.metadataData,
        channelVersions: input.channelVersions,
      },
      update: {
        checkpointData: input.checkpointData,
        metadataData: input.metadataData,
        channelVersions: input.channelVersions,
      },
    });
  }

  // ... other methods
}
```

### 4. Integration

```python
# apps/ai-service/src/ai_service/agent_runtime/checkpoint_factory.py

def build_checkpointer(
    *,
    settings: Settings,
    name: str,
) -> BaseCheckpointSaver:
    """Create the configured LangGraph checkpointer.

    Strategy:
    - "local": InMemorySaver (for local development)
    - "ts": DatabaseCheckpointSaver (for production)
    """
    strategy = settings.agent_checkpoint_strategy.lower()

    if strategy == "ts":
        # Use database checkpointer for durable resume
        client = TSCheckpointClient(
            base_url=settings.ts_api_base_url,
            service_secret=settings.service_secret,
        )
        return DatabaseCheckpointSaver(client)

    # Default: InMemorySaver for local development
    return InMemorySaver()
```

---

## 实施步骤

### Phase 1: Schema & Migration (4-6 hours)

1. ✅ 设计 Prisma schema（2 tables）
2. ✅ 生成 migration SQL
3. ✅ 运行 migration
4. ✅ 验证 schema

### Phase 2: TS Implementation (6-8 hours)

1. ✅ Port 接口定义
2. ✅ Prisma adapter 实现
3. ✅ Controller 实现
4. ✅ Routes 实现
5. ✅ 单元测试

### Phase 3: Python Implementation (8-10 hours)

1. ✅ `DatabaseCheckpointSaver` 类
2. ✅ `TSCheckpointClient` 扩展（新增 LangGraph endpoints）
3. ✅ 序列化/反序列化逻辑
4. ✅ `checkpoint_factory` 集成
5. ✅ 单元测试

### Phase 4: Integration & Validation (4-6 hours)

1. ✅ E2E 测试：跨进程 resume
2. ✅ 多实例测试
3. ✅ 性能测试
4. ✅ 文档更新

**总计**: 22-30 hours (2.5-4 天)

---

## 验收标准

1. ✅ 服务重启后可 resume interrupted run
2. ✅ 多实例间可恢复彼此的 runs
3. ✅ Resume 不再返回 409（成功继续执行）
4. ✅ Checkpoint 数据完整持久化
5. ✅ 测试覆盖：单元 + 集成 + E2E

---

## 风险与依赖

**风险**:

- LangGraph checkpoint 序列化可能遇到边缘情况
- 数据库 schema 需要支持复杂的 checkpoint 结构
- 性能：每次 graph 执行可能产生多个 checkpoint

**依赖**:

- Prisma migration 能力
- TS API 可用性
- LangGraph 版本兼容性

---

## 替代方案

### 选项 A: 使用 LangGraph 官方 PostgresSaver

**优点**:

- 官方维护，稳定性高
- 文档完善

**缺点**:

- 需要直接数据库连接（绕过 TS API）
- 不符合当前架构（Python 不直接写库）

### 选项 B: 当前方案（推荐）

**优点**:

- 符合当前架构（TS controlled boundary）
- 灵活性高
- 可与现有 checkpoint 表共存

**缺点**:

- 需要自己实现和维护

---

## 后续工作

完成后可考虑：

1. PowerSync adapter（离线支持）
2. Checkpoint 压缩/归档策略
3. 跨 thread 迁移工具

---

**创建者**: Claude Opus 4.8  
**预估完成时间**: 2.5-4 天  
**建议优先级**: Medium（当前系统已可用，这是增强功能）
