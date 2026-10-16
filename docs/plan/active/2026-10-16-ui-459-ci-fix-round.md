---
tags: [handoff, ui, issue-459, ci-fix]
description: Issue 459 PR 460 Web Flow CI 三失败的修复轮记录与证据
created: 2026-10-16T08:50:00Z
updated: 2026-10-16T08:50:00Z
---

# #459 PR #460 Web Flow CI 修复轮

承接[本地交接](./2026-10-16-ui-459-handoff.md)与[实施收尾](./2026-10-16-ui-459-closure.md)。PR #460 首轮 exact-head CI（Run 38851388503，head `b2dd8aa69c1`）的 Web Flow Shard 2/4 与 3/4 各自失败，共三个用例；本轮完成定位、修复与 exact-head 复验。最终 head `5a168766634` 的全部检查（4 个 Web Flow Shard、Web Flow Oracle、Unit Tests、Typecheck、Governance、Static Analysis、Build 与全部 Oracle）均为 SUCCESS，PR 保持 Draft/OPEN/MERGEABLE。

## 三个失败与修复

| 失败                                                                     | 根因                                                                                         | 修复                                                                                                                                        | 提交                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A `routine-configuration.spec.ts` backdrop 触发 dirty guard 超时         | 新 PaneScopedDialog 的 backdrop 是纯视觉层、永不 dismiss；旧断言仍期望 backdrop 点击弹确认框 | 更新为 pane 契约：backdrop 点击后断言编辑器不关闭、脏草稿保留；再经 pane 头部 Close 按钮验证 cancel 与 confirm 双路径，放弃保护断言全部保留 | `b7bf4d9872e`                |
| B `task-plan-crud.spec.ts` checklist 几何测量 `product-dialog-body` 超时 | pane 呈现下旧全局 Dialog body 不存在；真实滚动宿主为 `data-scroll-host="pane-dialog"`        | 换用真实滚动宿主容器；checklist 底部几何断言（gap ≤ 24px）原样保留。旧 workspace dialog 与新 pane 的 body 同为固定高度语义，公式无需改动    | `b7bf4d9872e`                |
| C `task-plan-crud.spec.ts` 工具栏 `statusFilter` 拖拽面板后失焦          | reka Presence 延迟卸载窃取焦点（见下）                                                       | ProductSingleSelectFilter 卸载防护 + AppShell 手势防护 + spec 自诊断断言                                                                    | `5a168766634`、`d14c018047e` |

## 失败 C 根因（实证）

用零扰动页内仪表（focusin/focusout 监听 + 每帧 activeElement 采样 + MutationObserver，不在步骤间插入 evaluate 探针）循环捕获失败样本，轨迹为：

```text
触发器持焦点 → focusout: 触发器 → reka-dropdown-menu-content（退出中的垂死节点）
→ focusin: 该垂死节点 → 节点被移除 → 焦点落 body，此后无人恢复
```

机制：shadcn 菜单内容带退出动画类，reka Presence 据此延迟卸载；负载下卸载可拖至数秒后才完成，卸载瞬间 FocusScope 的恢复逻辑把焦点拉进即将移除的 content 节点，节点移除后焦点静默落到 body（移除不触发 body focusin，常规监听不可见）。CI 双核慢机上该窗口稳定落在测试的显式 focus 与断言之间（两轮必现）；本地快机多为良性时序，仅高负载下间歇复现。

## 修复设计

- `ProductSingleSelectFilter`：选中后安装 focusin 防护，凡焦点进入 `data-state="closed"` 的菜单内容（垂死节点）或被清到 body，即重定向回本过滤器触发器（菜单关闭后焦点应回归的位置）。重新打开的菜单为 `data-state="open"` 不匹配；用户聚焦其他真实元素也不匹配，故不会覆盖用户意图。3 秒窗口、每次选择重置、组件卸载清理。
- `AppShell` 面板拖拽手势防护保留并改为"真实用户输入（pointerdown/keydown）或 2 秒截止"结束，覆盖任意迟到的原生焦点默认。
- `task-plan-crud.spec.ts` 断言升级为自诊断：失败时错误信息直接输出实际焦点持有者，后续残余问题可从日志直接定位。
- `PaneScopedDialog`/`ProductEditorFrame` 的 `inert` 由隐式 attribute fallthrough 改为显式 prop（行为不变），并补齐嵌套 Picker 的行为回归（owner pane inert、picker 非 inert、宿主外无 inert、关闭恢复）。

## 验证

- 官方隔离 E2E 车道（API :3000 lane=e2e、Web :5173、隔离测试库 :5433）：修复后 `task-plan-crud` 全 spec 7/7、`routine-configuration` 1/1、canonical 工具栏用例通过；全量 82 项于修复前 head 跑出 75 通过/7 失败（A/B 与 CI 一致，其余 5 项为本地高负载下 auth/ai flake，CI 对应通过）。
- 单测：AppShell 30/30、ProductSingleSelectFilter 3/3（含垂死节点窃取重定向、重开菜单不拦截、过期不拦截的确定性回归）、定向 9 spec 81/81。
- 静态检查：ESLint、Prettier、vue-tsc、governance-check 均 exit 0。
- CI：head `5a168766634`（Run 38872912337）全检查清单零非绿。
- 运行日志与诊断轨迹留存于 `reports/test-system-v2/ui-459/`（`web-e2e-canonical-full`、`playwright-ab-fix-verification`、`playwright-routine-fix2`、`focus-debug-loop`、`focus-debug-loop-after-fix`、`vitest-menu-guard` 等）。

## 同类风险说明（未在本轮铺开）

`:modal="false"` 在本 PR 中共用于 11 处菜单表面。ProductSingleSelectFilter 已按实证缺陷加固；其余 10 处（GoalStatusPicker、TaskPageToolbar 溢出菜单、RoutineEditorDialog 触发器菜单、ProfileScopeControl、三个 Trigger 编辑器锚点/频率菜单、RoutineConfigurationView 三个动作菜单）存在相同的延迟卸载窃取机制，但均无各自失败证据，且逐表面的触发器解析与武装点并非同构（多 chip 编辑器、select.prevent 菜单），按"最小修复、不做无证据大改"约束未在本轮铺开。建议由独立审查决定：接受现状合并、或另开 issue 统一加固（提取共享 composable，候选表面即上文清单）。

## 剩余门槛

1. ChatGPT Web 独立审查本轮 diff 与证据（建议重点：两处焦点防护的语义、routine spec 的新 backdrop 契约断言）。
2. PR 转 ready、合并 main、main exact-SHA CI 通过。
3. 按 release-please / Prepare Release / Release Publish 正式链路推进；Publish Main Candidate 保持 disabled_manually。
4. 真实 GCP Dev 登录环境全 owner Chat 交互与 Desktop 安装包验收仍属发布验收；Issue 459 的真实 Dev DoD 不因隔离车道全绿而勾选。

本轮未修改 PR Draft 状态、未合并、未部署、未发布、未恢复候选发布；全程未触碰 host-dev 20230 数据库、生产数据或真实账户凭据。
