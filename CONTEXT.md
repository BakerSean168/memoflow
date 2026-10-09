# MemoFlow 术语

本词汇表记录跨模块协作涉及的 MemoFlow 概念；现有各 owner 的完整模型仍见其正式领域文档。

## 身份与资料空间

**Desktop Profile**：某台设备上独立的本地资料空间，有自己的名称、本地访问保护和业务资料。
_Avoid_：与 Account 的个人资料、Routine Profile 或云端登录会话混用。

**访客 Profile（Guest Profile）**：没有绑定云端身份、可以完全离线使用的持久本地资料空间。
_Avoid_：匿名云端用户、临时试用会话。

**云端 Profile（Registered Profile）**：绑定一个云端身份的本地资料空间；云端连接失效不改变其本地资料空间的身份。

**云端身份（Cloud Identity）**：MemoFlow 云端识别同一个用户的身份；邮箱或 GitHub 是访问该身份的登录方式。
_Avoid_：用登录方式、邮箱文本或第三方平台账号替代云端身份。

**Account 个人资料（Account Profile）**：用户的昵称、头像、自我介绍等产品资料，属于 Account，与 Desktop Profile 这个资料容器不同。

**访客复制导入（Guest Copy Import）**：把选定访客 Profile 中明确支持的资料复制给目标云端身份；源资料空间保持独立，删除源空间是另一个结果。
_Avoid_：原地升级访客、静默合并账户、完整设备备份恢复。

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
