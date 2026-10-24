---
tags:
  - plan
  - archive
  - time
  - architecture
  - contracts
description: 产品时间体系实施计划（ADR-037）——@memoflow/time、Transfer≡Instant、DomainDate 退役
created: 2026-07-26T00:00:00
updated: 2026-07-29T00:00:00

# 产品时间体系实施计划

## 1. 文档地位

| 角色 | 文档 |
|------|------|
| **宪法（已采纳）** | [`../../architecture/adr/ADR-037-product-time-system.md`](../../architecture/adr/ADR-037-product-time-system.md) |
| **详设** | [`../../architecture/product-time-system.md`](../../architecture/product-time-system.md) |
| **本文件** | 实施波次、完成定义、与 elegance 边界 |
| **Goal 提示词** | [`./2026-07-26-product-time-system-goal-prompt.md`](./2026-07-26-product-time-system-goal-prompt.md) || 并行 | elegance foundation（dual 税）；**不**用 dual 刷数代替本 plan |

真值：代码/配置/测试 > ADR-037 > 本 plan。

## 2. 目标

按 ADR-037 **高质量、长期**落地产品时间体系：

1. `@memoflow/time` 成为唯一产品时间入口
2. `TransferDate` ≡ 品牌 `Instant`；`Ymd`/`Hm` 一等  
3. `DomainDate = Date` 退役路径可执行；新字段禁止  
4. 展示/表单走 Style；领域走 Clock/Calendar/Codec  
5. lint 断供 date-fns 直连与组件私有 format  

## 3. 非目标

- 第一版多用户业务时区  
- 恢复 PersistenceDate  
- force-merge 真异语义  
- 宣称 agent-host §20  
- micro dual 狂欢  

## 4. 波次与完成定义

与详设 §9 对齐：

| 波次 | 完成定义 | 状态 |
|------|----------|------|
| W0 | 包骨架 + 最小 Facade/Style/Clock/Codec/format.hm + 引擎；样例测试 | **完成** |
| W1 | primitives brand Instant≡TransferDate；Codec 文档化 | **完成** |
| W2 | app-vue format sole 上提；主路径改 import | **完成** |
| W3 | ESLint 断供 date-fns（error + legacy） | **完成** |
| W4 | 组件/React 私有 format 清零 | **完成**：主路径 `@memoflow/time` / product-time；Residual 1240/1204/1216/1237 仅保留 **empty-label** keep-boundary（绝对格式已走 Style） |
| W5 | 高优先级 Ymd 字段（生日/全天） | **完成**（birthday Ymd；TaskTimeConfig.startDay） |
| W6 | 核心 VO DomainDate getter → Instant | **完成**（含 RecurrenceRule.endDate、GoalReview、UserSetting、DependencyChain.estimatedCompletionDate） |
| W7 | 删 legacy / utils date 旧 API | **完成**：utils/shared/date 删除；time free helpers 正式化（非 legacy）；registry 无 date-fns/utils legacy 条目 |
| W8 | Style ↔ presentation preference | **完成**（timeStyleFromPresentationLocale + session product-time） |
| T10 | 删 DomainDate 类型 + Codec 桥；empty 经 Style | **完成**（primitives 无 DomainDate；Codec 仅 fromJsDate/toJsDate；registry 仅 canonical） |
## 5. 质量门禁（每波）

- 最近 `pnpm nx` test（time + 触及包）  
- 相关 surface  
- 触及治理/docs 时 `memoflow:governance-check`
- 不提交密钥与 Playwright 产物  
- residual 记本 plan §7  

## 6. 决策摘要（不可在实施中弱化）

1. 质量优先于「少改几行」  
2. Transfer ≡ Instant；DomainDate 已删除（T10）  3. 日历日用 Ymd，不用午夜 Date  
4. 真门面 + Style，禁止假 re-export  
5. 双 shape 仅语义差，不换皮  

## 7. Residual

