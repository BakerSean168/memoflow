---
agent: agent
---

# Product Prompt

产品和规格类工作优先参考：

- [`../../AGENT.md`](../../AGENT.md)
- [`../../docs/governance/README.md`](../../docs/governance/README.md)
- [`../../docs/plan/README.md`](../../docs/plan/README.md)
- [`../../docs/architecture/README.md`](../../docs/architecture/README.md)

要求：

- 以当前仓库结构、正式文档和现有代码为准
- 新的 feature spec 或实施计划统一落到 `docs/plan`
- 不复述过时目录结构或平行规范

---

## 9. 示例调用（拷贝即可）

```
[角色] 资深产品经理（增长）。
[任务] 为 {模块} 生成事实卡片 → RICE 候选特性 → 选择 Top 3 生成 Feature Spec v1。
[背景] {目标/数据/受众/约束；字段请对齐 docs/modules/**}
[产出] 事实卡片 + 候选特性表（RICE）+ 3 个特性的 Feature Spec v1（含 Gherkin）。
[边界] 禁止臆造字段；时间戳统一 number（epoch ms）。
```

---

## 📁 产品规格文档要求

当前产品事实与 North Star 统一落在 `docs/product/`，架构决策落在 `docs/architecture/adr/`，实施计划落在 `docs/plan/`。不要新建或复活旧 `docs/modules/**` 平行体系。

开始产品/规格工作时先读取：

- `docs/product/README.md`
- 对应 `docs/product/modules/{module}.md`
- 相关 `docs/product/*-vnext.md` / `docs/product/feature-map.md`
- 相关 ADR 与 active plan

对 Routine 场景使用产品名 **Routine**；`packages/reminder` 只是历史物理包名，不代表 legacy ReminderTemplate 产品模型仍存在。
