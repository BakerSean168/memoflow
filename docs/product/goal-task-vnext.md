---
tags:
  - product
  - goal
  - task
  - vnext
  - ui
  - domain
description: Goal / Task vNext 的产品模型、页面信息架构、交互文案与跨模块闭环
created: 2026-08-25T14:28:00+08:00
updated: 2026-09-08T17:55:00+08:00
---

# Goal / Task vNext 产品设计

> **2026-09-08 Goal 后续设计：** 本文保留 2026-08-25 已实施版本的历史设计语义。Goal 的下一轮 accepted target design 已扩展为 `summary + Planned/InProgress + Target Timeframe + KR Measurement V3 + Goal Workspace + AI multi-entity plan`，详见 [Goal vNext active plan](../plan/active/2026-09-08-goal-vnext-model-convergence.md) 与 ADR-067～070。Task 的既有 vNext lifecycle/due/overdue 语义除 ADR-069 的 Goal-level link 外保持不变。

## 1. North Star

MemoFlow Goal / Task vNext 只保留两个清晰用户心智：

```text
Goal：我在努力实现什么？现在做到哪里了？
Task：我今天以及接下来具体要做什么？
```

领域关系：

```text
Goal
  -> Key Result
      -> Manual Measurement / Progress Record
      -> optional Task / Task Plan link
          -> optional Contribution Settlement
              -> GoalRecord
```

Goal 与 Task 独立可用，联合使用时自动闭环。

## 2. 核心对象

### 2.1 Goal

用户可见字段：

```text
title
description?
status
startDate?
dueDate?
labels[]
keyResults[]
```

系统字段：

```text
completedAt?
archivedAt?
version
createdAt
updatedAt
```

不再有：

```text
folder
category
parent goal
importance
priority score
custom color
focus mode
comparison
```

### 2.2 Key Result

默认用户可见：

```text
title
currentValue
targetValue
unit?
```

高级：

```text
progressBaselineValue?
aggregationMethod = Sum
weight = 3
```

不再有 Value Type。

### 2.3 Task

用户主心智是“任务”，不是 Template/Instance。

主字段：

```text
title
description?
date
time?
repeat?
labels[]
priority?
reminder?
checklist?
goalLink?
```

### 2.4 Repeating Task / Task Plan

仅当 Task 有 recurrence 时存在用户可见“重复设置/计划”概念：

```text
frequency
interval
daysOfWeek?
ends: never | date | occurrences
```

Task Plan 可以绑定 Goal/KR，并在 plan succeeded 后一次性 settlement。

### 2.5 Task occurrence outcome

Task instance/occurrence 只保存已确认的业务事实：

```text
Pending     outcome 仍未知
InProgress  已开始
Completed   确认完成
Missed      本次本来应该做，但确认没有完成
Skipped     本次被明确豁免/不适用
```

`Overdue` 不是持久化状态，而是：

```text
Pending/InProgress + due/window 已经过期
=> isOverdue = true
```

因此昨天的任务今天打开时仍可以补标 `Completed`；MemoFlow 不能因为“没有及时点击”自动推断现实里没做。

整个 Task Plan 再单独表达 lifecycle/outcome：

```text
lifecycle: Active | Paused | Closed
outcome:   Open | Succeeded | Failed | Abandoned
```

`Failed` 由 completion policy 判断成功已经不可能；`Abandoned` 是用户主动停止；Delete 只用于误创建。详见 ADR-057。

## 3. Shared Labels

Goal 与 Task 使用同一套 Label：

```text
#工作
#个人
#AI
#健康
#学习
#二课
```

创建时可即时创建。

系统视图与 Label 分离：

```text
Goal system views: 进行中 / 已完成 / 全部
Task system views: 今天 / 即将到来 / 全部 / 已完成
```

Label 多选默认 AND：

```text
#工作 + #AI
=> 同时包含两个标签
```

## 4. Goal List

### 4.1 Toolbar

只保留：

```text
[进行中 5 ▾] [标签 2 ▾]                         [+ 新建目标]
```

删除：

