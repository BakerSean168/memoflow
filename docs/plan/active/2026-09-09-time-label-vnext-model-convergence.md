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
updated: 2026-09-09T23:24:35+08:00
---

# Time + Label vNext Model Convergence

> **System-wide execution-order notice (2026-09-09):** 本文继续作为模块内部 ticket/验收细节真值；跨模块执行顺序、共享 schema 单写者与 destructive cutover gate 由 [`2026-09-09-system-wide-vnext-model-convergence-implementation.md`](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) 统一协调。
>
> **ADR-111 zero-legacy-data override:** 本文中所有仅用于保存当前旧数据/旧备份/旧客户端的 migration、backfill、compatibility reader/adapter、dual-read/write、redirect window、before/after old-data parity 要求均已被 ADR-111 supersede。领域目标与行为验收继续有效；实施时直接切 current consumers、删除旧 surface、reset/reseed persistence。

## ADR-111 execution rewrite

- the temporary legacy `TimeStyle` adapter introduced by TIME-1202 was deletion debt, not a compatibility promise, and was removed by TIME-1206;
- `TIME-1205` switched all current product consumers to strict TimeContext/branded primitives; `TIME-1206` then deleted Date/number/legacy style surfaces and locked the result with governance;
- `LABEL-1303/1304` move assignment ownership directly to Goal/Task; no temporary assignment compatibility seam;
- `LABEL-1305` chooses the target color contract from current UI requirements; no existing-value data migration is required.

**状态：ACTIVE — local closure complete / exact-head CI pending**
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
- `TimePresentationStyle` now owns semantic `dateStyle: short|medium|long` and `timeStyle: 12h|24h`; the temporary mixed `TimeStyle` used during this stage was subsequently removed by TIME-1206;
- 24-hour rendering uses explicit `h23`; Tokyo / Los Angeles fixtures prove context-zone display differences, and zh-CN / en-US fixtures prove locale is no longer ignored;
- `Ymd` display/validation is host-independent, including a Pacific/Apia skipped-calendar-day fixture;
- named calendar slots are semantic Intl presets rather than preference-stored format tokens;
- the fixed chart/export pattern escape hatch is isolated behind `TimeEngine` and now reuses official `@date-fns/tz@1.5.0` `TZDateMini`; no timezone type leaks into `@memoflow/contracts`;
- all current production fixed patterns (`yyyy-MM-dd HH:mm`, `MM-dd`, `MM-dd HH:mm`, `yyyy-MM-dd'T'HH:mm`, `MMM d`) are covered by a host-timezone-independence fixture; an explicit offset fixture also covers a host DST gap;
- independent reviewer verification with Nx cache disabled: Time 10 files / 56 tests PASS, Time typecheck PASS, Time lint PASS; focused app-vue Product Time/Schedule 5 files / 15 tests PASS;
- Codex implementation verification after the reviewer repair: app-react typecheck PASS, app-vue typecheck PASS, Time build PASS.

---

### TIME-1205 — Switch cross-module Product Time consumers

**状态：DONE — 2026-09-09**

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

**Closure evidence:**

- Goal Review/Habit、Task recurrence/generation/dashboard/stats/outcome、Routine/Reminder upcoming/today schedule、Task/Goal schedule projection 均由 identity-scoped `UserTimeContextPort` 或显式 schedule snapshot 解析 calendar/wall-clock；New York spring-forward 23h day 有行为锁；
- Notification QuietHours fail-closed 获取 identity `TimeContext`；rolling `maxPerHour/maxPerDay`、retention 与 response-analysis lookback 明确保留 duration semantics，不误改为 calendar-day；
- Setting 的 `PreferenceUserTimeContextAdapter` 以 canonical `presentation | regional` preference 为唯一 Product Time 来源；`SETTING-9203` 与本 ticket 同批完成；
- AI runtime 将 identity time context 注入 Mastra request context；Task/Goal planning mapper 统一复用 `@memoflow/time` wall-clock/Ymd primitive，不再维护私有 `Intl + UTC guess` 算法；
- Planner FullCalendar 绑定 session IANA `timeZone + weekStartsOn`，Vue calendar key/HH:mm/date input/default +30 days 统一走 session Product Time；显式 schedule timezone snapshot 仍保持其 owner 语义；
- verification：Goal `80 files / 446 tests` + typecheck PASS；Task `71 / 698` + typecheck PASS；Reminder `74 / 470` + typecheck PASS；Notification `45 / 244` + typecheck PASS；Setting `22 / 142` + typecheck PASS；Schedule `20 / 130` + typecheck PASS；Account `26 / 189` + typecheck PASS；AI focused `3 / 14` + typecheck PASS；App Vue Planner/Product-Time focused `6 / 23` PASS；canonical Settings UI focused `3 / 7` PASS；
- App Vue/Web package-wide typecheck仍被当前工作树既有的 `@memoflow/app-vue/web-*` 与 `ai/label/schedule client` declaration baseline 阻塞；相关错误不落在 TIME-1205 修改文件，focused behavior gates 已覆盖本 ticket；
- 无 current production caller 的 Task/Goal ambient compatibility facade、legacy Date/number helpers 与 demo-only defaultTime wrappers 明确进入 `TIME-1206`，不在本 ticket 扩大 owner-model 删除范围。

