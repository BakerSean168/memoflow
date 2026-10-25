# Checkpoint 持久化收口方案

**日期**: 2026-06-13  
**状态**: Active  
**优先级**: High

## 问题分析

Code review 发现当前 checkpoint 实现虽然代码完整，但正式链路还未收口，存在以下问题：

### 🔴 High Priority

#### 1. 主运行时仍硬编码 file-backed checkpoint

**位置**: `apps/ai-service/src/ai_service/app.py:99`

**问题**:

- 注释写明 "For now, we use the legacy builder"
- 实际构造仍调用 `build_file_backed_*` 而非 `build_checkpointer/build_run_history_store`
- 虽然 `checkpoint_factory.py` 已实现策略切换（local/ts），但主 wiring 未接入

**影响**:

- 环境变量 `AGENT_CHECKPOINT_STRATEGY=ts` 无效
- 无法切换到 database checkpoint
- 多实例部署无法共享状态

#### 2. TSCheckpointAdapter 的 async/sync 不兼容

**位置**: `apps/ai-service/src/ai_service/agent_runtime/ts_checkpoint_adapter.py:52, 74, 104`

**问题**:

```python
def list_runs(self) -> list[AgentRun]:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(self.client.list_checkpoints())
    else:
        raise RuntimeError("Cannot call list_runs from within an event loop.")
```

- `list_runs()`, `get_result_by_thread_id()`, `thread_index()` 在 event loop 中会直接抛错
- 但 FastAPI 路由是 async 的（`routes/agents.py:332, 457`）
- Runtime 的 fallback 逻辑也是同步调用（`runtime.py:263, 306`）

**影响**:

- 无法在 async 上下文中恢复 checkpoint
- 重启恢复链路不可用
- 多实例部署会崩溃

### 🟡 Medium Priority

#### 3. TS checkpoint 会丢失 events 和 interrupts

**位置**:

- `apps/ai-service/src/ai_service/agent_runtime/ts_checkpoint_client.py:39`
- `packages/ai/src/application-server/ports/agent-checkpoint.port.ts:10`
- `packages/ai/src/infrastructure-server/adapters/prisma/agent-checkpoint-prisma.adapter.ts:23`

**问题**:

- Python client 只上传 `run`, `state`, `threadId`
- TS port 接口也只定义了这些字段
- Prisma adapter 把 `events` 和 `interrupts` 写死为空数组：
  ```typescript
  events: [], // TODO: 从 Python 接收并持久化
  interrupts: [], // TODO: 从 Python 接收并持久化
  ```
- 但数据库 schema 已有这些列（`packages/database/prisma/schema/ai.prisma:191`）

**影响**:

- Approval/execution 等中断态恢复后丢失历史事件
- 无法追溯 agent 执行历史
- 降低可观测性

#### 4. 测试断言不一致 ✅ FIXED

**位置**: `apps/ai-service/tests/test_agent_runtime_routes.py:968`

**问题**:

- Implementation 已将 `duplicateRisk` 算成 `none/low/medium/high`
- Unit test 按 `none` 断言
- 但 route test 还在断言 `unknown`

**状态**: ✅ 已修复，改为断言 `"none"`

---

## 修复方案

### Phase 1: 接入策略工厂（High Priority）

**目标**: 让主运行时使用 `checkpoint_factory` 的策略切换机制

**步骤**:

1. **修改 `app.py` 的 runtime 构造**:

   ```python
   # Before (legacy):
   checkpointer = build_file_backed_saver(
       checkpoint_dir=settings.agent_checkpoint_dir,
       name="goal_create",
   )
   run_history_store = build_file_backed_run_history_store(
       checkpoint_dir=settings.agent_checkpoint_dir,
       name="goal_create",
   )

   # After (strategy-aware):
   from ai_service.agent_runtime.checkpoint_factory import (
       build_checkpointer,
       build_run_history_store,
   )

   checkpointer = build_checkpointer(
       settings=settings,
       name="goal_create",
   )
   # Note: identity_id 在请求时提供，这里暂用 None（local 策略不需要）
   run_history_store = build_run_history_store(
       settings=settings,
       name="goal_create",
       identity_id=None,  # For 'ts' strategy, needs per-request factory
   )
   ```

