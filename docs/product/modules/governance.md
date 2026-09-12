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

`GOV-1902` 进一步把“可运行”变成长期验收条件：`/governance/**` 不因生产导航隐藏而删除，开发环境直接展示工作台，生产可通过 `VITE_ENABLE_GOVERNANCE_DEV_SURFACE=true` 显式开启诊断入口；Vue smoke 必须跑通 list → create → update → RuleRevision history。

## 6. 与 Engineering Governance 的关系

```text
packages/governance
= structured rules + revisions + executable reference feature

tools/governance + docs/governance + docs/standards + CI
= repository engineering governance
```

`GOV-1903` 已增加显式：

```text
Rule
→ Published GovernanceRuleBundle
→ tools/governance adapter
→ check/report/autofix proposal
```

bundle 通过 authenticated HTTP/IPC/client export seam 显式发布。`GOV-1904` 已把固定版本/hash 的 repository snapshot 接到 engineering check/report/autofix-proposal：CI 只读 `tools/governance/published/governance-rule-bundle.v1.json`，并用 `pinned-rule-bundles.json` 的 semantic hash fail closed；它不读取实时开发数据库。`engineering-rule-adapters.json` 是唯一执行映射表，未映射 Rule 即使为 Mandatory 也只报告为 non-enforcing；当前 DDD-003 仅显式映射到 `package-internal-boundary` 的 partial coverage。

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

- development/diagnostic surface policy 已由 `GOV-1902` 固化：开发环境自动展示，生产仅显式诊断开关展示；route 与 feature ownership 始终保留；
- 保持 reference module 与全仓 canonical feature shape 同步；
- deterministic published rule bundle 已由 `GOV-1903` 完成：schema v1 + canonical payload + SHA-256 + Active-only + provenance；
- check/report/autofix-proposal adapter 已由 `GOV-1904` 接入 repository-pinned snapshot；CI 不读取 Rule DB，autofix 只生成 review-required proposal；
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
