# MemoFlow 接入术语

本词汇表记录外部 Agent 接入涉及的 MemoFlow 概念；现有各 owner 的完整模型仍见其正式领域文档。

## 业务对象

**Goal**：用户希望达成的目标，包含目标生命周期和 Key Result。

**TaskPlan**：任务的长期定义，包含执行安排、清单定义及目标关联。
_Avoid_：用“完成 TaskPlan”表达完成某一次任务。

**TaskOccurrence**：TaskPlan 的一次具体执行，具有独立的完成结果。

**RoutineDefinition**：用户希望形成或维持的行为节律定义。
_Avoid_：把已退役的 ReminderTemplate 当作新接入的业务对象。

**提醒意图**：附着于真实业务 owner 的时间提醒需求；它不意味着存在独立的 Reminder CRUD 产品。

## 外部接入

**MemoFlow Agent Capability**：由真实业务 owner 提供、可被 Agent 调用的一项明确业务操作。
_Avoid_：把 capability 当作新的业务真值 owner。

**External Agent Connection**：用户授予某个外部 Agent 客户端的、可以撤销的 MemoFlow 访问关系。
_Avoid_：与 MemoFlow 内部的 AI Provider Connection 混用。

**Agent Grant**：一项 External Agent Connection 当前被允许执行的能力范围。

**Agent Mutation Receipt**：一次外部 Agent 写入的确定结果，说明哪些业务对象已经改变。

**Assisted Workflow**：用户明确选择由 MemoFlow 帮助规划、澄清及应用结果的长期工作过程。
_Avoid_：将每次外部 Agent 的确定性操作都包装为 Assisted Workflow。
