> Superseded by `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`. 本文仅保留为 P0-1 阶段实现计划归档。

# P0-1 澄清式 Goal 创建 实现计划

**状态**：实现中  
**优先级**：P0 (基础产品流)  
**技术方案**：Route 2 - Unified AI Workflow Orchestrator  
**负责人**：Copilot  
**创建日期**：2026-04-28

---

## 任务概述

在用户直接生成 goal draft 之前，增加一个 **clarification 阶段**：

- 系统先判断用户输入的信息是否足够
- 信息不足时返回 2-4 个澄清问题（而不是立刻出 draft）
- 用户回答后，信息并入下一轮规划
- 切换会话或刷新页面时，澄清状态可恢复

### 验收标准

- ✅ 用户输入模糊 idea 时，系统不会直接生成 draft
- ✅ 前端能显示澄清问题列表并收集回答
- ✅ 回答补充后可以继续生成 goal draft
- ✅ 切换会话或刷新页面时，澄清状态可恢复

---

## 架构分析

### 数据流

```
用户输入 → AIChatView (前端)
  ↓
generateGoalDraftFromConversation()
  ↓
AIClientService.generateGoal()
  ↓
POST /api/ai/goal-planning
  ↓
backend-automation-tool-executor (API)
  ├─ 第1阶段：调用 goal_planning_service.clarify()
  │  ↓
  │  Python LLM → 是否需要澄清？
  │  ↓
  │  响应：{ state: "clarification", questions: [...] }
  │         或 { state: "draft", goal: {...} }
  │
  └─→ 返回前端

前端根据 state 分叉：
  - state="clarification" → 显示澄清问题 UI
  - state="draft" → 显示 goal draft 卡片
```

### 分层改动

```
Python (ai-service) 底层
  ├─ 新增 Schema：ClarificationQuestion, GoalClarificationLLMResponse
  ├─ 扩展 GoalPlanningResponse：支持 state="clarification" | "draft"
  ├─ 新增方法：clarify() - 判断是否需要澄清
  └─ 新增方法：plan_with_clarification() - 两阶段流程

API 路由（apps/api）
  └─ 修改 generateGoalDraft 处理器，路由澄清逻辑

TS 应用层（packages/ai）
  └─ 扩展 AIClientService.generateGoal() 签名

Vue 前端（packages/app-vue）
  ├─ 新增澄清问题 UI 卡片
  ├─ 扩展状态管理（澄清问题、回答、阶段）
  └─ 修改 localStorage 持久化
```

---

## 分阶段任务清单

### 阶段 1：Python 澄清逻辑（底层）

**目标**：验证澄清逻辑和提示词效果

**改动文件**：

- `apps/ai-service/src/ai_service/schemas/goals.py`
- `apps/ai-service/src/ai_service/services/goal_planning_service.py`

**具体任务**：

- [ ] **goals.py**: 添加 `ClarificationQuestion` schema
- [ ] **goals.py**: 添加 `GoalClarificationLLMResponse` schema
- [ ] **goals.py**: 扩展 `GoalPlanningResponse` 支持两种状态
- [ ] **goals.py**: 扩展 `GoalPlanningRequest` 支持新参数
- [ ] **goal_planning_service.py**: 实现 `build_goal_clarification_system_prompt()`
- [ ] **goal_planning_service.py**: 实现 `build_goal_clarification_user_prompt()`
- [ ] **goal_planning_service.py**: 实现 `parse_clarification_payload()`
- [ ] **goal_planning_service.py**: 实现 `GoalPlanningService.clarify()` 方法
- [ ] **goal_planning_service.py**: 实现 `GoalPlanningService.plan_with_clarification()` 方法
- [ ] **goal_planning_service.py**: 更新 imports
- [ ] 运行 Python 单元测试验证

**参考**：详见 `p0-1-python-implementation-guide.md`

**完成标准**：

- 提示词可靠（澄清判断准确率 >90%）
- schema 验证通过
- Python 测试全部绿灯

---

### 阶段 2：API 路由和包装（中层）

**目标**：前后端通信通畅

