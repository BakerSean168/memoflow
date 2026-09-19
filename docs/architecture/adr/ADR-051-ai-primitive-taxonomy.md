---
tags:
  - adr
  - ai
  - agent
  - tool
  - workflow
  - skill
  - memory
  - context
description: AI vNext primitive taxonomy、Context/Memory 边界与能力选择规则
created: 2026-08-20T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-051: AI Primitive Taxonomy — Agent / Tool / Workflow / Skill / Memory / Context

> **2026-09-09 后续收敛：** 本 ADR 的 primitive taxonomy、Memory 非业务真值、Context trust/token-budget 方向继续有效；统一 `AIContextEnvelope`、`UserTimeContextPort` 接入、Knowledge stable identity 与 owner-contract reuse 由 ADR-098 细化，UI/runtime state ownership 由 ADR-096 细化。

**状态：** 已采纳  
**日期：** 2026-08-20  
**依赖：** ADR-050

## 1. 目的

MemoFlow 禁止再按“功能名字”随意创建 Agent、Tool、Workflow 或自研 service。选择 primitive 时看三个问题：

1. **谁拥有状态？**
2. **是否需要 durable resume？**
3. **是否需要模型做开放式判断？**

## 2. 决策表

| Primitive         | 何时使用                          | 是否持久状态                    | 是否允许 LLM 自主判断          | 示例                                           |
| ----------------- | --------------------------------- | ------------------------------- | ------------------------------ | ---------------------------------------------- |
| Agent             | 开放式理解、选择能力、动态推理    | thread/session/memory 由 Mastra | 是                             | `MemoFlow Assistant`                           |
| Worker Agent      | workflow 内需要专门模型判断       | run-scoped                      | 是                             | `GoalPlannerAgent`                             |
| Tool              | 一个有界 callable capability      | 不拥有 workflow 状态            | 参数选择可由 Agent，执行确定性 | `searchKnowledge`, `getGoal`, `createReminder` |
| Workflow          | 明确阶段、HITL、恢复、重试        | Mastra snapshot                 | 局部步骤可调用 Agent           | `goal.create`, `weekly.review`                 |
| Skill             | 可版本化指令/方法/模板/领域知识   | 文件/registry metadata          | 被 Agent 消费                  | Obsidian 写作规范、Goal 规划方法               |
| Memory            | 为未来 Agent turn 保留的交流/归纳 | Mastra Memory                   | 由 memory strategy 管理        | thread transcript、preference observation      |
| Context           | 当前 invocation 的临时输入        | 不作为独立事实持久化            | 只影响当前 run                 | 当前页面、selected Goal、retrieved notes       |
| Workspace         | 大规模文件/产物的隔离工作面       | provider-specific               | Agent 可操作但受权限约束       | Vault staging                                  |
| Runtime Objective | 长执行完成条件                    | Mastra runtime                  | 是                             | “整理到 judge 通过”                            |
| Product Goal      | 用户业务实体                      | MemoFlow Domain                 | 否                             | “今年通过 N1”                                  |

## 3. Agent 规则

### 3.1 一个 user-facing Assistant

首期只有一个用户可见 Agent：`MemoFlow Assistant`。Goal/Task/Knowledge 不是独立产品机器人。

### 3.2 Worker Agent 的升格条件

只有同时满足至少两项才创建 worker agent：

- 需要独立 system instructions；
- 需要不同 model/temperature/cost tier；
- 需要独立 eval dataset/scorer；
- 需要独立 tools/context budget；
- 任务包含开放式多轮自主推理。

否则优先普通 workflow step 或 tool。

### 3.3 Subagent

Subagent 只用于真正可委派的开放任务；不要把每个业务 module 包成 subagent。Subagent 不拥有产品 domain truth。

## 4. Tool 规则

Tool 必须：

- typed input/output schema；
- 单一语义；
- finite execution；
- 权限可判定；
- 不隐藏 durable multi-stage orchestration。

Tool 分类：

```text
query       -> 读业务事实，无外部持久副作用
mutation    -> 修改业务事实，必须走 Application Port
integration -> 调外部服务，但不自行变成业务 source of truth
orchestration -> 启动/查询 Workflow；自身不做业务 mutation
```

禁止创建 `execute_ai_action(payload:any)`、`run_business_operation(name,payload)` 等万能工具。