**Dependencies:** TIME-1203, TIME-1204；与对应 owner vNext计划协调。

---

### TIME-1206 — Retire legacy Date/number/TimeStyle compatibility surfaces

**状态：DONE — 2026-09-09**

**Goal:** 新模型成为 sole canonical API。

**Scope:**

- narrow/remove `Instant | number` public API；
- move/remove `Date -> Ymd` convenience；
- retire mixed TimeStyle canonical status；
- update Time Registry/ESLint/surface locks；
- remove stale exemptions only with evidence。

**Acceptance:** production canonical Calendar/Format APIs以 branded primitives为主；legacy names只在明确 boundary或 migration fixture。

**Closure evidence:**

- `createTimeFacade` 现在强制显式 `TimeContext`；`defaultTime`、mixed `TimeStyle/PartialTimeStyle`、`withStyle`、`DEFAULT_TIME_STYLE`、ambient `formatLocalHHmm/formatDateToYMD` 与 deprecated `FormatApi.localHHmm/dateToYmd` 已从 production public surface 删除；
- Account birthday 从 wire/domain/exported Vue surface 统一为 validated `Ymd | null`，拒绝 legacy epoch；年龄/未来日期判断要求显式 reference Ymd；
- Task 删除 dead recurrence/day-query convenience，legacy schedule persistence projection 只接受显式 `TimeContext`；TaskOccurrence persistence 与 Product Time 派生 read DTO 分离，occurrence key/overdue/due projection 强制 context；
- Goal 删除无 production caller 的 `GoalTimeRange` 行为类与 `extend/shorten/isOverdue/getRemainingDays` 固定 24h/ambient-now convenience；
- Vue/React session bootstrap 显式从 boundary device IANA zone 构造 guest context，登录后由 canonical preferences 覆盖；CalendarDate 只在 UI adapter 与 `Ymd` 往返，不再经 browser-local epoch；
- Time Registry v2 不再含 legacy/exemption importer；ESLint date-fns ignores 收敛到 `packages/time/src/engine/**`；`date-fns-import-audit` 不再支持 legacy allowlist；新增 `product-time-surface-audit` 并接入 root governance gate，禁止 ambient/mixed surface resurrection；
- verification：Time `10 files / 52 tests` + typecheck + lint PASS；Task `71 / 678` + typecheck PASS；Goal `80 / 446` + typecheck PASS；Reminder `74 / 470` + typecheck PASS；Notification `45 / 244` + typecheck PASS；Setting `22 / 142` + typecheck PASS；Schedule `20 / 130` + typecheck PASS；Account `26 / 190` + typecheck PASS；AI `78 / 420` + typecheck PASS；App Vue Product Time focused `8 / 27` PASS；governance-tools `14 / 120` PASS；`git diff --check`、Product Time/date-fns focused audits PASS。

**Dependencies:** TIME-1205。

---

### LABEL-1301 — Characterize Label registry and assignment behavior before ownership move

**状态：DONE — 2026-09-09**

**Goal:** 锁住当前用户行为，避免 ownership migration破坏功能。

**Scope:** create/rename/delete/list/search；AI resolveNames；Goal/Task replace；AND filter；foreign identity；Prisma/PowerSync parity；cascade delete。

**Acceptance:** registry行为和 owner-assignment行为分开有 characterization suite。

**Closure evidence:**

