---
tags:
  - plan
  - active
  - time
  - label
  - foundation
  - refactor
description: Time + Label vNext Foundations——timezone-aware Product Time 与 pure Shared Label Registry 单轨收敛实施计划
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Time + Label vNext Model Convergence

> **System-wide execution-order notice (2026-09-09):** 本文继续作为模块内部 ticket/验收细节真值；跨模块执行顺序、共享 schema 单写者与 destructive cutover gate 由 [`2026-09-09-system-wide-vnext-model-convergence-implementation.md`](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) 统一协调。
>
> **ADR-111 zero-legacy-data override:** 本文中所有仅用于保存当前旧数据/旧备份/旧客户端的 migration、backfill、compatibility reader/adapter、dual-read/write、redirect window、before/after old-data parity 要求均已被 ADR-111 supersede。领域目标与行为验收继续有效；实施时直接切 current consumers、删除旧 surface、reset/reseed persistence。

## ADR-111 execution rewrite

- the temporary legacy `TimeStyle` adapter introduced by TIME-1202 is now explicit deletion debt, not a compatibility promise;
- `TIME-1205` switches all current product consumers to strict TimeContext/branded primitives, then `TIME-1206` deletes Date/number/legacy style surfaces;
- `LABEL-1303/1304` move assignment ownership directly to Goal/Task; no temporary assignment compatibility seam;
- `LABEL-1305` chooses the target color contract from current UI requirements; no existing-value data migration is required.

**状态：ACTIVE / implementation started**
**设计分支：** `docs/time-label-vnext-model-convergence`
**目标 ADR：** ADR-100～103
**关联 ADR：** ADR-037、ADR-054、ADR-072、ADR-076～083、ADR-088、ADR-093、ADR-098

## 1. Objective

本计划不是再造两个 shared package，而是让已正确抽出的 foundation 完成第二轮收敛：

```text
Time
from: unified facade with partial host-local semantics
to:   explicit TimeContext + timezone-aware calendar/presentation

Label
from: shared registry + owner-specific assignment God repository
to:   pure registry + owner-owned assignments
```

最终：

```text
Product Time
= universal semantic foundation

Shared Label Registry
= persistent user taxonomy foundation

Goal/Task/Routine/...
= business owners consuming foundations one-way
```

## 2. Accepted design package

- `docs/analysis/2026-09-09-time-vnext-current-system-map.md`
- `docs/analysis/2026-09-09-label-vnext-current-system-map.md`
- `docs/analysis/2026-09-09-time-label-reference-and-reuse-ledger.md`
- `docs/architecture/time-label-vnext-foundations.md`
- ADR-100 — TimeContext + timezone-aware Calendar
- ADR-101 — Presentation + compatibility surface
- ADR-102 — Label Registry / owner assignment
- ADR-103 — Label identity/normalization/time/color

## 3. Protected contracts

### Time

1. `Instant / Ymd / Hm` semantics；
2. `@memoflow/time` single product-time package；
3. `Clock` injection；
4. `RecurrenceEnginePort` + rrule isolation；
5. date-fns direct-import governance；
6. owner domain owns GoalTarget/TaskSchedule/RoutineTrigger；
7. explicit schedule timezone snapshots remain stable；
8. Prisma/PowerSync boundary conversion discipline。

### Label

1. identity-scoped label identity；
2. unique `(identityId, normalizedName)`；
3. trim + NFKC + case-insensitive uniqueness；
4. Goal/Task `labels[]` projection and `labelIds` user path；
5. AND filter semantics；
6. System Views != Labels；
7. AI name resolution replay/concurrency safety；
8. foreign-identity assignment fail closed；
9. Prisma/PowerSync parity。

## 4. Non-goals

- 不引入第二套时间库；
- 不自研 tzdb / recurrence parser；
- 不把 Task/Routine business schedules 移入 Time；
- 不把所有业务实体自动加 Label；
- 不建 polymorphic `LabelAssignment(targetType,targetId)`；
- 不创建 generic `shared-settings/utils` God package；
- 不以本轮为由重写 Goal/Task/Routine；
- 不强制 package rename。