## 5. Workflow 规则

出现任一条件即优先 Workflow：

- 用户审批/clarification 后继续；
- 需要进程重启后恢复；
- 有多个确定阶段；
- mutation 前有 typed draft；
- partial failure/retry 必须确定性处理；
- 运行可能跨分钟/小时/设备。

Workflow snapshot 只存 JSON-serializable execution state，避免复制大量业务数据；优先保存 entity id/hash/reference。

## 6. Skill 规则

Skill 是“怎么做”的可版本化知识，不是 runtime state，不是 tool wrapper。

适合：

- Goal 规划原则；
- 周复盘方法；
- Obsidian note 风格/Frontmatter 约定；
- 某类知识整理流程的启发式规则。

不适合：

- API key；
- 用户真实业务数据；
- tool permission；
- scheduler state；
- database connection。

## 7. Memory 规则

Memory 只回答：**未来 turn 为了更好帮助用户，需要记住什么？**

允许：

- conversation history；
- 用户稳定偏好；
- 已完成工作的高层 observation；
- 当前长期任务的 agent working memory。

禁止作为 Memory 真值：

- Goal status；
- task completion；
- reminder next fire time；
- provider credential；
- billing balance；
- Vault 文件正文唯一副本。

这些必须在 product domain/source 中读取。

## 8. Context 规则

Context 是 per-invocation projection，由 runtime 动态组装：

```text
1. system safety + product invariant
2. workflow/skill instructions
3. authenticated user/runtime settings
4. current surface/entity selection
5. domain query results
6. retrieved knowledge/web/files (untrusted)
7. memory projection
```

每一项应具备 source/trust/sensitivity/token-budget metadata；低信任内容不能修改上层规则。

### Token budget

Context assembler 必须做预算，而不是把“能找到的都塞进去”。默认优先：当前任务必要 domain facts > selected entity > recent conversation > retrieved notes > historical extras。

## 9. Knowledge / Obsidian

正常知识操作使用 semantic tools：

```text
searchKnowledge
readKnowledgeNote
createKnowledgeNote
updateKnowledgeNote
moveKnowledgeNote
```

Desktop adapter 指向 Local Obsidian Vault；Web adapter 指向 repository/Git read model。Agent 默认不获得真实 Vault unrestricted filesystem。

大规模重构知识库时：

```text
snapshot/staging Workspace
 -> autonomous edits
 -> diff/change set
 -> human approval
 -> Knowledge Application Service apply
```

## 10. Reminder / Schedule

用户业务 Reminder/Habit schedule 永远属于 MemoFlow Reminder/Schedule domain。Mastra schedule 只用于 AI runtime 自己的周期任务（例如 eval、维护、AI weekly analysis trigger），不能替代产品 reminder source of truth。

## 11. Runtime Objective 命名

Mastra 的 Goal/Objective 与 MemoFlow Product Goal 语义冲突。MemoFlow 源码和文档统一称框架侧概念为 `AgentObjective`，禁止裸写 `Goal` 指代 Agent completion objective。

## 12. MCP 与外部集成

MCP 是 tool/resource transport，不是新的业务层。MCP tool 进入 Agent 前仍需经过相同的 permission、schema、data-location policy；不能因“来自 MCP”自动获得更高信任。

## 13. Eval 规则

每个 user-facing Agent、worker Agent、重要 Workflow 都必须拥有可回归的 eval target。Prompt/model/tool/skill version 是同一个 configuration bundle 的组成部分；promotion 必须比较业务质量、governance rejection、cost/latency，而不是只看单模型 benchmark。

## 14. 代码结构建议

```text
packages/ai/src/server/mastra/
  runtime/
  agents/
  workflows/
  tools/
  skills/
  memory/
  context/
  models/
  observability/
  evals/
```

Domain adapter 放在宿主/业务 module 合适位置，不把 Goal/Task/Reminder domain implementation 搬进 Mastra 目录。

## 15. 验收

- 新功能 PR 必须能明确说明选择了哪个 primitive 以及原因；
- 不再新增 `XxxAgent` 只为包一个 use case；
- 不把 workflow state 放进 Vue composable；
- 不把业务 truth 放进 Memory；
- 不把提示词方法论伪装成 Tool；
- 不把大规模文件写入直接指向真实 Vault；
- Context 有 token/trust 边界。
