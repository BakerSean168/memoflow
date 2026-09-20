---
tags:
  - analysis
  - ui
  - form
  - product
description: MemoFlow 当前 Vue 主产品表单/对话框与页面 surface 的实际代码盘点，以及 property language 迁移分类
created: 2026-09-20T00:40:00+08:00
updated: 2026-09-20T08:58:00+08:00
---

# MemoFlow UI Form & Surface Refinement Inventory

## 1. 分类标准

本清单只根据当前 `packages/app-vue/src` 的实际 production surface 分类，不把“Linear 风格”理解为所有表单都做成 pill。

| 类别                                  | 含义                           | 处理原则                                                      |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| A — compact property editor           | 对象 identity + 少量可摘要属性 | identity-first + property chips + progressive disclosure      |
| B — staged onboarding / selection     | 本质是分阶段选择、连接或导入   | 保持 stage/selection flow；统一 shell/density，不强行 chip 化 |
| C — long-content / complex editor     | 子对象很多、批量编辑或长内容   | 使用完整 editor；只统一 shell、toolbar、spacing、error/footer |
| D — settings / security / destructive | 配置、安全、删除确认           | 明确 label / help / confirmation 优先，不牺牲可读性换密度     |

## 2. Form / Dialog inventory

| Surface                                             | 当前形态                                                     | 分类       | 决策                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------- |
| `GoalDialog.vue`                                    | ProductDialogShell + property row                            | A          | 第一批继续精修，作为 North Star                                         |
| `KeyResultDialog.vue`                               | ProductDialogShell + core measurement + Advanced collapsible | A/C hybrid | 保留 measurement-first；后续只做 density polish                         |
| `GoalRecordDialog.vue`                              | 原自定义 header/footer + value/note/quick values             | A          | 本轮已迁移 ProductDialogShell；quick values 使用共享 property primitive |
| `TaskPlanDialog.vue` + `TaskPlanForm`               | ProductDialogShell + property row                            | A          | 第一批精修完成                                                          |
| `QuickTaskDialog.vue`                               | 极简 title-only                                              | A          | 已经足够轻，不增加属性                                                  |
| `TaskAIGenerationDialog.vue`                        | AI 生成后的批量 task editor                                  | C          | 不 chip 化 task rows；本轮只统一 ProductDialogShell                     |
| `TemplateSelectionDialog.vue`                       | template card selection                                      | B          | 保留 selection grid；本轮只统一 ProductDialogShell                      |
| `CreateScheduleDialog.vue`                          | 原传统长表单                                                 | A          | 第一批已改 identity + property row                                      |
| `CloudConnectionDialog.vue`                         | ProductDialogShell staged connection                         | B          | 保持 staged flow                                                        |
| `ProfileForm.vue`                                   | Card + avatar/nickname/name/bio/gender/birthday              | D/settings | 不做 property chips；后续改善 grouping、density、sticky actions         |
| `AISettings.vue` provider onboarding                | provider picker -> credentials -> model selection            | B/D        | 当前 staged model 正确；只做 shell/card density 与状态反馈 polish       |
| `KnowledgeRepositorySettings.vue`                   | 多 card + connection/disconnect                              | B/D        | 不压成 chips；后续减少 card-in-card、强化连接状态层级                   |
| `CloudPasswordSection.vue`                          | credential/security                                          | D          | 保持显式传统表单                                                        |
| `SettingsResetSection.vue`                          | destructive settings                                         | D          | 保持显式危险操作区                                                      |
| `DataSettingsSection.vue` / `UserFilesSettings.vue` | data/storage settings                                        | D          | 优先可解释性，不追求极限密度                                            |

## 3. Page / Workspace inventory

| Surface                  | 当前价值                                 | 下一步精修重点                                                      |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| Goal List / Detail       | 已有 vNext workspace + Linear components | toolbar hierarchy、detail property row、减少重复 borders            |
| Task Management / Detail | vNext workspace 已完成                   | list row density、filter tier、detail property grouping             |
| Schedule Calendar        | 功能密集                                 | calendar toolbar、event detail/create visual continuity、窄宽适配   |
| AI Chat                  | 独立 workspace                           | 不套 ListPageShell；优化 context panel density 与状态 feedback      |
| User Settings            | section/card 型                          | 减少 card nesting、统一 section header/description/action alignment |
| Repository               | long-content workspace                   | 保留 editor/workspace 结构，只统一 secondary panels / actions       |
| Governance               | list/detail/editor                       | 复用 LinearPageHeader/ListItem/Panel，降低工具型 UI 的 card 感      |
| Notification List        | inbox/list                               | compact rows、read/unread hierarchy、filter/action alignment        |

## 4. 第二阶段优先级

### P1 — 立即值得继续

1. GoalRecord shell/density（已开始实施）。
2. Task AI generation / Template selection shell 一致性（已开始实施）。
3. Goal / Task detail property presentation：把只读属性从 card-grid 收敛为更紧凑 property rows。
4. Schedule Calendar create/detail continuity：CreateScheduleDialog 与 EventDetailSheet 使用同一 property vocabulary。
5. Settings 页去掉没有信息层级价值的 card-in-card。

### P2 — 需要视觉验证后推进

- Account Profile form grouping；
- Notification list density；
- Governance list/detail density；
- Repository secondary panel spacing。

### 不迁移为 property chips

- 密码/凭据；
- destructive reset；
- AI provider secret；
- 大段正文；
- AI 批量生成结果的逐项编辑器。

## 5. 设计结论

MemoFlow 最终应统一的是 **交互语法**，而不是统一成一种控件：

```text
Identity -> Properties -> One local editor -> Complex content -> Stable actions
```

页面级则统一：

```text
Page identity -> Primary action -> Compact toolbar/filter -> Main content -> Contextual detail
```

因此 UFP 后续审查以“信息层级、渐进披露、动作主次、滚动所有权、错误/草稿保留、可访问性”作为验收标准，而不是以“用了多少 chip”作为指标。

## 6. Selective migration result

实际完成迁移后，当前直接拥有 `DialogContent` 的业务组件只剩三类有意保留项：

1. `AISettings.vue` — staged provider onboarding；
2. `KnowledgeRepositorySettings.vue` — destructive disconnect/purge confirmation；
3. `goal/components/dag/ExportDialog.vue` — 当前无 production consumer。

`KnowledgeProjectionWorkspaceView` 的 create/review 与 adoption dialogs 已迁移 `ProductDialogShell`。因此后续不再以“消灭 raw DialogContent”为目标；新的 UI review 应聚焦 staged flow 自身的信息层级与页面级 density。

页面级第一批已落到 Goal Detail、Task Detail、Notification inbox、Settings sidebar、Schedule day/event details，目标是减少 card-in-card 与高色度装饰，而不改变 owner、command 或 read-model。