## 5. Work items

### FOUNDATION-1001 — Freeze Time/Label vNext evidence, ADR and reuse package

**状态：DONE（docs only）**

**Goal:** 把当前事实、目标 ownership、第三方复用和实施顺序冻结。

**Acceptance:** current-system maps、ADR-100～103、North Star、reuse ledger、module docs/index、active plan 全部存在；没有 production code change。

---

### TIME-1201 — Characterize host-local drift and DST semantics

**状态：DONE（2026-09-09）**

**Goal:** 在改 Time API 前，先把当前 timezone 行为和目标 invariant 做成可失败 fixture。

**Why now:** 这是最高风险行为变化；没有 characterization 不能安全迁移 Calendar/Format。

**Scope:**

- Calendar/Format 在不同 process TZ 下 fixture；
- Asia/Tokyo vs UTC；
- America/New_York DST gap/overlap；
- weekStartsOn；
- locale zh-CN/en-US；
- recurrence current conformance作为保护基线。

**Implementation:**

1. 增加 fixed Instant + fixed IANA zone fixtures；
2. 明确现实现哪些 case 依赖 host timezone；
3. 为目标行为写 failing tests；
4. 冻结 DST resolution expectation；
5. 记录当前 compatibility consumers (`number`, `Date`, `defaultTime`)。

**Tests:** `time:test` focused + recurrence conformance。

**Acceptance:** 能清楚证明 host TZ 改变目前哪些结果，并有目标 invariant tests。

**Dependencies:** FOUNDATION-1001。

**Closure evidence:**

- new `host-timezone-characterization.spec.ts` proves legacy Calendar drift under process `TZ`;
- explicit Asia/Tokyo wall-clock conversion is host-independent;
- New York spring gap is frozen as shift-forward and fall overlap as earlier occurrence;
- locale is characterized as currently ignored by date/dateTime engine formatting, while `weekStartsOn` is honored;
- existing recurrence conformance protects Tokyo/New York DST behavior;
- compatibility inventory records `defaultTime`, `Instant | number` and JS `Date` surfaces for TIME-1202..1206 retirement.

---

### TIME-1202 — Introduce branded TimeZoneId, TimeContext and PresentationStyle

**状态：DONE（2026-09-09）**

**Goal:** 建立新 canonical contract，不先大规模迁 consumer。

**Scope:**

```text
TimeZoneId
TimeContext
TimePresentationStyle
legacy TimeStyle adapter
```

**Protected contracts:** `Instant/Ymd/Hm`, current facade call sites通过 bounded adapter继续编译。

**Implementation:**

1. 把 TimeZoneId constructor/validator集中；
2. 定义 TimeContext；
3. 拆 Presentation fields；
4. 更新 facade options；
5. 提供明确 legacy adapter；
6. 更新 Setting `UserTimeContextPort` adapter target；
7. 禁止 Time package import Setting。

**Acceptance:** 新 API strict typed；无任意 string canonical zone；legacy adapter有 retire marker。

**Dependencies:** TIME-1201。

**Closure evidence:**

- `TimeZoneId` is now a validated branded type; `parseTimeZoneId` / `requireTimeZoneId` / `createTimeContext` own raw-string boundaries;
- canonical `TimeContext { timeZone, weekStartsOn }` and `TimePresentationStyle` are exported from `@memoflow/time`;
- `TimeFacade` exposes `context`, `presentation`, `withContext` and `withPresentation`;
- legacy mixed `TimeStyle` remains explicitly deprecated behind `adaptLegacyTimeStyle` / `composeLegacyTimeStyle`;
- Codec receives canonical context timezone instead of deriving its default from mixed presentation style;
- Time package imports no Setting/Account code;
- full Time suite 44/44 PASS; Task recurrence 10/10, Routine trigger/persistence 18/18, Planner projection/router 12/12 PASS;
- Time, Task, Reminder, Goal and app-vue typechecks passed (app-vue completed successfully before the outer remote-command timeout); Time lint has 0 errors / 1 inherited warning.