| ID | 日期 | 说明 | 结果 |
|----|------|------|------|
| T0 | 2026-07-26 | ADR-037 + 详设 + 本 plan 入库 | 文档 |
| T0b | 2026-07-26 | Goal 完整/简易提示词入库（新会话实施入口） | 文档 |
| T1 | 2026-07-26 | W0 `@memoflow/time` 骨架 + Facade/Clock/Codec/format.hm/DateFnsEngine + vitest | 代码 |
| T2 | 2026-07-26 | W1 Instant≡TransferDate、Ymd/Hm、DomainDate deprecated | 代码 |
| T3 | 2026-07-26 | W2 app-vue sole → `@memoflow/time` re-export；dual-registry 锁更新 | 代码 |
| T4 | 2026-07-26 | W3 ESLint ban date-fns + time-registry legacy retire_by | 代码 |
| T5 | 2026-07-26 | W4–W5 product-time helpers；birthday Ymd；TaskTimeConfig.startDay；部分 keep-boundary 保留 | 代码 |
| T6 | 2026-07-26 | W6 GoalTimeRange/TaskTimeConfig Instant getters | 代码 |
| T7 | 2026-07-26 | W7 utils/date deprecated；W8 preference→TimeStyle + empty.display 单点 | 代码 |
| T8 | 2026-07-26 | date-fns 仅 engine；私有 format→time；优先 DomainDate→Instant；ensureDate 主导出删除；1240 empty-label keep-boundary 保留 | **完成**（success image） |
| T9 | 2026-07-26 | DomainDate 产品字段清零；utils date 删除；time free helpers 正式化；registry 收紧 | **完成** |
| T10 | 2026-07-26 | 删 DomainDate 类型 + Codec from/toDomainDate；react empty 经 Style；residual 859 文案 Instant；dual 路径 free/format-helpers | **完成** |
| T11 | 2026-07-26 | 收尾体检：清扫残留 toLocale 产品路径；plan §9 冗余/精简度量 | **完成** |
| T12 | 2026-07-26 | 第二阶段架构方案入库（§10：P1–P11 刀序） | **方案** |
| T13 | 2026-07-26 | 第二阶段 P1–P11 完整实施：Empty Catalog、session 对称、relative/duration/input/slots、Domain Instant getters、859 alias、lint/registry、IANA+engine seam | **完成** |

## 8. 开跑提示

- **完整 Goal（新会话整段）：** [`2026-07-26-product-time-system-goal-prompt.md`](./2026-07-26-product-time-system-goal-prompt.md) § 完整 Goal 提示词  
- **简易：** 同文件 § 简易提示词 A/B/C  

```text
按 docs/plan/archive/2026-07-26-product-time-system-goal-prompt.md 实施 ADR-037；从 W0 起写代码。
```

## 9. 优化后冗余清理与精简度量（T11 · 2026-07-26）

相对 `origin/main` merge-base 的工作树快照（含未提交实现）。度量口径：**产品时间相关包与工具**为主，不把 docs/ADR 初稿扩写算作「冗余删除」。

### 9.1 总览（git shortstat）

| 范围 | 文件 | 插入 | 删除 | 净变化 |
|------|------|------|------|--------|
| 产品时间相关包（time/contracts/utils/app-*/goal/task/account/setting/governance + 治理脚本 + eslint） | **~130** | **~1 061** | **~1 406** | **约 −345 行** |
| 其中核心 primitives / utils shared / app-vue shared utils / app-react utils·components·screens | — | ~418 | ~558 | **约 −140 行** |
| 全工作树（含 docs、ADR、lockfile 等） | ~144 | ~2 302 | ~1 912 | 净 +390（文档与新包建设占主导） |

解读：实现层**以删除冗余为主**（业务/shared 净减）；`@memoflow/time` 新包与 ADR/详设文档为**有意新增的单一真相**，不是重复逻辑。

### 9.2 整文件删除（旧入口）

| 删除 | 约 LOC | 说明 |
|------|--------|------|
| `packages/utils/src/shared/date.ts` | **74** | ensureDate / 产品 date 桥；主导出与 shared index 不再 re-export |
| `packages/contracts/src/primitives/domain-date.ts` | **2+导出** | `DomainDate = Date` 类型与 primitives 导出一并删除 |
| Codec `fromDomainDate` / `toDomainDate` | ~20 行 API | 迁移桥删除；infra 仅 `fromJsDate` / `toJsDate` |
| Time Registry boundary/legacy 条目 | 2 条 | 现 **6 条全部 `canonical`**，无 `retire_by` |

