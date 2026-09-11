---
tags:
  - product
  - module
  - governance
description: Governance 可执行参考模块与开发模式编码规范工作台
created: 2026-06-02T00:00:00
updated: 2026-09-11T00:00:00+09:00
---

# Governance 模块说明

> **2026-09-09 convergence decision:** ADR-110 明确 Governance 永久保留。它既是可以真实管理编码/架构规范的 development workbench，也是 MemoFlow feature architecture 的 executable reference module。ADR-109 的 Knowledge retirement 提案已被取代。

## 1. 功能定位

Governance 有两个正式且长期保留的定位：

1. **开发模式规范工作台**：真实管理编码规范、架构规范、示例、标签、状态和修订历史；
2. **可执行参考模块**：用一套低业务复杂度但完整的 vertical slice 展示 MemoFlow 标准 feature package 应该如何实现。

它不是仅用于截图或测试的 fake，也不是面向普通终端用户必须长期占据主导航的核心业务功能。

## 2. 当前功能说明

- 规则管理：创建、更新、删除、搜索规范；
- 状态管理：Draft → Active → Deprecated；
- 严重度：Mandatory / Recommended；
- 修订历史：每次变更记录不可变 RuleRevision；
- 代码示例：good examples / bad examples；
- 标签与筛选；
- rule code 唯一标识；
- live reference location；
- Prisma 与 PowerSync 双 persistence；`GOV-1901` 已锁定 Rule/RuleRevision round-trip 与 search/filter 行为 parity；
- HTTP 与 IPC 双 transport；
- Web/Desktop client；
- Vue list/detail/editor/history；
- composition-root / transport-parity / persistence-parity / public-surface / docs anti-drift reference tests。

## 3. 用户/开发者路径

```text
打开 Governance 开发工作台
        ↓
浏览/搜索规范
        ↓
创建或编辑 Rule
        ↓
状态/严重度/示例/引用校验
        ↓
持久化 Rule
        ↓
自动生成 RuleRevision
        ↓
查看历史 / 后续发布给工程治理
```

开发模式必须能够真实走通该路径。

## 4. 业务规则

- Rule 是核心聚合；
- RuleRevision 是 write-once audit entity；
- code 维持唯一和格式约束；
- Rule lifecycle 保持显式；
- Good/Bad Example 是结构化规范内容，不迁成 Knowledge canonical state；
- Knowledge 可以链接/索引 Rule，但不拥有 Rule lifecycle/revision；
- Engineering Governance 不直接读取动态本地 DB 作为 CI 真值。

## 5. Reference Module contract

Governance 应长期展示并测试以下标准：

```text
central contracts
canonical public seams
server/domain
server/application
server/transport
server/infrastructure
host-owned composition
Prisma / PowerSync parity
HTTP / IPC parity
client seam
Vue composition
Result/failure contracts
focused characterization tests
```

对全仓 feature architecture 的重大结构调整，优先用 Governance 证明一个完整可执行 vertical slice。`GOV-1901` 同时修复了一个实际 parity 漂移：Prisma search 现在与 PowerSync 一样覆盖 code/title/description/tags，并使用不区分大小写的关键词匹配。

## 6. 与 Engineering Governance 的关系

```text
packages/governance
= structured rules + revisions + executable reference feature

tools/governance + docs/governance + docs/standards + CI
= repository engineering governance
```

未来可以增加显式：

```text
Rule
→ Published GovernanceRuleBundle
→ tools/governance adapter
→ check/report/autofix proposal
```

但 CI 消费的是固定版本/hash 的 bundle，而不是实时开发数据库。

## 7. 与 Knowledge 的关系

Knowledge 不再是 Governance 的替代目标。

允许：

- standards note 引用 Rule；
- Rule live reference 指向 Knowledge/doc/repository path；
- AI 将 Rule projection 作为受控 context。

禁止：

- 删除 Rule DB 改存 Markdown；
- Git history 替代 RuleRevision；
- 把 Governance 退化成 Knowledge 的一个 folder。

## 8. 当前优化方向

- 正式定义 development-mode surface policy；
- 保持 reference module 与全仓 canonical feature shape 同步；
- 建立 deterministic published rule bundle；
- 增加 check/report/autofix adapter，而不是让 Rule DB 直接绑死 CI；
- 更新 authorization policy，使其明确服务开发/reference 场景；
- 保持 Web/Desktop/Prisma/PowerSync parity 的教材价值。

## 9. 保护项

以下不得进入 retirement queue：

- `packages/governance`；
- Governance contracts；
- Rule/RuleRevision persistence；
- API/IPC/client/UI vertical slice；
- reference-module architecture tests。

## 10. 相关资料

- [ADR-110](../../architecture/adr/ADR-110-governance-permanent-executable-reference-module.md)
- [Governance Current-System Map](../../analysis/2026-09-09-governance-product-current-system-map.md)
- [仓库级治理规范](../../governance/README.md)
- [Governance 文件索引](../module-index/governance-files.md)