---

### TIME-1203 — Make Calendar/Input wall-clock operations timezone-aware

**状态：DONE — 2026-09-09**

**Goal:** 让 Product Time 业务日历语义真正由 TimeContext 决定。

**Scope:**

```text
toYmd
start/endOfDay
startOfWeek
isSameDay/isToday
diff calendar day/week
Ymd+Hm -> Instant
```

**Implementation:**

1. 选择/reuse Intl/date-fns/@internationalized-date 组合；
2. adapter 隔离 third-party types；
3. 实施 WallClockResolutionPolicy；
4. 与 recurrence adapter共享同一 wall-clock resolution primitive；
5. 删除 recurrence 与 base engine重复 timezone conversion；
6. 验证 host independence。

**Acceptance:** 相同 `Instant + TimeContext` 跨 host zone结果一致；DST fixtures green。

**Dependencies:** TIME-1202。

**Closure evidence:**

- canonical Calendar (`toYmd`, start/end of day, add/diff calendar day/week, week start, same-day/today) now evaluates against explicit `TimeContext`, not host-local `Date` semantics;
- Input date/time values and Codec Ymd/start-of-Ymd resolution use the same context timezone;
- wall-clock conversion moved into one `timezone/wall-clock` primitive shared by Calendar/Codec/Input and the rrule adapter; duplicate timezone resolution code was removed from the date-fns engine;
- explicit policy is frozen as DST gap `shift-forward` and overlap `earlier`; Tokyo host-independence and New York 23-hour DST-day fixtures are executable;
- Time suite: 9 files / 48 tests PASS; Time typecheck PASS;
- Task recurrence/DST consumers were fixed to use one coherent local TimeContext per operation instead of mixing a module-captured facade with a later `local` zone; Task full suite: 71 files / 690 tests PASS; Task typecheck PASS;
- focused Routine trigger/persistence 23/23, Goal schedule projection 7/7, app-vue Planner 15/15 PASS.

---

### TIME-1204 — Make Format locale/timezone aware

**状态：DONE**

**Goal:** 兑现 PresentationStyle 的 locale/timezone contract。

**Scope:** date/dateTime/hm/relative/ymd display；12/24h；named slots。

**Implementation:**

1. ordinary human display 优先 Intl；
2. 保留必要 date-fns fixed-pattern engine slots；
3. timezone 从 TimeContext 注入；
4. locale fixture；
5. 迁移 fixed Chinese pattern；
6. 不把 pattern token变 preference API。

**Acceptance:** zh-CN/en-US + timezone fixtures是真实行为差异而非 ignored params。

**Dependencies:** TIME-1202, TIME-1203。

**Closure evidence:**

- canonical `format.date/dateTime/hm/relative/ymdDisplay/slot` now uses `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` with explicit `TimeContext.timeZone` and `TimePresentationStyle.locale`;
- `TimePresentationStyle` now owns semantic `dateStyle: short|medium|long` and `timeStyle: 12h|24h`; the legacy date-fns pattern bag remains only inside deprecated `TimeStyle` for TIME-1206 deletion;
- 24-hour rendering uses explicit `h23`; Tokyo / Los Angeles fixtures prove context-zone display differences, and zh-CN / en-US fixtures prove locale is no longer ignored;
- `Ymd` display/validation is host-independent, including a Pacific/Apia skipped-calendar-day fixture;
- named calendar slots are semantic Intl presets rather than preference-stored format tokens;
- the fixed chart/export pattern escape hatch is isolated behind `TimeEngine` and now reuses official `@date-fns/tz@1.5.0` `TZDateMini`; no timezone type leaks into `@memoflow/contracts`;
- all current production fixed patterns (`yyyy-MM-dd HH:mm`, `MM-dd`, `MM-dd HH:mm`, `yyyy-MM-dd'T'HH:mm`, `MMM d`) are covered by a host-timezone-independence fixture; an explicit offset fixture also covers a host DST gap;
- independent reviewer verification with Nx cache disabled: Time 10 files / 56 tests PASS, Time typecheck PASS, Time lint PASS; focused app-vue Product Time/Schedule 5 files / 15 tests PASS;
- Codex implementation verification after the reviewer repair: app-react typecheck PASS, app-vue typecheck PASS, Time build PASS.