### 9.3 分散冗余收敛（比「删行」更重要）

| 项 | 优化前 | 优化后 | 精简含义 |
|----|--------|--------|----------|
| **业务 `date-fns` 直连文件** | **18** | **1**（仅 `packages/time/src/engine/date-fns-engine.ts`） | **−17 处散落依赖**；治理 audit 绿 |
| **`DomainDate` 符号命中（packages）** | **~93** | **~14**（注释/surface 防回归锁） | **字段类型清零**；类型本身已删除 |
| **app-vue 6 个 format sole 实现体** | **~80 LOC** 各自实现 | **~33 LOC** re-export + **~38 LOC** `time/free/format-helpers` | 实现单点；dual 路径稳定 |
| **私有 `formatDate` / 组件内 format 主路径** | 多 Screen/Card 自写 `toLocale*` | 主路径 `@memoflow/time` / `product-time` | 绝对格式统一；empty 经 Style |
| **React empty soles** | 手写 `if (!ts) return 'Not set'` | `TimeStyle.empty.display` + `format.date(Time)` | empty 单点 |

### 9.4 新增「非冗余」资产（单一真相，不计入冗余）

| 资产 | 约 LOC | 角色 |
|------|--------|------|
| `packages/time/src/**` | **~1 098** | Facade / Clock / Style / Codec / Format / Input / Calendar / Engine |
| `packages/app-vue/.../product-time.ts` | **~131** | session facade + empty-label override |
| `instant.ts` / `ymd.ts` / `hm.ts` | 薄类型 | contracts 类型真相 |
| `tools/governance/time-registry.json` + `date-fns-import-audit.mjs` | 治理 | 断供与 canonical 登记 |

### 9.5 有意保留的 residual（非未完成）

| Residual | 原因 |
|----------|------|
| **1240 / 1204 / 1216 / 1237** empty-label / 展示 keep-boundary | 产品文案语义差（i18n notSet vs `—` vs N/A vs Unknown），**禁止 force-merge** |
| **1207** SSE `formatMessageTime` | app-vue locale `toLocaleTimeString` vs app-react 固定 zh-CN Intl；surface 锁 |
| **859** Instant/TransferDate 双 interface 名 | 语义 dual 名保留；已非 Date≠number |

### 9.6 收尾体检结论（T11）

- [x] `date-fns` 仅 engine  
- [x] `DomainDate` 类型与 Codec 桥删除  
- [x] `utils/shared/date` 删除  
- [x] Registry 仅 canonical  
- [x] 主产品路径 format 经 `@memoflow/time` / product-time（含 goal/task/account/schedule/react 卡片与冲突建议）
- [x] `governance-check` + date-fns-import-audit 绿  
- [x] 本 § 记录冗余清理与精简量  

**一句话：** 产品时间横切从「18 处 date-fns + 93 处 DomainDate + 74 行 utils date + 多套私有 format」收敛为 **`@memoflow/time` 单入口（~1.1k 源码）**；相关业务/shared 包净删约 **300+ 行**，并消灭整类迁移债类型与旧 date 模块。

## 10. 第二阶段架构方案：下一刀与后续全序列（T12 规划）

> **状态：** **P1–P11 已实施**（2026-07-26）。第一阶段（W0–W8 + T9–T11）实现层单一真相；第二阶段调用层/领域层/治理收敛完成。P11 为 IANA policy + engine seam 就绪（非 Temporal 全量替换）。  
> **原则：** 质量优先；**不** force-merge 真异语义；dual 锁只在语义合并后改写，禁止删锁充数。

### 10.1 现状分层（第一阶段结束后）