- Registry characterization 独立覆盖 canonical create、rename/recolor、normalized search、identity isolation、delete、AI `resolveNames` first-seen dedupe 与 concurrent unique-race exact re-read；
- Assignment characterization 独立覆盖 Goal/Task replace dedupe、empty clear、same-identity validation、duplicate-insensitive AND filter、batch projection empty-owner shape；
- Prisma real-DB suite 锁住 identity-scoped normalized uniqueness、CRUD/search stable ordering、foreign label/owner fail-before-replace、Label→GoalLabel/TaskLabel cascade 与 owner-specific cascade；
- PowerSync suite 锁住 transaction ordering、validation-before-delete、deduped inserts、Goal/Task AND 与 batch projection parity；
- SETTING-9203 follow-up finding：shared `seedAccount()` 与四个 direct Prisma integration fixtures 仍写已删除 `Account.settings`，已清除；Label integration 从 seed-stage 3/3 failure 恢复并扩为 5/5 PASS；Goal 7/7、Setting 2/2、Repository 17/17 affected integration fixtures PASS；
- verification：Label unit `5 files / 20 tests` PASS；Prisma integration `5/5` PASS；Label typecheck/lint/diff-check PASS；`@memoflow/test-utils` typecheck PASS。

**Dependencies:** FOUNDATION-1001。

---

### LABEL-1302 — Pure Label Registry repository/service contract

**状态：DONE — 2026-09-09**

**Goal:** Label package不再认识 Goal/Task。

**Scope:**

```text
create/update/delete/find/list
findByNormalizedNames
resolveNames
```

**Implementation:**

1. 增加 exact batch `findByNormalizedNames` lookup；
2. `resolveNames` 从最多扫描 500 labels 改为按目标 normalized names 精确查询，并保留 unique-race exact re-read；
3. `LabelRepository` 收敛为纯 registry interface；Prisma adapter 只 `Pick<PrismaClient, 'label'>`，PowerSync adapter 只访问 `labels`；
4. 审查确认旧 `LabelService.setGoalLabels/setTaskLabels` 与 Label-side Goal/Task assignment repository **production caller = 0**，且 Goal/Task 已各自拥有完整 assignment seam，因此直接删除重复实现，不制造临时 compatibility port；
5. 删除 Label contracts 中 `LabelAssignmentCommand / GoalLabelAssignmentCommand / TaskLabelAssignmentCommand`；
6. package-local ownership surface test + root `label-registry-ownership-audit` 禁止 Goal/Task assignment symbols/table names回流 Label。

**Closure evidence:**

- Label production/contracts owner-specific residual scan = 0；Label build 生成的 `.d.ts` 同样无 Goal/Task assignment symbol；
- Label unit `5 files / 15 tests` PASS；Prisma Registry integration `1 file / 3 tests` PASS；typecheck/lint/build/diff-check PASS；
- PowerSync Registry suite锁住 exact batch lookup、normalized substring search/limit、identity-scoped find/delete 与“registry CRUD 不开 owner-assignment transaction”；
- `resolveNames` first-seen dedupe、existing lookup 与 concurrent unique-race recovery全部走 exact normalized-name API。

**Acceptance:** pure registry单测/Prisma/PowerSync registry tests green；Label package不认识 Goal/Task assignment。

**Dependencies:** LABEL-1301。

---

### LABEL-1303 — Move GoalLabel assignment/query ownership into Goal

**状态：DONE — 2026-09-09**

**Goal:** Goal成为 GoalLabel唯一 owner。

**Scope:** Goal assignment mutation、list projection、batch projection、`labelIdsAll` AND filter、Prisma/PowerSync adapters/contracts。

**Implementation result:**

审查发现 Goal-side ownership 已在当前 production path 完整存在，不需要再搬一次代码：`IGoalRepository.replaceLabels`、Prisma/PowerSync adapters、create/update application wiring、projection 与 `labelIdsAll` AND filter 均由 Goal owner。1302 删除了 Label duplicate path，本 ticket 只补齐缺失 parity evidence 并确认 host behavior。

**Closure evidence:**

- Goal Prisma real-DB integration 已覆盖 replace、projection、duplicate-insensitive AND 与 foreign label -> `GoalLabelOwnershipError`；
- 新增 Goal PowerSync real SQLite parity：replacement dedupe、projection、AND、foreign label fail-before-delete、foreign owner rejection 与原 assignment 保留，`2/2` PASS；
- Goal create/update/list application tests继续验证 owner repository wiring 与 typed error mapping；
- Goal full unit `81 files / 448 tests` PASS；integration `4 files / 21 tests` PASS；direct TypeScript check PASS；
- Label production/contracts 已无 Goal-specific method/command/table SQL。