---

### TIME-1205 — Switch cross-module Product Time consumers

**状态：PLANNED**

**Goal:** Goal/Task/Routine/Planner/Notification/AI/Settings 使用统一新 context，不保留 host-local业务 fallback。

**Scope:** 只迁语义消费者，不重构 owner domain model。

**Implementation lanes:**

```text
A Task/Routine recurrence & day boundaries
B Planner/calendar projection
C Notification QuietHours
D Setting/UserTimeContext adapter
E AIContext time context
F UI presentation facades
```

**Acceptance:** business server paths不依赖 ambient host timezone；explicit schedule snapshot仍稳定。

**Dependencies:** TIME-1203, TIME-1204；与对应 owner vNext计划协调。

---

### TIME-1206 — Retire legacy Date/number/TimeStyle compatibility surfaces

**状态：PLANNED**

**Goal:** 新模型成为 sole canonical API。

**Scope:**

- narrow/remove `Instant | number` public API；
- move/remove `Date -> Ymd` convenience；
- retire mixed TimeStyle canonical status；
- update Time Registry/ESLint/surface locks；
- remove stale exemptions only with evidence。

**Acceptance:** production canonical Calendar/Format APIs以 branded primitives为主；legacy names只在明确 boundary或 migration fixture。

**Dependencies:** TIME-1205。

---

### LABEL-1301 — Characterize Label registry and assignment behavior before ownership move

**状态：PLANNED**

**Goal:** 锁住当前用户行为，避免 ownership migration破坏功能。

**Scope:** create/rename/delete/list/search；AI resolveNames；Goal/Task replace；AND filter；foreign identity；Prisma/PowerSync parity；cascade delete。

**Acceptance:** registry行为和 owner-assignment行为分开有 characterization suite。

**Dependencies:** FOUNDATION-1001。

---

### LABEL-1302 — Pure Label Registry repository/service contract

**状态：PLANNED**

**Goal:** Label package不再认识 Goal/Task。

**Scope:**

```text
create/update/delete/find/list
findByNormalizedNames
resolveNames
```

**Implementation:**

1. 增加 batch lookup；
2. 修改 resolveNames；
3. 新建纯 registry interface；
4. 保留短期 assignment compatibility seam；
5. 增加 architecture test禁止 Goal/Task symbols进入 Label domain/application contract。

**Acceptance:** pure registry单测/Prisma/PowerSync registry tests green。

**Dependencies:** LABEL-1301。

---

### LABEL-1303 — Move GoalLabel assignment/query ownership into Goal

**状态：PLANNED**

**Goal:** Goal成为 GoalLabel唯一 owner。

**Scope:** Goal assignment mutation、list projection、batch projection、`labelIdsAll` AND filter、Prisma/PowerSync adapters/contracts。

**Implementation:**

1. Goal-side repository/application seam；
2. same-identity Label validation via registry；
3. move Prisma/PowerSync logic；
4. move GoalLabelAssignmentCommand contract；
5. host/API/UI behavior保持；
6. remove Label Goal methods only after parity。

**Acceptance:** Goal user path无行为回退；Label package无 Goal-specific method。

**Dependencies:** LABEL-1302。

---

### LABEL-1304 — Move TaskLabel assignment/query ownership into Task

**状态：PLANNED**

同 LABEL-1303，但针对 TaskPlan / TaskLabel。

**Protected:** Task vNext canonical `TaskPlan` vocabulary；DB legacy column mapping `task_template_id` 可在独立 schema migration处理，不能重新把 `TaskTemplate` domain symbol带回。