```text
┌─────────────────────────────────────────────────────────────────┐
│ L5  组件 / Screen                                                │
│     仍大量存在 function formatDate / formatTime（~35+ 薄封装）      │
│     多数 → formatProduct*；少数 residual 自实现 / 相对时间 / 时长    │
├─────────────────────────────────────────────────────────────────┤
│ L4  模块 presentation（schedule-presentation、task-template…）   │
│     部分已走 time；duration / capsule label 仍模块本地               │
├─────────────────────────────────────────────────────────────────┤
│ L3.5 app-vue product-time.ts（session facade + EmptyLabel）       │
│      app-react：多处 createTimeFacade 模块级单例（无统一 session）  │
├─────────────────────────────────────────────────────────────────┤
│ L3  @memoflow/time  Facade / Style / Codec / Format / Input …   │  ✅ 完成
│ L2  DateFnsEngine（唯一 date-fns）                                │  ✅ 完成
│ L1  contracts Instant ≡ TransferDate · Ymd · Hm                 │  ✅ 完成
│     DomainDate / utils date 已删                                  │  ✅ 完成
└─────────────────────────────────────────────────────────────────┘

领域层债（W6 未尽）：Goal / Account 等 aggregate 仍有 createdAt/startDate: Date getter
```

**诊断：** 第一阶段解决的是 **「怎么算 / 怎么画」**；第二阶段要解决 **「谁允许调用 / 空值与相对时间语义 / 领域是否再漏 Date」**。

### 10.2 目标拓扑（第二阶段终态）

```text
UI / Screen
  → 禁止本地 function formatDate|formatTime|formatTimestamp|formatDateTime
  → 直接：
       getProductTime().format.*(instant, styleOverride?)
       或 模块 presentation 的「业务句」（可含 i18n，内部只调 facade）
  → empty / unknown 只来自：
       TimeStyle.empty  |  i18n key 经 L4 一次解析成 string 再传入 empty override
  → 相对时间：facade.format.relative（阈值/回落绝对在 Style.relative）
  → 时长：facade.format.duration 或 登记的 L4 duration sole（i18n 句式）

Session bootstrap
  → 单一 TimeFacade（vue product-time / react 对称 getProductTime）
  → preference → setProductTimeStyle / withStyle

Domain
  → 对外时间 getter 仅 Instant | Ymd | null（审计字段可分期）
  → 日界/加减只经 calendar + clock

Infra
  → 仅 codec.fromJsDate / toJsDate
```

### 10.3 刀法总览（有序；后刀依赖前刀）

| 刀 | 代号 | 一句话 | 依赖 | 风险 |
|----|------|--------|------|------|
| **下一刀** | **P1 Empty Catalog + 命名归零** | 组件内 `formatDate*` 薄封装删掉；empty 进目录/Style；调用点直连 product-time | T11 | 中：i18n 文案需产品确认 |
| 第 2 刀 | **P2 Session 单例对称** | app-react 收掉多处 `createTimeFacade`；与 vue 同 session 模型 | P1 可并行 | 低 |
| 第 3 刀 | **P3 Relative / Dashboard** | 仪表盘相对时间进 facade.format.relative + Style 阈值 | P1 | 中：文案波段 |
| 第 4 刀 | **P4 Duration 谱** | 分钟/毫秒时长 sole 进 time 或登记 L4；消灭并行 formatDuration 体 | P1 | 中：i18n 键差异 |
| 第 5 刀 | **P5 Input 接缝** | date/time input、combine、parse 全走 Input API；退役 toDateInput 双轨 | P1–P2 | 中：表单回归 |
| 第 6 刀 | **P6 日历 UI 标题** | 日程 period title / weekday long 等 pattern 进 Style.display 命名槽 | P2 | 低 |
| 第 7 刀 | **P7 Domain Instant 扫尾** | Goal/Account 等 `Date` getter → Instant；运算改 calendar | W6 | 高：行为 |
| 第 8 刀 | **P8 Contracts 859 收敛** | 同构 Instant 双 interface → type alias（仅真同构时） | P7 | 中：surface |
| 第 9 刀 | **P9 Lint 终态** | 禁组件 `function formatDate`；禁产品 `toLocale*`（exemption 表） | P1–P6 | 中：存量 |
| 第 10 刀 | **P10 Dual 税降维** | keep-boundary surface 按语义合并改写或退役；不删真旁路 | P1–P9 | 低–中 |
| 远期 | **P11 TZ / Temporal** | 多用户 IANA；可选 TemporalEngine | 非本阶段 | 高 |