**Acceptance:** Goal user path无行为回退；Goal为 GoalLabel唯一 application/persistence owner；Label package无 Goal-specific method。

**Dependencies:** LABEL-1302。

---

### LABEL-1304 — Move TaskLabel assignment/query ownership into Task

**状态：DONE — 2026-09-09**

同 LABEL-1303，但针对 TaskPlan / TaskLabel。审查确认 Task owner path 已完整存在：`ITaskPlanRepository.replaceLabels / findByLabelIdsAll`、Prisma/PowerSync、create/update/list application wiring 都是当前 production truth；1302 删除的是 Label duplicate path。

**Protected:** Task vNext canonical `TaskPlan` vocabulary；DB legacy column mapping `task_template_id` 仅作为 persistence schema name保留，不能重新把 `TaskTemplate` domain symbol带回。

**Closure evidence:**

- Task Prisma real-DB integration覆盖 replace、projection、AND 与 foreign label typed rejection；
- Task PowerSync suite覆盖 duplicate-insensitive AND、label projection、foreign label -> `TaskLabelOwnershipError` 且 no-write；
- create/update/list application tests继续验证 owner-side assignment/filter wiring，AI apply 只经 `LabelService.resolveNames` 取 IDs 后进入 Task application port；
- cross-package review 额外发现 TIME-1206 test/build seams：performance evaluator缺显式 context、host-local UTC expected、integration `TaskOccurrence.create`/module options/legacy schedule request；均迁为 explicit `TimeContext` + canonical schedule；
- Task unit `71 files / 678 tests` PASS；integration `6 files / 31 tests` PASS；build + direct TypeScript check PASS；
- Label production/contracts 无 Task-specific assignment method/command/table SQL。

**Acceptance:** Task AND filter/projection/AI apply parity；Task为 TaskLabel唯一 application/persistence owner；Label package无 Task-specific method。

**Dependencies:** LABEL-1302。

---

### LABEL-1305 — Converge Label primitives: Instant, normalization fixture, color policy

**状态：DONE — 2026-09-09**

**Goal:** Shared Label foundation自身 contract 收紧。

**Scope:**

- timestamps -> Instant；
- injected Clock；
- canonical normalization fixture；
- choose palette-token vs strict hex based on actual UI/data inventory；
- strict client/server schema；
- migration if existing color values require it。

**Implementation result:**

- `LabelDto.createdAt/updatedAt` 收敛到 canonical `Instant` type；runtime client/Goal projection timestamps 要求 finite number；
- `LabelService` 必须注入最窄 `Clock.now()` seam；create 单次采样同时写 created/updated，update 显式把 Clock Instant 传给 repository；API/Desktop composition 都注入 `createSystemClock()`；
- Prisma update 不再依赖 DB `@updatedAt` 当前时间，PowerSync 删除自己的 `Date.now()`；Label application/domain ambient current-time scan = 0；
- canonical normalization fixture 位于 `tools/test/fixtures/label-normalization.json`，同时驱动 Label server semantics 与 legacy Task -> Shared Label migration；Nx unit/coverage inputs 显式包含 fixture，避免 fixture 修改命中旧 cache；
- 基于真实 UI/data inventory 选择 ADR-103 Option B：`LabelColor = #RRGGBB | null`，输入允许 hex 大小写但 canonicalize 为 lowercase `#rrggbb`；当前 Label UI 无 palette-token picker，未发现 production Label 非 6 位 hex/null 数据，因此不需要 color data migration；
- Label transport/service/Prisma/PowerSync 以及 Goal/Task owner-side Label projection 全部复用 `LabelColorSchema`；Task read contract直接复用 `LabelClientDTOSchema`，Goal projection复用 `LabelColorSchema`；
- 新增 root `label-primitive-audit`，持续禁止 Label app/domain ambient time、缺失 Clock injection、任意 color contract 与 owner projection bypass。

**Closure evidence:**

- Contracts Label + Goal projection focused `2 files / 14 tests` PASS；Database canonical normalization migration `1 / 4` PASS；
- Label unit `5 files / 17 tests` PASS；Prisma integration `1 / 3` PASS；package direct TSC 0 errors、build PASS、lint PASS；
- Goal `81 files / 448 tests` + integration `4 / 21` PASS；1305-related direct TSC diagnostics = 0（workspace仍有独立 utils declaration/build-order baseline）；
- Task `71 files / 678 tests` + integration `6 / 31` PASS；
- `label-registry-ownership-audit`、`label-primitive-audit`、`git diff --check` PASS。