- Search；
- Refresh 常驻按钮；
- Focus；
- Folder；
- Compare；
- More menu 中的组织型功能。

网络刷新仍可由 query cache/reconnect/keyboard command 提供，不需要占据产品主操作位。

### 4.2 Goal Row

默认使用高密度 progress row，不以大 Card Grid 为主：

```text
完成 MemoFlow 0.11                                      64%
#工作 #AI                                  8月25日 -> 9月30日
████████████████░░░░░░
3 个关键结果 · 1 个已完成
```

可选状态提示：

```text
逾期
距离截止 5 天
已完成
```

不展示：

```text
Category
Avatar-like fake owner
Priority 83/100
custom color border
```

### 4.3 空状态

```text
还没有进行中的目标

目标用于记录你真正想达成的结果，并通过关键结果衡量进度。

[创建第一个目标]
```

## 5. 创建 / 编辑 Goal

不再需要“基本信息 / 关键结果”两个 Tab。

```text
创建目标
用清晰结果与时间定义目标

目标名称
[                                      ]

描述（可选）
[                                      ]

开始日期                    截止日期
[2026-08-25]                [2026-09-30]

标签
[#工作] [#AI] [+ 添加标签]

关键结果
--------------------------------
暂无关键结果
关键结果用来衡量这个目标是否真正达成。

[+ 添加关键结果]

                         取消   创建目标
```

中文统一使用“截止日期”，不再使用含义模糊的“目标日期”。

## 6. 添加 / 编辑 KR

### 6.1 默认表单

```text
添加关键结果

关键结果标题
[二课分达到毕业要求]

当前值                   目标值
[40]                     [50]

单位（可选）
[分]

▸ 高级设置

                         取消   添加
```

### 6.2 高级设置

```text
进度起点（可选）
[   ]
仅用于“75kg -> 70kg”这类 0% 起点不是自然 0 的目标。

计算方式
[累计 ▾]

对总目标进度的权重
[3]
1-5，相对影响；默认 3。
```

删除：

```text
值类型
低影响 / 中影响 / 高影响
权重百分比
```

### 6.3 无 KR 时

Goal 创建页绝不自动展开“第一个关键结果”特殊表单。

所有 KR 都从同一个 `+ 添加关键结果` 入口创建，避免首个 KR 与后续 KR 两套交互。

## 7. Goal Detail

Goal Detail 回答“方向、进度、事实来源”，不回答“今天该做什么”。

```text
← 目标

顺利完成大学毕业要求
#学习 #毕业
2026-09 -> 2027-06

整体进度 59%
██████████████░░░░░░░░
0 / 3 项要求已满足

关键结果
--------------------------------
完成毕业论文与答辩
0 / 1                              0%

修满毕业要求学分
154 / 160                         96%
███████████████████░

二课分达到毕业要求
40 / 50                           80%
████████████████░░░░
2 个关联活动正在进行               >

最近进展
--------------------------------
今天
植物观察打卡计划完成 · 15/15
二课分 40 -> 41

8月24日
手动记录学分 +2
152 -> 154

复盘
--------------------------------
8月20日
过去 7 天整体进度 +6%
[查看]

[添加复盘]
```

### 7.1 KR click

点击 KR 可以打开轻量 detail/drawer：

```text
current / target
progress
measurement history
linked task summary
```

不需要把裸 `weight=3` 放在默认详情主视觉。

### 7.2 Progress explain

如果用户点击 overall progress，可用 Popover 解释：

```text
论文      0% x 3
学分     96% x 3
二课分   80% x 3
```

不再维护独立 Progress Breakdown 页面。

## 8. Goal Record

### Sum

```text
记录进度
二课分达到毕业要求

本次增加
[1] 分

备注（可选）
[植物观察活动积分到账]
```

### Average / Max / Min / Last

```text
本次记录值
[73] kg
```

记录不是统一“增加值”。

## 9. Review

Review 从独立大表单改成 Goal Detail 的附属反思。

打开“添加复盘”：