2. **处理 identity_id 依赖问题**:
   - `ts` 策略需要 `identity_id`，但 runtime 在启动时构造
   - **方案 A（推荐）**: Runtime 延迟构造 run_history_store
     - 在 `start_run()` 时根据 `identity_id` 创建
     - 存储在 runtime 的 `_run_history_stores: dict[str, AgentRunHistoryPort]` 缓存中
   - **方案 B**: 使用 factory pattern，runtime 持有 factory 函数而非实例

3. **更新所有 Agent runtime**:
   - `GoalCreateAgentRuntime`
   - `KnowledgeQAAgentRuntime`
   - `KnowledgeGenerateAgentRuntime`

**验证**:

- 设置 `AGENT_CHECKPOINT_STRATEGY=local`，测试通过
- 设置 `AGENT_CHECKPOINT_STRATEGY=ts`（mock TS API），测试通过
- 确认环境变量生效

---

### Phase 2: 修复 TSCheckpointAdapter async 问题（High Priority）

**目标**: 让 TSCheckpointAdapter 在 async 上下文中可用

**根因**:

- FastAPI 路由天然是 async
- Runtime 在 async 路由中调用同步方法 `list_runs()`
- 当前实现检测到 event loop 就抛错

**方案**:

#### 选项 A: 使用 asyncio.to_thread()（推荐）

```python
def list_runs(self) -> list[AgentRun]:
    """List all runs for the current identity."""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No event loop: 直接用 asyncio.run
        return asyncio.run(self.client.list_checkpoints())
    else:
        # Event loop running: 委托到线程池
        return loop.run_until_complete(
            asyncio.to_thread(
                asyncio.run,
                self.client.list_checkpoints()
            )
        )
```

**优点**:

- 保持同步接口契约（`AgentRunHistoryPort` 是同步的）
- 在 async 上下文中不会崩溃
- 利用线程池避免阻塞 event loop

**缺点**:

- 线程池开销（但 checkpoint 操作不是热路径）

#### 选项 B: 重构为 async port（激进）

- 将 `AgentRunHistoryPort` 改为 async 接口
- Runtime 的所有调用点改为 await
- File-backed 实现用 `aiofiles`

**优点**:

- 正统的 async 设计
- 更好的性能

**缺点**:

- 改动面大
- File-backed 实现也需改造
- 不适合当前阶段

**推荐**: 选项 A，短期内收口；长期可考虑选项 B 重构

**需修改的方法**:

- `list_runs()` - 被 `routes/agents.py:332` 调用
- `get_result_by_thread_id()` - 被 `runtime.py:263` 调用
- `thread_index()` - 被 `runtime.py:306` 调用

---

### Phase 3: 补全 events/interrupts 持久化（Medium Priority）

**目标**: 让 TS checkpoint 保存完整的 run state

**步骤**:

1. **扩展 TS port 接口**:

   ```typescript
   // packages/ai/src/application-server/ports/agent-checkpoint.port.ts
   export interface AgentCheckpointUpsertInput {
     identityId: string;
     run: AgentRun;
     state?: AgentState;
     threadId?: string;
     events?: AgentEvent[]; // 新增
     interrupts?: AgentInterrupt[]; // 新增
     requestId?: string;
   }
   ```

2. **修改 Prisma adapter 实现**:

   ```typescript
   // packages/ai/src/infrastructure-server/adapters/prisma/agent-checkpoint-prisma.adapter.ts
   async upsert(input: AgentCheckpointUpsertInput): Promise<void> {
     await this.prisma.agentRunCheckpoint.upsert({
       where: { runId: input.run.runId },
       update: {
         // ...
         events: input.events ?? [], // 使用传入值
         interrupts: input.interrupts ?? [],
       },
       create: {
         // ...
         events: input.events ?? [],
         interrupts: input.interrupts ?? [],
       },
     });
   }
   ```