**Acceptance:** no `Date.now()` in Label app/domain；normalization parity；color不接受 arbitrary string；所有 production Clock/color read path 有 anti-resurrection guard。

**Dependencies:** LABEL-1302；与已完成的 LABEL-1303/1304 owner path 对齐。

---

### FOUNDATION-1401 — Five-layer review, governance and closure

**状态：LOCAL CLOSURE COMPLETE — 2026-09-09 / exact-head CI pending**

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

**Local closure evidence (2026-09-09):**

- Layer 1 / Product Time：canonical Time suite 在 `TZ=UTC` 与 `TZ=Asia/Tokyo` 下均为 `10 files / 52 tests PASS`；TimeContext、DST/wall-clock resolver、locale/presentation contract 均保持显式 context；
- Layer 1 / Label：Label registry-only ownership、identity-scoped CRUD/search、strict `LabelColor`、`Instant + injected Clock`、canonical normalization fixture 均由 package tests + root anti-resurrection audit锁定；
- Layer 2：Goal `81/448 unit + 4/21 integration`，Task `71/678 unit + 6/31 integration`，Reminder/Routine `74/470 unit + 7/28 integration`，schedule-orchestration `9/34`，Notification `45/244 unit + 3/35 integration`，Setting `22/142 unit + 1/2 integration`，Schedule `20/130 unit + 2/24 integration` 全绿；
- Layer 2 / UI：App Vue Product Time / Planner / presentation focused gate `13 files / 48 tests PASS`，package direct `vue-tsc` exit 0，production build PASS；
- Layer 3 / Label lifecycle：host-level PostgreSQL integration验证 Label rename 后 Goal/Task assignment继续指向同一 LabelId；删除 Label 只 cascade join rows，不删除 Goal/Task owner；create race、AND filter、foreign identity分别由 registry/Goal/Task owner tests锁定；
- Layer 3 / Notification：终审发现 UTC DND fixtures 使用 timezone-less ISO，受同进程 `process.env.TZ` 修改污染；改为显式 `Z` 后 full unit suite连续两次 `244/244 PASS`；旧 Prisma integration builders补齐 required `UserTimeContextPort` 后 `35/35 PASS`；
- Layer 3 / integration infrastructure：共享 PostgreSQL清库只对 transient `40P01 deadlock` 做最多 3 次短重试，其他错误继续 fail closed；
- Layer 4：`product-time-surface-audit`、`date-fns-import-audit`、`label-registry-ownership-audit`、`label-primitive-audit` 全绿；补充源码 scan确认 Label owner leakage = 0、polymorphic assignment bag = 0、业务层 date-fns direct import = 0；governance-tools `14 files / 120 tests PASS`；
- Layer 4 / lint：终审发现并删除 Task 4 个 TIME-1206 stale symbols，并把 App Vue 11 个 reactive dependency reads从 bare expression改为 `void productTimeRevision.value`；Task/App Vue lint恢复 0 errors，行为回归仍分别 `678/678` 与 `48/48`；
- Layer 5 / build：Time、Label、Goal、Task、Reminder、Notification、Setting、Schedule、schedule-orchestration、App Vue 共 10 个影响域 production build PASS；Task/Notification/Setting/Schedule typecheck 与 App Vue direct `vue-tsc` PASS。

**Remaining delivery gate:** 当前工作树尚未形成可引用的提交 SHA，因此不能声称 exact-head required CI green。FOUNDATION-1401 的本地五层 closure 已完成；正式 `DONE` 只在 convergence changes提交/推送后、required CI 对该 exact HEAD 全绿时落账。

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
TIME-1205 DONE — cross-module Product Time consumers
TIME-1206 DONE — legacy Date/number/TimeStyle surface retired + anti-resurrection governance
LABEL-1301 DONE — registry/assignment characterization
LABEL-1302 DONE — pure Shared Label Registry
LABEL-1303 DONE — Goal-owned GoalLabel assignment/query
LABEL-1304 DONE — Task-owned TaskLabel assignment/query
LABEL-1305 DONE — Instant/Clock/normalization/typed color primitives
FOUNDATION-1401 LOCAL CLOSURE COMPLETE — exact-head CI pending
```

Time lane（TIME-1201～1206）与 Label lane（LABEL-1301～1305）均已闭合并接入 anti-resurrection governance；FOUNDATION-1401 本地五层终审已完成。剩余仅为提交后的 exact-head required CI delivery gate。

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
