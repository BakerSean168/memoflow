---
tags:
  - plan
  - archive
  - hygiene
  - elegance
  - dual-track
  - foundation
  - agent-host
description: 代码优雅化与后续实施铺垫——dual 税减负、多路径收敛、文档归档、Agent Host 地基（非产品功能大爆炸）
created: 2026-07-26T00:00:00
updated: 2026-07-29T00:00:00
status: done
---

> **归档结果（2026-07-29）**：E1–E7 硬完成定义已勾选；PR #189 已合 main；E5b bootstrap 死域 follow-up 已合 #190。  
> Dual Registry / dual 税减负 / AI 路径地图为历史资产。  
> 后续产品主线：[`../active/2026-07-17-unified-assistant-agent-host.md`](2026-07-17-unified-assistant-agent-host.md)。

# 代码优雅化与后续实施地基计划

## 1. 文档地位

| 角色                                         | 文档                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **本文件**                                   | **主目标 plan**：定义「优雅状态」、阶段、完成定义、与其它 plan 的边界                                                              |
| 执行协议（每夜怎么跑）                       | [`2026-07-25-nightly-hygiene-and-agent-host.md`](./2026-07-25-nightly-hygiene-and-agent-host.md)                                   |
| 主产品能力 plan（完成定义未宣称）            | [`2026-07-17-unified-assistant-agent-host.md`](./2026-07-17-unified-assistant-agent-host.md)                                       |
| Vault 产品切片（§13.2 **15/15**，已合 main） | [`2026-07-16-obsidian-vault-repository-optimization.md`](../archive/2026-07-16-obsidian-vault-repository-optimization.md) → 应归档 |
| Windows handoff（历史）                      | [`2026-07-25-windows-vault-repo-residual-handoff.md`](../archive/2026-07-25-windows-vault-repo-residual-handoff.md) → 应归档       |
| Auth 旁支                                    | [`2026-07-17-auth-account-security-closure.md`](./2026-07-17-auth-account-security-closure.md)                                     |
| 产品审查材料                                 | `2026-07-15-web-core-product-review.md` / `2026-07-16-web-product-design-review.md`（转 backlog，不在本 plan 做 UX 大改）          |

规范入口：`AGENT.md`。真值：代码/配置/测试 > 根配置 > `docs/`。

**本 plan 不替代** agent-host 产品完成定义；它解决的是：  
**在下一波产品实施前，让代码与文档进入可持续、可导航、少假 dual、少死域的「优雅地基」。**

### 1.1 交付载体与合并策略（重要）

| 项                 | 约定                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **工作分支**       | `docs/codebase-elegance-foundation`（可随实施改名，但默认此支）                                                    |
| **PR**             | https://github.com/BakerSean168/memoflow/pull/189 → `main`                                                         |
| **合并时机**       | **执行完本 plan 本轮交付范围后再 merge**；禁止「仅 plan 文档」提前合 main                                          |
| **本 PR 必须包含** | 阶段 **A**（归档）+ 阶段 **B**（Dual Registry + **dual 清理/税减负**，满足 E2 + E3）                               |
| **本 PR 宜包含**   | 阶段 **C** 中 C1–C2（AI 路径地图 + 调用方审计）与 **E5 死域 S 清扫**（若时间允许）                                 |
| **本 PR 可延后**   | 阶段 **D**（AH-4/5/6 产品切片）、完整阶段 **E** 勾选可在 follow-up；但 residual 须写清「未做项」                   |
| **提交方式**       | 在 **同一 PR 分支** 上多次 commit push（A → B → C…），**最后一次**再 merge；不要为 dual 另开平行 PR 拆散审查上下文 |

**一句话：先干完 dual 清理与优雅地基，再合 #189。**

---

## 2. 问题陈述（基线，2026-07-26）

### 2.1 已做到（勿倒退）

- Vault / 知识库产品 DoD **15/15**，PR readiness yes，已 merge `main`（#188 / tip 含 residual 1342 + nightly N1–N3）。
- 第一代 do-while 已退役大量**生产 dual 实现**，并用 `*-dual.surface.spec.ts` / keep-boundary 防回潮。
- Host open-chat 主路径经 `dispatchAssistant`；ProposalKernel 具备 revision / stale / 幂等骨架（N3 加强 stale 禁 approve）。

### 2.2 未解决（本 plan 要对齐的问题）