```text
添加复盘

过去 7 天
整体进度 53% -> 59%

论文          0% -> 0%
学分         95% -> 96%
二课分       78% -> 80%

完成关联任务 8 次
新增进展记录 4 条

这段时间发生了什么？
[                                      ]

遇到了什么问题？
[                                      ]

下一阶段有什么调整？
[                                      ]

                          取消   保存复盘
```

删除：

```text
周/月/季/最终类型
评分
复盘标题
```

Review detail 可以使用 drawer/inline expansion，不强制独立 route。

## 10. Task Home

Task 首页从 TaskTemplate management 改为执行视图：

```text
任务                                             [+ 新建任务]

[今天 5] [即将到来] [全部] [已完成] [标签 ▾]

今天 · 8月25日
--------------------------------
○ 抢“植物观察打卡”活动名额             20:00
  #二课 · 🎯 毕业 / 二课分

○ 植物观察打卡                           全天
  第 5 / 15 次 · #二课
  🎯 毕业 / 二课分 · 完成计划后 +1分

○ 修改 MemoFlow Provider UI              全天
  #工作 #AI

✓ 完成 TLS 配置                           11:30
```

Goal link 是 metadata，不抢夺 Task title/date 的视觉优先级。

## 11. 创建 Task

统一入口：

```text
新建任务

做什么？
[植物观察打卡]

日期                       时间
[8月30日]                  [全天]

重复
[每天 ▾]

结束
[15 次后]

标签
[#二课]

关联目标（可选）
[顺利完成大学毕业要求]
[二课分达到毕业要求]

[✓] 完成任务后自动更新关键结果

计入方式
○ 每次完成
● 完成整个计划

贡献
[1] 分

完成全部 15 次打卡后，“二课分达到毕业要求”将增加 1 分。

▸ 更多设置
  描述
  提醒
  优先级
  Checklist

                          取消   创建任务
```

### 11.1 Goal link 无 contribution

报名任务：

```text
关联目标
毕业 / 二课分

[ ] 完成任务后自动更新关键结果
```

完成报名不会修改二课分。

### 11.2 Time type inference

不显示 Radio：

```text
全天 / 时间点 / 时间段
```

用户只操作“时间”。内部自动映射 `TaskTimeType`。

## 12. Repeating Task / Task Plan 管理

作为二级入口：

```text
... -> 管理重复任务
```

列表：

```text
植物观察打卡
每天 · 15 次 · 已完成 5/15
下一次：今天

英语晨读
每天 07:30 · 永不结束
下一次：明天
```

可操作：

```text
编辑重复
暂停
恢复
放弃计划
```

计划历史保留 outcome：

```text
进行中
已成功
未达成
已放弃
```

“未达成/Failed”不是用户随手点击的状态；由 completion policy 根据 occurrence facts 判断。

不显示 DAG / Critical Path / dependency graph。

## 13. Task Detail

默认打开具体任务实例：

```text
植物观察打卡
○ 待完成

今天 · 全天
第 5 / 15 次
#二课

关联目标
顺利完成大学毕业要求
› 二课分达到毕业要求

整个计划完成后 +1 分

备注
...

                         完成
... -> 未完成 / 跳过本次
```

`未完成` = `Missed`；`跳过本次` = 明确豁免，二者不能混用。若任务已过期但尚未确认结果，显示 `已逾期` badge，仍允许补标完成。

如果来自 recurrence：

```text
查看重复设置 >
```

进入 Task Plan，而不是把计划配置全部堆在实例详情。

## 14. Goal <-> Task deep-link

### Goal -> Task

KR：

```text
2 个关联活动正在进行 >
```

跳转：

```text
/tasks?goalId=<id>&keyResultId=<id>
```

Task 页面显示临时 filter chip：

```text
关联：毕业 / 二课分   x
```

### Task -> Goal

Task metadata：

```text
🎯 毕业 / 二课分 +1分（计划完成后）
```

点击跳 Goal detail 并定位对应 KR。

## 15. 毕业场景完整推演

### 15.1 Goal