**改动文件**：

- `apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`
- `packages/ai/src/application-client/ai-client-service.ts`

**具体任务**：

- [ ] 修改 `backend-automation-tool-executor.adapter.ts`
  - [ ] 添加澄清判断逻辑（根据 `enableClarification` 参数）
  - [ ] 路由调用 `goal_planning_service.clarify()` 或 `plan_with_clarification()`
  - [ ] 正确处理两种响应状态

- [ ] 扩展 `AIClientService.generateGoal()` 方法签名
  - [ ] 新增参数：`enableClarification?: boolean`
  - [ ] 新增参数：`clarificationAnswers?: string[]`
  - [ ] 返回值支持两种状态（通过 response payload）

- [ ] 测试 API 端点（curl 或 Postman）

**完成标准**：

- API 端点兼容两种请求
- 响应格式清晰（state 字段有效）
- curl 测试通过

---

### 阶段 3：前端集成（表现层）

**目标**：完整的用户工作流

**改动文件**：

- `packages/app-vue/src/modules/ai/views/AIChatView.vue`

**具体任务**：

- [ ] 在 AIChatView 中新增状态 ref
  - [ ] `goalClarificationRequired`
  - [ ] `goalClarificationQuestions`
  - [ ] `goalClarificationAnswers`
  - [ ] `goalClarificationLoading`
  - [ ] `goalWorkflowStage`

- [ ] 改进 `generateGoalDraftFromConversation()` 函数
  - [ ] 第一阶段：检查是否需要澄清
  - [ ] 第二阶段：根据结果决定显示问题或 draft

- [ ] 新增 `submitGoalClarifications()` 方法
  - [ ] 收集用户回答
  - [ ] 继续生成 draft

- [ ] 添加澄清问题 UI 卡片
  - [ ] 显示问题列表
  - [ ] 输入框收集答案
  - [ ] "继续"和"跳过"按钮

- [ ] 修改 localStorage 持久化逻辑
  - [ ] 扩展 `PersistedWorkflowEntry` schema
  - [ ] 修改 `snapshotWorkflowEntry()` 保存澄清状态
  - [ ] 修改 `restoreWorkflowState()` 恢复澄清状态

- [ ] 手动测试工作流完整性

**完成标准**：

- 模糊 idea 触发澄清问题显示
- 填写答案后继续生成 draft
- 刷新页面澄清状态恢复

---

### 阶段 4：测试和优化

**目标**：质量保证

**具体任务**：

- [ ] 端到端流程测试
  - [ ] 测试各种 idea 类型（模糊 / 清晰）
  - [ ] 验证澄清问题是否合理
  - [ ] 验证答案是否正确融合

- [ ] localStorage 恢复测试
  - [ ] 刷新页面澄清问题恢复
  - [ ] 切换会话后恢复正确

- [ ] 错误处理测试
  - [ ] 澄清 API 失败
  - [ ] 网络超时
  - [ ] 模型返回错误格式

- [ ] UI 细节打磨
  - [ ] 文案确认
  - [ ] 样式检查
  - [ ] 无障碍测试

- [ ] 集成到现有测试套件
  - [ ] E2E 测试
  - [ ] 单元测试

**完成标准**：

- 全部测试用例通过
- 可以提交 PR

---

## 关键改动清单

### Python 后端

**文件**: `apps/ai-service/src/ai_service/schemas/goals.py`

```python
# 新增
class ClarificationQuestion(BaseModel): ...
class GoalClarificationLLMResponse(BaseModel): ...

# 扩展
class GoalPlanningResponse:
    state: Literal["clarification", "draft"]
    goal: PlannedGoal | None
    clarification: GoalClarificationLLMResponse | None

class GoalPlanningRequest:
    enable_clarification: bool = True
    clarification_answers: list[str] | None = None
```

**文件**: `apps/ai-service/src/ai_service/services/goal_planning_service.py`