| 问题                              | 现象（量级示意，以仓库实测为准）                                                                                                            | 风险                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **P1 Dual 税过重**                | `*dual*.surface.spec.ts` **≈ 237**；`keep-boundary` **≈ 66**；集中在 `app-vue/shared/utils`、`contracts/*/api`、`utils`                     | 新人无法分辨「已 retired 锁」vs「真双实现」；测试与文档噪音掩盖真债 |
| **P2 微 dual 近饱和仍被当主战场** | format/pad/date helper 级 residual 叙事极长                                                                                                 | 刷 residual 无产品收益；掩盖结构债                                  |
| **P3 多路径未写清**               | AI：`dispatchAssistant` vs `sendMessage`/`streamMessage` vs AgentRun/`listAgentRuns`；Host `assistant-run-*` ≠ 持久 AgentRun（N2 已诚实锁） | 后续 Host 实施踩双编排；UI 拼装多源状态                             |
| **P4 文档未归档**                 | vault plan / Windows handoff 仍在 `active/`，README 状态过时                                                                                | 协作入口混乱；agent 误把已合 DoD 当未完成                           |
| **P5 产品债未分层**               | 产品审查 P0 与 agent-host 大切片、auth 发信混在同一优先级感知里                                                                             | 夜间 agent 乱选 scope                                               |
| **P6 死域 / 兼容层残留**          | 注释中的 `Legacy*`、过期 re-export、仅文档存在的模块名                                                                                      | 误导阅读与 import 习惯                                              |
| **P7 优雅无度量**                 | 无「优雅状态」可检查清单，只有感觉                                                                                                          | 无法宣称阶段完成、无法为后续实施做硬铺垫                            |

### 2.3 非目标（明确不做）

- 不把 vault §13.2 从 15/15 改回 open。
- 不宣称 agent-host §20 全勾、不宣称 Electron multi-engine / real Pi / durable LangGraph 已完成。
- 不强制 merge **L keep-boundary**（语义故意不同）。
- 不做 Web 工作区 UX 大改（属产品审查 backlog）。
- 不重开第一代「灭 padTwoDigits」式微 dual 狂欢。
- 不删除 portable `editor_*` 备份边界（故意保留，见既有 surface）。

---

## 3. 「优雅状态」定义（可验收）

优雅 ≠ dual 文件数为 0。  
优雅 = **主路径单一、边界可查、税可控、文档与代码同构、后续切片可落点**。

### 3.1 硬完成定义（全部满足才可将本 plan 标为完成）

- [x] **E1 文档入口干净**：vault plan + Windows handoff 已迁 `docs/plan/archive`；`docs/plan/active/README.md` 反映 main 真值；本 plan + nightly + agent-host 为 active 主叙事。
- [x] **E2 Dual 登记册（registry）落地**：仓库内有一份可维护的 **Dual Registry**（见 §5.1），覆盖全部 `*dual*.surface.spec.ts` 与 keep-boundary 规格，每项标注 `retired | keep_boundary | open_S | open_M | open_X`；无「未分类」积压超过 5%。
- [x] **E3 Dual 税下降**：相对本 plan 基线日，满足至少一条：
  - **E3a** `open_S` + `open_M` 条目清零（或仅剩书面 defer 且有 owner/日期）；或
  - **E3b** dual-surface 文件数下降 **≥ 25%**（通过合并 registry 级 suite / 删除纯重复锁，**不**靠删除未退休 dual 实现）；且 CI 相关 test 仍绿。
- [x] **E4 多路径地图**：`docs/` 或 `packages/ai` 下有 **AI 运行路径地图**（Open-chat Host / Workflow AgentRun / legacy message API）+ 允许调用方表；surface 或 docs-boundary 测试锁住「产品 open-chat 不得回退 streamMessage 双路径」（延续既有 host-dispatch surface）。
- [x] **E5 死域清扫一轮**：无消费者兼容 re-export / 纯注释假模块 / 死 IPC 名至少完成一轮 **S 清扫**并写入 residual；bootstrap 等处误导性 Legacy 注释清理或改为指向真路径。
- [x] **E6 后续实施铺垫**：agent-host 队列 AH-4 至少完成 **一小步可合并切片**（或书面 external + 落点文件）；AH-2 产品恢复 UI 有明确「做 / 不做 / 外部」决策写入 agent-host plan。
- [x] **E7 门禁不回归**：`memoflow:governance-check` + 受影响 project lint/typecheck/test 在收口 PR 绿；不提交密钥与 Playwright report 产物。

