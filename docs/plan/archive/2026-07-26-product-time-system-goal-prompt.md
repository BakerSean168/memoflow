---
tags:
  - plan
  - archive
  - time
  - agent-prompt
  - goal
  - adr-037
description: 完整实施 ADR-037 产品时间体系的 Goal / Agent 提示词（新会话整段粘贴）
created: 2026-07-26T00:00:00
updated: 2026-07-29T00:00:00
status: done
---

> **归档结果（2026-07-29）**：配套 Goal 提示词；实施波次已完成，随 product-time plan 一并归档。  
> 新时间工作以 ADR-037 / architecture 详设为准，勿再从 W0 空跑。

# ADR-037 产品时间体系 — Goal 实施提示词

> **用法**：新会话把 **§ 完整 Goal 提示词** 整段交给 agent。  
> **简易入口**：见文末 **§ 简易提示词**（或直接复制该节）。  
> **基线**：ADR-037 已合 main（PR #191 / tip 含 `b4b6b6282` 或更新）。从 **W0** 起写代码，禁止只改文档充数。

---

## 文档地图（先读）

| 优先级 | 路径                                                                                                            | 角色                                     |
| ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 0      | [`AGENT.md`](../../../AGENT.md)                                                                                 | 协作与验证习惯                           |
| 1      | [`docs/architecture/adr/ADR-037-product-time-system.md`](../../architecture/adr/ADR-037-product-time-system.md) | **宪法（已采纳）**                       |
| 2      | [`docs/architecture/product-time-system.md`](../../architecture/product-time-system.md)                         | **详设**（类型、API、Style、治理、波次） |
| 3      | [`docs/plan/archive/2026-07-26-product-time-system.md`](./2026-07-26-product-time-system.md)                    | 波次状态 / residual                      |
| 4      | 本文件                                                                                                          | Goal 提示词                              |

真值顺序：代码/配置/测试 > ADR-037 > 详设 > plan。

---

## 完整 Goal 提示词（可整段）