```python
# 新增方法
async def clarify(...) -> GoalPlanningResponse: ...
async def plan_with_clarification(...) -> GoalPlanningResponse: ...

# 新增提示词构建函数
def build_goal_clarification_system_prompt() -> str: ...
def build_goal_clarification_user_prompt(...) -> str: ...
def parse_clarification_payload(content: str) -> GoalClarificationLLMResponse: ...
```

### 前端 Vue

**文件**: `packages/app-vue/src/modules/ai/views/AIChatView.vue`

```typescript
// 新增状态
const goalClarificationRequired = ref(false)
const goalClarificationQuestions = ref<...>([])
const goalClarificationAnswers = ref<string[]>([])
const goalClarificationLoading = ref(false)
const goalWorkflowStage = ref<GoalWorkflowStage>('input')

// 改进函数
async function generateGoalDraftFromConversation(skipClarification?: boolean): ...
async function submitGoalClarifications(answers: string[]): ...

// 扩展持久化
type PersistedWorkflowEntry = {
  ...
  goalClarificationQuestions?: [...]
  goalClarificationAnswers?: string[]
  goalWorkflowStage?: GoalWorkflowStage
}
```

---

## 实现时间估算

| 阶段     | 任务            | 估计      | 备注             |
| -------- | --------------- | --------- | ---------------- |
| 1        | Python 澄清逻辑 | 2-3h      | 包括提示词测试   |
| 2        | API 路由        | 1-2h      | 路由逻辑相对简单 |
| 3        | 前端集成        | 2-3h      | UI + 状态管理    |
| 4        | 测试优化        | 1-2h      | E2E 和手工测试   |
| **总计** |                 | **6-10h** | 可中断，分天完成 |

---

## 风险评估

### 低风险

- 澄清逻辑隔离，不影响现有 plan() 方法
- API 层只是新增端点，不改现有接口
- localStorage 扩展向后兼容

### 中风险

- 前端状态管理复杂，需要仔细测试状态转换
- 澄清提示词可能需要多次迭代优化
- 两阶段 LLM 调用增加 token 成本

### 缓解措施

- 新增方法与现有代码隔离（不改现有逻辑）
- 澄清检查可选（enableClarification 参数）
- 提示词有明确的输出 schema（JSON 格式）

---

## 相关文档

- **深度分析**：
  - `code-review-python.md` - Python 层详细审查
  - `code-review-frontend.md` - 前端详细审查

- **实现指南**：
  - `p0-1-python-implementation-guide.md` - Python 逐步编码指南
  - `p0-1-frontend-implementation-guide.md` - 前端逐步编码指南（待生成）

- **参考**：
  - `route-2-unified-ai-workflow-orchestrator-plan.md` - 技术方案背景
  - `memoflow-ai-goal-learning-guide.md` - 学习指南

---

## 依赖关系

```
p01-python-clarification
  ↓ (需要 Python 完成)
p01-api-routing
  ↓ (需要 API 完成)
p01-ts-client
  ↓ (需要 TS 应用层完成)
p01-vue-ui
  ↓ (需要前端完成)
p01-state-persistence
  ↓ (需要整体完成)
P0-1 完成 ✅
```

---

## 后续 P0 项目

完成 P0-1 后，推荐顺序：

1. **P0-2**: Draft / Plan / Execute 三阶段 UI 分层
2. **P0-3**: Goal Draft 与 Execution Plan 字段对齐
3. **P0-4**: 显式展示"为什么这样规划"

之后进入 P1（Unified AI Workflow Orchestrator）。

---

## 快速开始

选择下面其中一条路径：

### 路径 A：立即编码

1. 打开 `p0-1-python-implementation-guide.md`
2. 按 5 个步骤逐步执行 Python 改动
3. 运行测试验证

### 路径 B：先深入理解

1. 阅读 `code-review-python.md` 和 `code-review-frontend.md`
2. 理解完整的数据流和状态管理
3. 再开始编码

### 路径 C：分块并行

1. 一人做 Python（阶段 1）
2. 另一人做前端设计（阶段 3 的 UI）
3. 整合 API 层（阶段 2）

---

**最后更新**：2026-04-28  
**状态**：进行中  
**下一步**：执行 Python 实现阶段