### 3.2 软目标（加分，不阻塞 E1–E7）

- Dual registry 生成脚本（`tools/` 扫文件名 + front-matter/首注释 status）。
- contracts API dual surface 合并为按模块的「retired dual map」单测文件，减少 16+16 散落。
- 产品审查 P0 抽出 **最多 3 条** 进入独立 mini-backlog，不进本 plan 正文膨胀。

### 3.3 优雅状态一句话

> **读代码时：主路径一眼可见；读 dual 时：知道是锁还是债；读 plan 时：只看到未完成真事；写下一刀时：落点在 Host/capability，而不是 format helper。**

---

## 4. 策略原则

1. **锁 ≠ 债**：`dual-retired` surface 是资产；优先 **分类与减税**，不是一律删除。
2. **S/M 才动实现；L 只登记**；X 记到 agent-host / auth plan。
3. **结构优先于 helper**：Chat vs Host、runtimeMode、IPC channel、死模块 > `formatDate*`。
4. **每轮可回滚**：一小步、最近 target、一 commit 一主题。
5. **产品 DoD 与优雅 DoD 分离**：vault 已闭；本 plan 不重新打开 vault checkbox。
6. **执行引擎复用 nightly 协议**，本 plan 提供阶段与完成定义；nightly 提供 GOAL_PRIORITY 与 residual 日志格式。

---

## 5. 阶段设计

### 阶段 A — 入口与归档（文档卫生，1–2 PR）

**目标**：协作入口与 main 真值一致。

| 步骤 | 动作                                                                                         | 验收                                             |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| A1   | vault plan + Windows handoff → `docs/plan/archive/`（文首加「已合 main / DoD 15/15」结果条） | archive 存在；active 无误导「待 OAuth」          |
| A2   | 重写 `docs/plan/active/README.md` 状态表                                                     | vault 归档；elegance + nightly + agent-host 置顶 |
| A3   | nightly 协议 §2 去掉「PR 跑完再合 vault」过时句；指向本 plan                                 | 交叉链接双向                                     |

**产出**：干净 active 目录。  
**不改**：业务代码（可附带 README-only commit）。

---

### 阶段 B — Dual Registry 与税模型（地基，2–4 PR）

**目标**：让 237 dual surface 从「噪音」变成「账本」。

#### 5.1 Dual Registry 格式

建议路径（二选一，实施时定一并 surface 锁路径）：

- `docs/governance/dual-registry.md`（人读 + agent 读），或
- `tools/governance/dual-registry.json`（可脚本生成）+ 短 README。

每项字段：

| 字段      | 说明                                                             |
| --------- | ---------------------------------------------------------------- |
| `id`      | 稳定 id（路径 hash 或 residual 号）                              |
| `path`    | `*.surface.spec.ts` 或 keep-boundary spec                        |
| `package` | nx project / 目录                                                |
| `class`   | `retired` \| `keep_boundary` \| `open_S` \| `open_M` \| `open_X` |
| `sole`    | sole 实现路径（若有）                                            |
| `blast`   | 一句话 blast radius                                              |
| `next`    | `none` \| `delete_surface` \| `merge_impl` \| `defer:date`       |

#### 5.2 分类规则（与 nightly §5 对齐）

| class           | 判定                                                                 | 后续                         |
| --------------- | -------------------------------------------------------------------- | ---------------------------- |
| `retired`       | 文案含 dual-retired / local dual retired，且 sole 存在、无第二实现体 | 可进入「合并锁」候选（E3b）  |
| `keep_boundary` | 明确语义不同、禁止 force-merge                                       | 只登记；本 plan **不 merge** |
| `open_S`        | 死 re-export / 无消费者 / 假 dual                                    | 删除实现或锁文件             |
| `open_M`        | 两实现语义相同仍并存                                                 | sole + 改调用方              |
| `open_X`        | 跨 Host/auth/token                                                   | 转 agent-host 或 auth plan   |

#### 5.3 税减负手段（允许的 E3b 动作）

1. **Registry suite**：同一 package 下 N 个 `*-dual.surface.spec.ts` 合并为 `dual-registry.surface.spec.ts`，内表驱动断言（路径列表 + 关键字），**行为锁不丢**。
2. **删除重复锁**：两文件锁同一 sole 且断言子集 → 留一。
3. **禁止**：为减文件数而删掉对仍存在双实现的断言。