```text
顺利完成大学毕业要求

KR1 完成毕业论文与答辩      0 / 1
KR2 修满毕业要求学分        154 / 160
KR3 二课分达到毕业要求      40 / 50
```

### 15.2 报名准备

用户创建 7-8 个一次性 Task：

```text
抢植物观察活动名额
抢志愿服务活动名额
抢读书打卡活动名额
...
```

全部可以 link 到 KR3，但 contribution = off。

### 15.3 抢到活动后

创建/激活有限重复计划：

```text
植物观察打卡
每天
15 次
PlanCompletion +1 分
```

每天 Today 只出现当天实例。

### 15.4 5/15

Task Plan 显示执行进度 33%，但 Goal KR 仍 40/50；不能把 execution progress 冒充 outcome。

### 15.5 漏打卡 / 豁免

若第 7 天到第二天仍未处理：

```text
Day 7 = Pending + Overdue
```

用户确认现实中已打卡：

```text
Day 7 -> Completed
```

用户确认确实忘记：

```text
Day 7 -> Missed
strict 15/15 + no backfill
-> Task Plan outcome = Failed
-> 不产生 +1 二课分
```

若活动官方当天暂停，则使用 `Skipped/waived`，不能记成 Missed；completion policy 根据该计划的豁免规则重新计算 required scope。

### 15.6 15/15

Task Plan outcome -> Succeeded -> settlement -> GoalRecord +1 -> KR 41/50。

### 15.7 学校审核延迟

如果必须等待积分到账：计划本身不自动 +1；创建一次性“确认积分到账”，确认后 EachCompletion +1。

这保证 Goal 记录真实成果。

## 16. 删除的页面 / 入口

Goal：

```text
/goals/focus                 delete
/goals/compare               delete
GoalFolder dialog            delete
Goal search                  delete from main product
Review create route          replace with subordinate dialog/drawer
Review detail route          optional retire after drawer parity
```

Task：

```text
Graph view                   delete
Dependency manager           delete
Dependency validation demo   delete with dependency domain
CriticalPath panel           delete
Task folder                  delete
```

## 17. 可访问性与响应式

- Goal/Task row 的整行可点击，但 title 必须是语义化 link/button；
- label chips 有 accessible name；
- progress 不只依赖颜色，必须有文字百分比/当前值；
- narrow panel 时 labels 可截断为 `#工作 +2`，不能把主标题挤没；
- dialogs 默认 keyboard-first；
- mobile Task 首页仍以 Today instances 为默认，不回退 Template cards。

## 18. 明确不做

本轮不建设：

- enterprise ownership / assignee；
- team OKR alignment；
- Gantt；
- Kanban for Goal；
- Goal hierarchy；
- Task dependency graph；
- full filter DSL / saved views；
- arbitrary KR formulas；
- AI 自动判定 measurement；
- Task completion threshold policy 8/10（保留 extension point，不进 v1 UI）。

## 20. 本轮补充决策

- [ADR-057: Task Occurrence Outcome、Overdue 与 Task Plan 生命周期](../architecture/adr/ADR-057-task-occurrence-outcome-and-plan-lifecycle.md)
- [Goal / Task OSS 直接复用与可插拔可行性评估](../analysis/2026-08-25-goal-task-oss-reuse-feasibility.md)

## 19. OSS / 标准能力实施原则

产品语义仍以本文件与 ADR-053~057 为真值；实现细节执行 ADR-058：

- Goal/KR/Task/Plan/Contribution 的业务语义由 MemoFlow 自己拥有；
- recurrence、iCalendar、通用日期/解析等标准问题优先评估成熟 library；
- Vikunja、Super Productivity、Tasks.org、Loop、Leantime 等主要用于借鉴已验证的业务语义、UI 层次、状态机、API/schema、测试矩阵与 failure/migration 工程细节；
- 不为了“复用”把第二套 Task store / auth / project hierarchy 嵌入产品；
- UI 继续优先组合 headless/accessibility primitives，而不是复制完整应用页面。

任何第三方实现都不得改变本产品文档定义的用户语义；如果 library 模型与 MemoFlow contract 不一致，由 adapter 负责翻译。