3. **修改 Python client 上传**:

   ```python
   # apps/ai-service/src/ai_service/agent_runtime/ts_checkpoint_client.py
   async def upsert_checkpoint(
       self,
       *,
       run: AgentRun,
       state: AgentState | None = None,
       thread_id: str | None = None,
       events: list[AgentEvent] | None = None,        # 新增
       interrupts: list[AgentInterrupt] | None = None, # 新增
   ) -> None:
       payload = {
           "run": run.model_dump(mode="json"),
           "state": state.model_dump(mode="json") if state else None,
           "threadId": thread_id,
           "events": [e.model_dump(mode="json") for e in events] if events else [],
           "interrupts": [i.model_dump(mode="json") for i in interrupts] if interrupts else [],
       }
       # ...
   ```

4. **修改 TSCheckpointAdapter 调用点**:
   ```python
   # apps/ai-service/src/ai_service/agent_runtime/ts_checkpoint_adapter.py
   def save_result(self, result: AgentRunResult) -> None:
       # ...
       loop.create_task(
           self.client.upsert_checkpoint(
               run=result.run,
               state=result.state,
               thread_id=result.run.thread_id,
               events=result.events,       # 新增
               interrupts=result.interrupts, # 新增
           )
       )
   ```

**验证**:

- 创建 run → approval → resume，检查数据库 `events` 列
- 确认 approval interrupt 被持久化

---

## 实施优先级

### 立即执行（本次提交）

- [x] ✅ 修复测试断言不一致（`duplicateRisk`）

### 下一步（推荐顺序）

1. **Phase 2**: 修复 TSCheckpointAdapter async 问题（30 分钟）
   - 阻塞问题，影响 ts 策略可用性
   - 改动局限，风险低

2. **Phase 1**: 接入策略工厂（1 小时）
   - 让环境变量生效
   - 需要仔细处理 identity_id 依赖

3. **Phase 3**: 补全 events/interrupts（1 小时）
   - 增强功能完整性
   - 对当前流程无阻塞影响

### 总预估时间: 2.5 小时

---

## 验证清单

完成后需验证：

- [ ] 本地开发（`AGENT_CHECKPOINT_STRATEGY=local`）：
  - [ ] Goal Agent 流程完整
  - [ ] Knowledge Q&A 正常
  - [ ] Knowledge Generate 正常
  - [ ] 所有测试通过

- [ ] TS checkpoint 策略（`AGENT_CHECKPOINT_STRATEGY=ts`）：
  - [ ] Mock TS API 环境下测试通过
  - [ ] 不在 async context 中抛错
  - [ ] events/interrupts 持久化到数据库
  - [ ] 重启后能恢复 run

- [ ] 类型检查：
  - [ ] Python mypy 通过
  - [ ] TypeScript tsc 通过

- [ ] 测试覆盖：
  - [ ] 补充 TSCheckpointAdapter 单元测试
  - [ ] 补充 AgentCheckpointPrismaAdapter 单元测试

---

## 风险评估

| 风险                                   | 级别   | 缓解措施                                |
| -------------------------------------- | ------ | --------------------------------------- |
| identity_id 依赖导致 ts 策略无法初始化 | Medium | 采用延迟构造或 factory pattern          |
| asyncio.to_thread() 性能影响           | Low    | Checkpoint 不在热路径，可接受           |
| events/interrupts 序列化兼容性         | Low    | 已有 AgentEvent contract，schema 已定义 |
| 破坏现有 file-backed 流程              | Low    | 保留 legacy builder 作为 fallback       |

---

## 后续优化（非必需）

1. **长期重构**: 将 `AgentRunHistoryPort` 改为 async 接口
2. **性能优化**: TS checkpoint 的 `get_result_by_thread_id` 需全量查询，考虑增加 API endpoint
3. **可观测性**: 为 checkpoint 操作增加 metrics（save/load latency）
4. **测试补充**: 增加多实例并发写入的 E2E 测试

---

## 总结

当前实现的核心功能（Goal Agent、Knowledge Q&A、Knowledge Generation）已完整且经过验证。但 checkpoint 持久化这条线需要收口：

- **本质问题**: 正式链路（TS checkpoint 策略）还未打通
- **表面现象**: 虽然代码完整，但主 wiring 未接入，async 适配有缺陷
- **修复路径**: 3 个 phase，共 2.5 小时，风险可控

完成后，系统将真正支持：

- ✅ 单实例部署（file-backed，已可用）
- ✅ 多实例部署（database checkpoint，修复后可用）
- ✅ 优雅重启恢复
- ✅ 完整的 run 历史和事件追溯