**验收**：registry 覆盖率 ≥ 95%；E3a 或 E3b 满足其一；`pnpm nx` 相关 test 绿。

---

### 阶段 C — 多路径与死域收敛（结构优雅，3–6 PR）

**目标**：后续实施不会踩「第二条暗道」。

| 步骤 | 主题                              | 动作                                                                                                                                      | 验收                                                                |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| C1   | **AI 路径地图**                   | 文档化：① Host open-chat（`dispatchAssistant` / SSE / IPC）② Workflow AgentRun（start/resume/list）③ 遗留 message send/stream（谁还调用） | docs + surface；产品 open-chat 禁止回退 streamMessage（已有则加强） |
| C2   | **调用方审计**                    | `rg`/CodeGraph：`sendMessage`/`streamMessage`/`dispatchAssistant`/`listAgentRuns` 生产调用表                                              | 表进 registry 或 ai 路径地图附录；死调用方 S 删                     |
| C3   | **Host 恢复决策**                 | AH-2 产品恢复 UI：做最小只读列表 / 或明确不做并 keep-boundary                                                                             | 写入 agent-host plan 一行决策                                       |
| C4   | **死域 S 清扫**                   | 无消费者 export、误导 Legacy 注释、空 barrel                                                                                              | 每 PR 主题单一；governance 不回归                                   |
| C5   | **runtimeMode 小步（AH-7 预热）** | 找一处 direct/remote 分支可改为 capability 投影                                                                                           | 单切片 + test；不宣称阶段 8 完成                                    |

**非目标**：重写 Python LangGraph；接入 real Pi。

---

### 阶段 D — 后续实施铺垫切片（与 agent-host 对齐，2–4 PR）

**目标**：优雅不只是删，还要 **下一刀有落点**。

| 步骤 | 对应 nightly | 最小可交付                                                                              |
| ---- | ------------ | --------------------------------------------------------------------------------------- |
| D1   | AH-4         | Task 与 Goal/Knowledge **共用** Artifact 工作台的 **一处** UI/数据通路（非富编辑全量）  |
| D2   | AH-5         | Electron multi-engine：要么 driver 一步 + scaffold 状态更新，要么 **external** 原因写死 |
| D3   | AH-6         | Pi：product fail-closed 文案/锁 **或** 永久 research keep-boundary（二选一，禁止悬空）  |

D 阶段可与 C 并行，但 **不得** 假绿勾 agent-host §20。

---

### 阶段 E — 收口与交接（1 PR）

| 步骤 | 动作                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| E1   | 本 plan §3.1 全部勾选；写「优雅收口 residual」                               |
| E2   | nightly 协议更新：GOAL_PRIORITY 以 agent-host 产品切片为主，dual 仅 open_S/M |
| E3   | 可选：本 plan 迁 archive，或保持 active 直到 agent-host 下一里程碑           |

---

## 6. 与 nightly 协议的关系

```text
本 plan = 目标与阶段（What / Done）
nightly = 每夜执行循环（How）
agent-host = 产品能力真相（Capabilities）

GOAL_PRIORITY（优雅阶段期间调整为）=
  1) 本 plan 当前阶段未完成步骤（A→B→C→D）
  2) agent-host AH-4+ 与本 plan D 重叠项
  3) open_S / open_M（registry 驱动）
  4) auth 小步 / 产品 P0（最多穿插）
  5) smoke 修红
```

每轮 residual 记在 **nightly §9** 与 **本 plan §9**（双写一行即可，避免 vault 小说）。

---

## 7. 执行节奏建议（相对 PR #189）

| 节奏  | 内容                                                           | 是否进 #189                     |
| ----- | -------------------------------------------------------------- | ------------------------------- |
| 段 0  | 更新本 plan / 提示词 / PR 描述（本提交）                       | 是                              |
| 段 1  | 阶段 A 归档 vault + Windows handoff + README                   | 是                              |
| 段 2  | 阶段 B Dual Registry 初版 + 分类                               | 是（**核心**）                  |
| 段 3  | 阶段 B dual 清理：E3a 和/或 E3b 税减负                         | 是（**核心，必达 merge 门槛**） |
| 段 4  | 阶段 C1–C2 路径地图 + 调用方审计；E5 死域 S                    | 宜进 #189                       |
| 段 5  | 相关 nx test / governance 绿；更新 residual；**再 merge #189** | 是                              |
| 段 6+ | 阶段 D AH-4/5/6、完整 E 勾选                                   | 默认可 follow-up PR             |