**Acceptance:** Task AND filter/projection/AI apply parity；Label package无 Task-specific method。

**Dependencies:** LABEL-1302。

---

### LABEL-1305 — Converge Label primitives: Instant, normalization fixture, color policy

**状态：PLANNED**

**Goal:** Shared Label foundation自身 contract 收紧。

**Scope:**

- timestamps -> Instant；
- injected Clock；
- canonical normalization fixture；
- choose palette-token vs strict hex based on actual UI/data inventory；
- strict client/server schema；
- migration if existing color values require it。

**Acceptance:** no `Date.now()` in Label app/domain；normalization parity；color不接受 arbitrary string。

**Dependencies:** LABEL-1302；可与 1303/1304部分并行，但 schema migration owner单写者。

---

### FOUNDATION-1401 — Five-layer review, governance and closure

**状态：PLANNED**

**Goal:** Time/Label new model成为代码真值后完成系统级 closure。

**Layer 1 Contract correctness**

- TimeContext/zone/DST；
- Label ownership/identity。

**Layer 2 Vertical completeness**

- Time: contracts -> facade -> owner consumers -> UI；
- Label: registry -> Goal/Task assignment -> Prisma/PowerSync -> HTTP/IPC/UI/AI。

**Layer 3 Behavior**

- cross-host timezone；
- DST；
- locale；
- recurrence；
- label rename/delete/create race；
- AND filter；
- foreign identity。

**Layer 4 Engineering**

- no date-fns leakage；
- no Label->Goal/Task dependency；
- no polymorphic assignment bag；
- no dual canonical TimeStyle；
- no raw number/date resurrection。

**Layer 5 Plan/docs integrity**

- ADR/product docs reflect implemented truth；
- current-system docs标记历史；
- plan evidence完整；
- exact-head required CI green。

**Final gates:** focused time/label suites、Goal/Task/Routine/Planner/Notification regressions、Prisma/PowerSync parity、typecheck/lint/build/docs/governance、exact-head CI。

**Dependencies:** TIME-1206, LABEL-1303, LABEL-1304, LABEL-1305。

## 6. Dependency graph

```text
FOUNDATION-1001
   ├──────────── Time lane ─────────────────────────────┐
   │ TIME-1201 -> 1202 -> 1203 -> 1204 -> 1205 -> 1206 │
   │                                                    │
   └──────────── Label lane ────────────────────────────┤
     LABEL-1301 -> 1302 -> 1303 ─┐                     │
                         -> 1304 ├->                    │
                         -> 1305 ┘                      │
                                                       ▼
                                                FOUNDATION-1401
```

Time 与 Label 两条 lane 可以高度并行；共享冲突主要在 contracts primitives、Goal/Task consumer files、Prisma/PowerSync schema generated artifacts，需单写者协调。

## 7. Current status

```text
FOUNDATION-1001 DONE — docs only
TIME-1201 DONE — executable characterization
TIME-1202 DONE — canonical context/presentation split
TIME-1203 DONE — timezone-aware Calendar/Input + shared wall-clock resolver
TIME-1204 DONE — locale/timezone-aware Intl presentation + official date-fns/tz pattern adapter
TIME-1205..1206 PLANNED
LABEL-1301..1305 PLANNED
FOUNDATION-1401 PLANNED
```

Time lane 已进入实施期；TIME-1203 已把 canonical Calendar/Input 切到显式 TimeContext，TIME-1204 已让 human-visible Format 真正消费 locale/timezone/dateStyle/timeStyle。剩余跨模块 host-local/static consumer fallback 与 legacy Date/number/TimeStyle surface 由 TIME-1205/1206 直接删除。

## 8. Definition of Done

```text
Product Time
= explicit timezone-aware TimeContext
+ locale-aware presentation
+ branded canonical inputs
+ protected recurrence engine boundary

Shared Label
= pure registry
+ owner-owned assignments
+ Instant/Clock
+ normalized identity
+ typed color

No host-local business time truth
No Label God repository
No dual canonical compatibility track
```