```text
你是本仓库（MemoFlow / memoflow）协作 agent。目标：在已合入的 ADR-037 基础上，**完整、高质量、长期导向**地实施产品时间体系，而不是写文档或做 dual 刷数。

## 必读（按序）
1. AGENT.md
2. docs/architecture/adr/ADR-037-product-time-system.md（宪法，已采纳 — 决策不可削弱）
3. docs/architecture/product-time-system.md（详设：类型谱、门面 API、Style、Codec、治理、W0–W8）
4. docs/plan/archive/2026-07-26-product-time-system.md（波次完成定义与 residual）
5. 需要时：packages/contracts/src/primitives/{domain-date,transfer-date}.ts；packages/utils/src/shared/date.ts；app-vue shared/utils/format-*

## 硬决策（实施中禁止弱化）
1. 质量优先于「少改几行 / 假兼容双轨长期化」
2. TransferDate ≡ 品牌化 Instant（epoch **毫秒**）；wire 瞬时主型唯一
3. Ymd / Hm 一等；禁止用「午夜 Date」冒充日历日
4. DomainDate = Date **长期退役**：禁止新字段；迁移期可 deprecated；目标领域用 Instant 和/或 Ymd（或不可变 VO，不暴露可变 Date）
5. 新建一等包 @memoflow/time：Clock · TimeStyle · Codec · Format · Input · Calendar · 可替换 Engine（默认 date-fns，仅 engine 目录引用）
6. Domain↔Transfer↔UI 转换只经 Codec（及经其调用的 mapper）；展示/表单只经 Format/Input + TimeStyle
7. 真门面，禁止「仅 re-export date-fns」假封装
8. 双 shape 只保留**语义**差（日 vs 瞬时等），禁止同一瞬间 Date vs number 换皮当长期边界
9. 不恢复 PersistenceDate 进 contracts；infra 只经 Codec
10. 不 force-merge 真异语义 keep-boundary；不把 dual 文件数当 KPI；不宣称 agent-host §20；不做 micro dual 狂欢
11. 第一版不做多用户业务时区 entangle（接口可预留 TimeZonePolicy；默认 local calendar）

## 成功图像（完整 ADR 落地后）
- date-fns 的业务 importers ⊆ packages/time/engine（+ 有 retire_by 的 legacy 表趋近 0）
- apps 无产品向私有 function formatDate/formatTime/formatTimestamp（测试除外）
- 改 TimeStyle.empty.display 一处，列表空时间全局可变
- FixedClock 下关键展示可测
- 新 contracts 字段无 DomainDate；TransferDate 为 brand Instant
- 高优先级全天/生日等为 Ymd
- Time Registry 存在；legacy 有到期日
- packages/time 有 TIME_STYLE.md / README；相关 nx test 与触及则 governance-check 绿

## 波次（必须按序；可多 commit，每波可合并 PR）
与详设 §9 / plan §4 一致：

| 波次 | 做什么 | 完成定义 |
|------|--------|----------|
| W0 | packages/time 骨架 + createTimeFacade + 默认 Style + System/Fixed Clock + Codec 最小集 + format.hm + DateFnsEngine；Nx project；样例 vitest | 包可 build/test；样例绿 |
| W1 | contracts primitives：brand Instant ≡ TransferDate；Ymd/Hm 类型；Codec 对齐；DomainDate 标 deprecated | 新代码可用 brand 类型 |
| W2 | 上提 app-vue sole（formatLocalHHmm、formatDateToYMD、padTwoDigits、formatDisplayDate 等）到 @memoflow/time；主路径改 import | app-vue 主路径走 time |
| W3 | ESLint no-restricted-imports 断供业务 date-fns（error + legacy 名单 + retire_by） | CI 强制 |
| W4 | 屠龙组件/Screen 私有 format（含 app-react） | rg 私有 format 归零（白名单 0） |
| W5 | 高优先级字段改 Ymd（生日、全天 start 等）+ 合约/测试 | 字段语义诚实 |
| W6 | 核心 VO DomainDate getter → Instant（goal/task/account 优先） | 核心 VO 无对外 Date 别名 |
| W7 | 删 legacy re-export、utils/shared/date 旧产品 API | 主路径单一 |
| W8 | TimeStyle ↔ presentation preference（语言/地区） | 可演示一处改全局 |

当前从 **W0** 开始（若 residual 显示某波已完成则从下一波）。

## 工作方式
- 分支：从最新 main 拉 feat/product-time-system 或按波次 feat/product-time-w0 …
- 先读代码与 Nx 现有 package 惯例（参考 packages/utils 的 project.json / tsup / vitest），再脚手架 @memoflow/time
- 复杂波次可先在 docs/plan/active 补短执行笔记，但 **W0 起必须有代码**
- 每波：一项主题、最近 `pnpm nx` 验证、更新 plan residual（T1/T2…）、commit、push；宜开 PR，描述写清波次与完成定义
- 使用 pnpm / `pnpm nx ...`；优先 CodeGraph 查符号与 blast radius
- 涉及 contracts brand 时同步导出与受影响 typecheck
- 不提交 .env*.local、密钥、Playwright report/trace/webm/png

## 验证（每波最低）
- `pnpm nx run time:test`（或等价 project 名）及触及包 test/typecheck
- W0+ 起有 surface 或单元测试锁：format.hm、Codec round-trip、FixedClock
- 触及 docs/governance/多包时：`pnpm nx run memoflow:governance-check`
- 断供波次：证明 eslint 对业务 date-fns 失败或 legacy 表记录

## 禁止
- 削弱 ADR：长期保留 DomainDate=Date、假 re-export 门面、静默 ensureDate→now
- 为赶工 force-merge keep-boundary 或删仍保护旁路的 dual 锁充数
- 范围膨胀进 UX 大改 / agent-host 假绿 / 引入 dayjs 并行
- 未达波次完成定义就宣称「ADR-037 完成」

## 开跑
从 main 同步后执行 **W0**：创建 @memoflow/time，实现最小可测试门面，写 residual T1，commit/push。
完整 ADR 以 W0–W8 完成定义与成功图像为准；可分多 PR，但决策不得回退。
```

---

## 简易提示词（新会话日常用）

复制其一即可。

### A. 总入口（推荐）

```text
按 docs/plan/archive/2026-07-26-product-time-system-goal-prompt.md 的「完整 Goal 提示词」实施 ADR-037。先读该文件与 ADR-037 / product-time-system 详设 / product-time-system plan，从 plan residual 显示的下一波开始（默认 W0），写代码不写空文档。
```

### B. 指定波次

```text
读 docs/plan/archive/2026-07-26-product-time-system-goal-prompt.md 与 docs/architecture/adr/ADR-037-product-time-system.md、docs/architecture/product-time-system.md、docs/plan/archive/2026-07-26-product-time-system.md。只实施波次 W{N}（完成定义见 plan §4），验证最近 nx target，更新 residual，commit/push。禁止削弱 DomainDate 退役与 date-fns 断供决策。
```

### C. 极简

```text
查看并执行：docs/plan/archive/2026-07-26-product-time-system-goal-prompt.md（完整 Goal）。基线 ADR-037 已合 main。从 W0 起落地 @memoflow/time。
```

---

## 维护

- 波次完成后：更新 [`2026-07-26-product-time-system.md`](./2026-07-26-product-time-system.md) §4 状态与 §7 residual；本文件提示词仅在决策变更时改。
- 全部 W0–W8 完成后：可将本 goal 提示词与实施 plan 一并归档或留 active 至下一时间里程碑。