允许更慢；**禁止**为赶 E3b 破坏锁语义；**禁止**未达 E2+E3 就 merge #189。

---

## 8. 风险与回滚

| 风险                     | 缓解                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 合并 dual surface 丢断言 | 表驱动保留关键字；CI 跑合并后的 suite                                                                      |
| 误 merge keep_boundary   | registry class=L 禁止 M 动作；code review 看 class                                                         |
| 范围膨胀进 UX 大改       | 产品审查只抽 3 条 backlog，本 plan 不实施                                                                  |
| agent-host 假绿          | §3 明确不勾 §20；D 阶段 external 合法                                                                      |
| 大 PR 难审               | **本轮刻意单 PR（#189）** 承载 A+B（+可选 C）；用多次小 commit 分段，PR 描述按阶段列文件；审查按 commit 看 |
| 过早 merge               | **禁止** plan-only 合 main；merge 门槛 = E2+E3 落地 + 相关 test 绿                                         |

回滚：git revert 单 commit 或整支 PR；registry 文件可单独回滚。

---

## 9. Residual 日志

| ID      | 日期       | 说明                                                                                                                                                  | 阶段   | 结果            |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------- |
| E0      | 2026-07-26 | 创建本 plan；基线 dual-surface≈237、keep-boundary≈66；main 含 #188 + N1–N3                                                                            | —      | 文档入库        |
| E0b     | 2026-07-26 | 合并策略改为：PR #189 承载 dual 清理；**执行完再 merge**；重写 §10 提示词                                                                             | —      | 提示词/策略更新 |
| E1a     | 2026-07-26 | 阶段 A：vault plan + Windows handoff → archive；active README 真值；交叉链接修正                                                                      | A      | 入口干净        |
| E2      | 2026-07-26 | Dual Registry：`tools/governance/dual-registry.json` + `docs/governance/dual-registry.md`；150 条目全部分类（retired/keep_boundary）；path surface 锁 | B      | E2 达标         |
| E3b     | 2026-07-26 | dual-surface 237→84（**-64.6%**）；25 个 `dual-registry.surface.spec.ts` suite；open_S/M/X=0（E3a 亦满足）                                            | B      | E3 达标         |
| E4      | 2026-07-26 | AI 路径地图 `docs/architecture/ai-runtime-path-map.md` + host-dispatch surface 加强                                                                   | C      | E4 达标         |
| E5      | 2026-07-26 | 死域 S 初核：result-helpers-dead 等既有锁；**未**改 bootstrap（E5 当时过宽宣称）                                                                      | C      | 部分            |
| E5b     | 2026-07-26 | **真 E5 S**：`apps/api/src/bootstrap.ts` 示例 `LegacyAccountModule` → `AccountApiModule`；surface 锁与 main 一致                                      | C      | 死域 S 落地     |
| E6      | 2026-07-26 | AH-2 **本轮不做**（书面决策进 agent-host）；AH-4/5/6 follow-up/external                                                                               | D 轻量 | 决策落盘        |
| E7      | 2026-07-26 | governance-check 绿；contracts/utils/ai/auth/governance/goal/app-vue/desktop:test:main 绿                                                             | E      | 门禁            |
| E-merge | 2026-07-26 | PR #189 达 merge 门槛后合 main                                                                                                                        | E      | merge           |

---

## 10. 给 agent 的开跑提示词（可整段）