```text
P1 ──┬── P2 ── P6
     ├── P3
     ├── P4
     └── P5
           │
P7 ── P8   │
           ▼
         P9 ── P10 ··· P11
```

status: done
---

> **归档结果（2026-07-29）**：ADR-037 已采纳；W0–W8 + T10 与第二阶段 P1–P11 已实施（PR #191/#192）。  
> 宪法仍为 ADR-037 + `docs/architecture/product-time-system.md`；本文件为实施历史。

### 10.4 下一刀详设 — **P1：Empty Catalog + 组件 format 命名归零**

#### 问题

- app-vue 仍有 **~35** 处「`function formatDate` → `formatProductDate`」薄封装。
- 差异几乎全在 **empty 字符串**：`t('goal.detail.notSet')` / `'-'` / `'—'` / `'N/A'` / `'Not set'` / `t('common.unknown')`。
- dual residual **1240** 等锁的是这些 empty，不是第二套 format 算法。
- ADR 成功图像要求：**apps 无产品私有 formatDate/formatTime**（测试除外）。

#### 架构决策

1. **Empty 是产品词，不是第二套 Format。**  
   引入 **Empty Catalog**（建议放 `app-vue` i18n/常量 + react 对称英文表，或 contracts 极薄 `TimeEmptyKind` 枚举）：

   | kind      | 语义                | 示例解析                             |
   | --------- | ------------------- | ------------------------------------ |
   | `emdash`  | 列表默认空          | `—` / Style 默认                     |
   | `dash`    | 紧凑空              | `-`                                  |
   | `notSet`  | 表单/详情「未设置」 | i18n `*.notSet` / EN `Not set`       |
   | `na`      | 调度/不可用         | `N/A`                                |
   | `unknown` | 损坏/未知           | i18n `common.unknown` / EN `Unknown` |
   | `blank`   | 输入空              | `''`                                 |

2. **调用约定（L5）：**

   ```ts
   // 禁止
   function formatDate(v) {
     return v == null ? t('…') : formatProductDate(v);
   }

   // 允许
   formatProductDate(v, emptyNotSet(t)); // 或
   getProductTime().format.date(v, { empty: { display: t('…') } });
   ```

3. **L4 仅在「业务句子」时保留本地函数**（例如 `formatSuggestion` 拼 moveEarlier 整句）——内部时钟片段必须 facade，且 **不**再叫 `formatDate`。

4. **Surface：**
   - residual 1240 从「多 body 形状 dual」改为 **Empty Catalog 契约锁**（kinds 集合 + 解析结果）。
   - 组件内 `function formatDate` **期望归零**（spec 改断言「不存在 local formatDate」）。

#### 完成定义（P1 DoD）

- [x] app-vue modules/layouts 中 **零** `function formatDate|formatTime|formatDateTime|formatTimestamp`（presentation L4 业务句与 duration 除外，清单进 Registry `boundary`）。
- [x] Empty Catalog 有单一模块 + 单测；Style.empty 为默认 kind。
- [x] residual 1240/1204/1216 文档与 surface 改为 catalog 锁，不再锁组件本地 body。
- [x] 最近 nx test（app-vue surfaces + 触及模块）绿。

#### 非目标（P1）

- 不合并 dashboard **相对时间**（→ P3）。
- 不合并 SSE 1207（→ P3/P9 exemption 或产品统一后再收）。
- 不改 Goal aggregate `Date` getter（→ P7）。

#### 预估触点

GoalDetail / TaskDetail / ScheduleTaskDetail / RuleCard / ReminderTemplateCard / MultiGoalComparison / KeyResultDetail / GoalDialog / SettingAdvancedActions / capsules 等 **~25–40 文件**；dual-registry / keep-boundary specs。

---

### 10.5 第 2 刀 — **P2：跨端 Session Facade 对称**

| 项               | 内容                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| **现状**         | vue：`getProductTime` session；react：GoalCard/TaskDetail/… **各自** `createTimeFacade({ locale, empty })` |
| **目标**         | `packages/app-react` 提供 `getProductTime` / `setProductTimeStyle`（与 vue 同语义）；Screen 只消费 session |
| **收益**         | 改 empty/locale 一处；FixedClock 测试可注入                                                                |
| **DoD**          | react 业务文件 `createTimeFacade` 仅 bootstrap + test；utils soles 改用 session                            |
| **可与 P1 并行** | 是（接口先落地再迁调用）                                                                                   |

---

### 10.6 第 3 刀 — **P3：Relative 与「真异」展示边界**

| 路径                                              | 策略                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **DashboardActivityTimeline**（1237 相对波段）    | 迁入 `format.relative`；Style.relative.maxAgeMs / 文案 key 表（L4 只提供 t）                                                |
| **SSE formatMessageTime（1207）**                 | **产品二选一**：① 统一 `format.hm`/`dateTime` → 删 keep-boundary；② 登记 exemption「monitor raw locale clock」长期 boundary |
| **Weight / Focus 等已 product-time 的 soft 1237** | P1 后仅剩命名，随 P1 消失                                                                                                   |

**DoD：** 相对时间无组件内手写 `Date.now()-ts` 分桶（或仅经 facade 钩子）；1207 有明确 Registry 终态。

---

### 10.7 第 4 刀 — **P4：Duration 类型谱**

| 现状                                                                                                                                   | 目标                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatScheduleDurationMinutes`、`formatTaskDuration`、ConflictAlert ms floor、TaskDependencyGraph minutes、AI `formatDurationMs` 多套 | **`DurationMs` / `DurationMin` brand**（contracts）+ `format.duration`（Style.duration）+ **至多一个** L4 i18n 适配器（`schedule.duration.*` vs `task.*` 用字典而非第二套算术） |

**DoD：** 时长算术/拆 h+m 只在 time；模块只选 dictionary。Registry 标 duration boundary 若键集永久分叉。

---

### 10.8 第 5 刀 — **P5：Input 接缝（表单）**

| 现状                                                                                                                                  | 目标                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `to-date-input` / `to-time-input` / `parse-date-input` / `combine-date-and-time` keep-boundary；TimeConfigSection `formatDateToInput` | 全部 **`time.input.*`**：`dateValue` / `timeValue` / `parseDate` / `combineYmdHm`；表单空用 `Style.empty.input` |

**DoD：** 上述 keep-boundary 或改为 input 契约锁，或 dual-retired 到 input sole；TaskTemplateForm / CreateSchedule 无本地 combine。

---

### 10.9 第 6 刀 — **P6：日历 chrome（标题/轴）**

| 现状                                                                                              | 目标                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ScheduleCalendarView / DayDetailSheet 用 `formatProductPattern('EEEE, yyyy MMMM d')` 等裸 pattern | Style.display 增加 **named slots**：`periodDay` / `periodMonth` / `periodWeekDay` / `chartMonthDay`；调用 `format.slot('periodDay', instant)` |

**DoD：** 产品日历标题无散落 token 字符串（chart 可保留 pattern API 但进 Registry）。

---

### 10.10 第 7 刀 — **P7：领域 Date getter 扫尾（高风险）**

**库存（抽样，实施前全量 CodeGraph/rg）：**

- `goal` aggregate：`startDate` / `targetDate` / `completedAt` / `archivedAt` / `createdAt`… 仍 `Date`
- `account`：`createdAt` / `updatedAt` / `deletedAt`
- `key-result` / `goal-folder` / `focus-session` 等审计与会话时间

| 策略             | 说明                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| **产品时刻字段** | getter → `Instant`；内部 props 已是 ms 则删 `new Date` 包装                                                 |
| **日历日字段**   | 已 Ymd 的保持；误用 Instant 午夜的改 Ymd                                                                    |
| **运算**         | `extendTargetDate` 等改 `calendar.addDays` + clock，禁止 `getTime()+DAY_MS` 裸加（注意 DST，应用 calendar） |
| **分期**         | 先 goal 主路径 → task → account 审计字段                                                                    |

**DoD：** 核心产品 VO/Aggregate 对外无 `Date` 时间 getter；mapper 仅 codec；领域测试 FixedClock。

---

### 10.11 第 8 刀 — **P8：Contracts residual 859 收敛**

| 现状                                                                            | 目标                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GoalTimeRange 等 domain `Instant` + DTO `TransferDate` **双 interface**（同构） | 真同构 → `export type GoalTimeRangeDTO = GoalTimeRange`（或反过来） |
| 仍语义不同（Ymd vs Instant）                                                    | **保持**双 shape，字段名诚实（`startDay` vs `startAt`）             |

**DoD：** 859 surface 只锁「真异语义」对；同构 dual 退休并记 dual-registry。

---

### 10.12 第 9 刀 — **P9：Lint / Registry 终态门禁**

| 规则         | 作用                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| 已有         | ban `date-fns` outside engine                                                                                         |
| **新增**     | ban 产品路径 `toLocaleDateString` / `toLocaleString` / `toLocaleTimeString`（allowlist：测试、stories、P3 exemption） |
| **新增**     | ban `function formatDate                                                                                              | formatTime | formatDateTime | formatTimestamp`于`packages/app-vue/src/modules/**`、`app-react/src/**`（allowlist：L4 presentation 清单、`**/**tests**`） |
| **Registry** | `boundary` = 1207/duration 字典等；`canonical` = facade + product-time session；**legacy → 0**                        |

**DoD：** CI 红于新增散落；存量 allowlist 有 `retire_by` 或永久 reason。

---

### 10.13 第 10 刀 — **P10：Dual / keep-boundary 税降维**

在 P1–P9 语义合并后：

1. 重写 surface：从「双 body 文本 diff」→「catalog / facade 契约」。
2. 删除已无意义的 soft residual 注释噪声。
3. **禁止**为降文件数合并仍保护真旁路的锁（与 elegance plan 一致）。

**DoD：** 时间相关 keep-boundary 文件数显著下降；剩余每条在 Time Registry 有 kind=boundary。

---

### 10.14 远期 — **P11（不排进当前里程碑）**

- 多用户 **IANA timeZone** 写入 Style + Codec combine。
- 可选 **TemporalEngine** 替换 date-fns（调用方 0 改）。
- 与 agent-host 展示无关，独立里程碑。

---

### 10.15 与第一阶段成功图像的映射

| 详设 §12                    | 第一阶段                             | 第二阶段刀        |
| --------------------------- | ------------------------------------ | ----------------- |
| date-fns ⊆ engine           | ✅                                   | —                 |
| apps 无私有 formatDate/Time | ✅                                   | **P1 + P9**       |
| 改 empty.display 全局变     | ✅ 双端 session                      | **P2**            |
| FixedClock 文案可测         | ✅                                   | **P2 + P3**       |
| 无 DomainDate               | ✅                                   | —                 |
| 全天/生日 Ymd               | 部分 ✅                              | 字段扫尾随 **P7** |
| Registry legacy→0           | ✅ canonical + documented boundaries | **P9**            |

---

### 10.16 建议落地顺序（执行日历）

| 迭代             | 刀                         | 建议验证                                   |
| ---------------- | -------------------------- | ------------------------------------------ |
| **立即下一迭代** | **P1**                     | app-vue surfaces + goal/task/schedule 抽测 |
| 同迭代或 +1      | **P2**                     | app-react 目视 + 单测 session              |
| +1               | **P3**（含 1207 产品决议） | dashboard / notification                   |
| +1               | **P4 + P5**                | schedule/task form                         |
| +1               | **P6**                     | calendar chrome                            |
| 独立大 PR        | **P7 → P8**                | goal/account domain tests                  |
| 收尾             | **P9 → P10**               | governance-check + eslint                  |

每刀：更新本 plan §7 residual 行；触及治理则 `memoflow:governance-check`。

### 10.17 决策摘要（第二阶段不可弱化）

1. **薄封装不是完成态**——P1 必须打掉组件级 `formatDate*` 名。
2. **Empty 进 Catalog / Style，不进第二套 Format 实现。**
3. **真异语义（相对 vs 绝对、monitor locale、duration 字典）进 Registry boundary，不 force-merge。**
4. **领域 Date getter 是下一类根因债（P7），与 UI 命名归零分开排期，避免大爆炸 PR。**
5. **Lint 终态（P9）在调用层干净之后再收紧，避免先红一片。**