```text
你是本仓库协作 agent。读 AGENT.md 与：
- docs/plan/archive/2026-07-26-codebase-elegance-foundation.md（主目标 + §1.1 合并策略 + §3.1 Done）
- docs/plan/active/2026-07-25-nightly-hygiene-and-agent-host.md（执行协议 / residual 格式）
- docs/plan/active/2026-07-17-unified-assistant-agent-host.md（产品能力；勿假绿勾 §20 完成定义）

## 交付与合并（硬约束）
- 工作分支：docs/codebase-elegance-foundation（或 PR #189 当前 head）
- PR：https://github.com/BakerSean168/memoflow/pull/189 → main
- **先执行、后合并**：在本 PR 内完成 dual 清理与优雅地基后再 merge；禁止仅提交 plan 文档就合 main
- **本 PR 必达范围**（merge 门槛）：
  1) 阶段 A：vault plan + Windows handoff → docs/plan/archive；active README 真值
  2) 阶段 B：**Dual Registry**（E2）+ **dual 清理/税减负**（E3a 和/或 E3b）
  3) 相关 nx test / 触及则 governance-check 绿；本 plan §9 + nightly residual 写清
- **本 PR 宜做**：阶段 C1–C2（AI 路径地图 + 调用方表）、E5 死域 S 一轮
- **默认可 follow-up（可不进本 PR）**：阶段 D（AH-4/5/6 产品切片）、完整勾选 E1–E7 中仅依赖 D 的项
- 全程在同一 PR 分支多次 commit + push；最后再 `gh pr merge`（或请人合）；不要为 dual 另开平行 PR 拆散上下文

## 目标
把代码与文档推进到 elegance plan 本轮 merge 门槛以上，为后续 Host/产品实施铺垫。
优雅 ≠ dual 文件数为 0；锁（retired）与债（open_S/M）必须分清。

## 禁止
- 微 dual 刷数（format/pad/date helper 级狂欢）
- 强制 merge keep_boundary（L）
- 假绿 agent-host §20；宣称 Electron multi-engine / real Pi / durable LangGraph 已完成
- 提交密钥、.env*.local、Playwright report/trace/webm/png
- 重开 vault §13.2 DoD；force-push main
- **未达 E2+E3 就 merge #189**

## Dual 清理怎么做（阶段 B，本 PR 核心）
1. 建立 Dual Registry（docs/governance/dual-registry.md 或 tools/governance/dual-registry.json，二选一写死路径并用 surface/文档锁）
2. 扫描全部 *dual*.surface.spec.ts 与 *keep-boundary*.spec.ts，分类：
   retired | keep_boundary | open_S | open_M | open_X
3. 清理：
   - open_S：删死 re-export / 无消费者 / 假 dual
   - open_M：sole + 改调用方 + 删旧实现 + 必要锁
   - retired 税减负（E3b）：同 package 表驱动合并重复 surface，或删纯重复锁；**禁止**删掉对仍存在双实现的断言
   - keep_boundary / open_X：只登记；X 记到 agent-host 或 auth plan
4. 验收 E3：open_S+open_M 清零（或书面 defer+日期），**或** dual-surface 文件数相对基线（≈237）下降 ≥25%，且相关 test 绿

## 推荐顺序（同一 PR 内）
A 归档 → B Registry → B dual 清理（E3）→（宜）C1–C2 路径地图与调用方审计 + E5 死域 S → 绿测 → 更新 residual/PR 描述 → **再 merge #189**
D 与完整 E 勾选可 follow-up，但须在 residual 写明未做项。

## 每轮
一项、最近 `pnpm nx` 验证、写 elegance §9 与 nightly residual、commit、push 到 PR 分支。
从阶段 A1 开始（A 已完成则从 B）。
开跑；**跑完 dual 清理达 merge 门槛之前不要合并 PR。**
```

---

## 11. 成功后的世界（给后续实施的铺垫）

当 E1–E7 满足时，后续 agent / 人类应能：

1. 从 **active README** 只看到真 active 产品与优雅收口后的主线。
2. 从 **Dual Registry** 秒判「锁还是债」。
3. 从 **AI 路径地图** 知道新功能挂 Host 还是 Workflow，而不是复制 streamMessage。
4. 从 **AH-4 落点** 继续 Task 工作台，而不是先挖 dual 坟。
5. 保持门禁绿，把精力放在 **用户可见能力** 与 **ADR-035 真缺口**（Pi/Electron/durable）上，而不是 format helper。

---

## 12. 相关资料

- [ADR-037 产品时间体系](../../architecture/adr/ADR-037-product-time-system.md)（后续时间横切主宪法；与 dual 税减负分工）
- [产品时间体系实施](./2026-07-26-product-time-system.md)

- [夜间 hygiene + Agent Host](./2026-07-25-nightly-hygiene-and-agent-host.md)
- [统一助手与可插拔 Agent Host](./2026-07-17-unified-assistant-agent-host.md)
- [ADR-035](../../architecture/adr/ADR-035-unified-assistant-agent-host.md)
- [AGENT.md](../../../AGENT.md)
- [archive README](../archive/README.md)
