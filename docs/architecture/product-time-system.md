---
tags:
  - architecture
  - time
  - contracts
  - domain
  - style
description: 产品时间体系详设——类型谱、门面 API、Style、Codec 与 DomainDate/TransferDate、治理与迁移波次
created: 2026-07-26T00:00:00
updated: 2026-09-09T00:30:00+08:00
---

# 产品时间体系（Product Time System）

> **2026-09-09 target notice：** 本文仍是 ADR-037 的现有详设；Time vNext 第二轮目标以 ADR-100/101 与 `docs/architecture/time-label-vnext-foundations.md` 为准。实施完成前不要把 timezone-aware target 冒充成当前代码行为。

> **宪法：** [ADR-037](./adr/ADR-037-product-time-system.md)（已采纳）  
> 本文是可实施的详设；与 ADR 冲突时以 ADR 决策为准，并回头修正本文。

---

## 1. 目标一句话

> **开源库只做引擎；`@memoflow/time` 做产品时钟、契约编解码与风格；contracts 持有品牌类型真相；领域存 Instant/Ymd；模块 presentation 只拼业务句子；组件禁止私养 formatDate、禁止直连 date-fns。**

---

## 2. 逻辑分层

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ L5  UI / Application（Vue · React · Desktop · 脚本消费者）                 │
│     只 import @memoflow/time（及 L4 presentation）                         │
├──────────────────────────────────────────────────────────────────────────┤
│ L4  Module Presentation                                                    │
│     schedule-presentation / task-presentation …                            │
│     允许：i18n、多字段文案、业务 label                                      │
│     禁止：pad、parse、date-fns、toLocale*、私有 formatDate                  │
├──────────────────────────────────────────────────────────────────────────┤
│ L3  @memoflow/time  Product Facade                                         │
│     Clock · TimeStyle · Codec · Format · Input · Calendar                  │
│     + Time Registry 友好 API（查询 boundary/legacy 可选）                    │
├──────────────────────────────────────────────────────────────────────────┤
│ L2  Engine Adapters（可替换）                                              │
│     DateFnsEngine · IntlDisplayEngine · (future TemporalEngine)            │
├──────────────────────────────────────────────────────────────────────────┤
│ L1  Platform：ECMAScript Date / Intl / performance（经 Clock 注入）         │
└──────────────────────────────────────────────────────────────────────────┘

横向：
  contracts/primitives  →  Instant ≡ TransferDate · Ymd · Hm  Domain VO/Entity      →  props 存 TransferDate/Ymd；行为经 Calendar/Clock
  Infra mappers         →  只调用 Codec
```

---

## 3. 类型谱（长期）

### 3.1 规范类型

| 类型           | 底层                                                         | 语义                                        |
| -------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `Instant`      | brand `number`（ms）                                         | UTC 时间轴上的瞬时                          |
| `TransferDate` | **≡ `Instant`**                                              | API/DTO/VO 内部传输名（保留名降低迁移噪音） |
| `Ymd`          | brand `` `${number}-${number}-${number}` `` 或 opaque string | **本地**日历日键 `YYYY-MM-DD`               |
| `Hm`           | brand string                                                 | 本地 `HH:mm`                                |
| `IsoUtc`       | brand string                                                 | 互操作/日志                                 |
| `DurationMs`   | brand number                                                 | 时长毫秒                                    |
| `DurationMin`  | brand number                                                 | 时长分钟（表单）                            |
| `LocaleId`     | BCP 47 string                                                | 来自 preference                             |
| `TimeZoneId`   | IANA string                                                  | 预留；第一版默认 local                      |

### 3.2 过渡类型

| 类型             | 状态                                                        |
| ---------------- | ----------------------------------------------------------- |
| ~~`DomainDate`~~ | **已删除（T10）**；曾 `= Date`；产品字段与 Codec 桥均已退役 |

### 3.3 已删除 / 禁止回潮

| 类型            | 状态                             |
| --------------- | -------------------------------- |
| `DomainDate`    | 不进 contracts；禁止 reintroduce |     | `PersistenceDate` | 不进 contracts；infra 本地 |
| `TransportDate` | 非官方名；文档一律 TransferDate  |

### 3.4 类型放置与依赖

```text
@memoflow/contracts/primitives
  - 定义 brand 类型与（可选）zod 扩展
  - 不依赖 app-vue / 业务实现

@memoflow/time
  - 依赖 contracts primitives（types only + 实现）
  - 不依赖 goal/task/account 业务 module

业务 domain / app
  - 依赖 contracts + @memoflow/time
```

**构造纪律：** brand 值只允许从 Codec / 经测试的 `unsafe` 测试辅助创建；业务禁止 `as Instant` 散落（测试与 codec 内部除外并登记）。

---

## 4. Instant / TransferDate 专题

### 4.1 目标态模式（例：GoalTimeRange）

```text
DTO / VO props : TransferDate (= Instant, number ms)
getter         : Instant
setter         : Instant
contracts      : GoalTimeRange vs GoalTimeRangeDTO 双 interface 名（859 keep-boundary；两侧皆 Instant 语义）
```

### 4.2 字段选型

**瞬时字段：**

```text
DTO / VO props : TransferDate (= Instant)
getter         : Instantsetter         : Instant
UI             : format.*(instant) / input.*(instant)
```

**日历日字段（生日、全天 start、目标日）：**

```text
DTO / VO props : Ymd
getter/setter  : Ymd
UI             : format.ymdDisplay / input.dateValue 基于 Ymd
```

**区间：** 优先显式 `start: Instant, end: Instant` 或 `startDay: Ymd, endDay: Ymd`，避免「Date 午夜」假装全天。

### 4.3 双 shape 保留规则

| 情况                     | 做法                                                        |
| ------------------------ | ----------------------------------------------------------- |
| 两侧同语义同类型         | 允许 type alias，消灭假 dual                                |
| 领域要日历日、传输要瞬时 | **保持双 shape**，字段名也应反映（`startDay` vs `startAt`） |
| 仅 Date vs number 换皮   | **禁止**（DomainDate 已删）                                 |

### 4.4 Codec 接缝（必须）

````text
fromTransfer(t: TransferDate): Instant        // 恒等 + 校验有限
toTransfer(i: Instant): TransferDate

fromYmd / toYmd / parseYmd
combineYmdHm(ymd, hm, tzPolicy) → Instant
startOfYmd(ymd) → Instant                     // 该本地日 00:00

// Prisma / infra only
fromJsDate(d: Date): Instant
toJsDate(i: Instant): Date```

**非法输入：** `onInvalid: 'null' | 'throw'`，**禁止**默认 now。

---

## 5. TimeStyle

### 5.1 配置面（概念）

```text
TimeStyle {
  locale: LocaleId
  timeZone: 'local' | TimeZoneId
  calendar: {
    dayBoundary: 'local-midnight'
    weekStartsOn: 0 | 1 | ...
  }
  empty: {
    display: '-' | '' | '—'
    input: ''
    unknown: '—'   // 或 i18n key 由 L4 解释
  }
  display: {
    date: 'short' | 'medium' | 'long' | Intl options bag
    dateTime: ...
    hm: 'HH:mm'
  }
  relative: {
    enabled: boolean
    maxAge: DurationMs    // 超过改绝对
    numeric: 'auto' | 'always'
  }
  duration: {
    style: 'narrow' | 'long'
    zero: string
  }
}
````

### 5.2 解析优先级

```text
call-site override
  > module/ partial style
    > session preference（语言/地区）
      > app default TimeStyle
```

### 5.3 受管范围

| 受管    | 例子                                                                  |
| ------- | --------------------------------------------------------------------- |
| ✅      | 列表时间、相对时间、表单 date/time、Ymd 键、时长文案、range 展示      |
| ✅ 策略 | 日界、周起始、clock.now                                               |
| ❌      | CSS transition ms、与产品无关的 performance 标记（可保留原始 number） |
| ⚠️      | cron 表达式：领域 + Calendar，不进 UI Format                          |

---

## 6. 门面 API 冻结草案

实施时以 package 导出为准；此处为稳定意图。

### 6.1 Clock

```text
clock.now(): Instant
createFixedClock(instant): Clock
withClock(clock, fn)
```

### 6.2 Codec

见 §4.4；另：

```text
isInstant(n): n is Instant
assertInstant(n): asserts n is Instant
```

### 6.3 Format

```text
format.hm(instant | null, style?)
format.date(instant | null, style?)
format.dateTime(instant | null, style?)
format.monthDay(instant | null, style?)
format.ymdDisplay(ymd | null, style?)
format.relative(instant | null, style?)
format.durationMs(ms | null, style?)
format.durationMin(min | null, style?)
format.range(start, end, style?)
```

`null` → `style.empty.*`，不调用引擎。

### 6.4 Input

```text
input.dateValue(instant | ymd | null): string
input.timeValue(instant | null): string
input.parseDateValue(raw: string): Ymd | null
input.parseTimeValue(raw: string): Hm | null
input.combine(ymd, hm): Instant | null
```

### 6.5 Calendar

```text
calendar.startOfDay(instant): Instant
calendar.endOfDay(instant): Instant
calendar.addDays(instant, n): Instant
calendar.diffCalendarDays(a, b): number
calendar.startOfWeek(instant): Instant
calendar.toYmd(instant): Ymd
calendar.isSameDay(a, b): boolean
calendar.isToday(instant): boolean
```

### 6.6 装配

```text
createTimeFacade({ style, clock, engine }): TimeFacade
time.withStyle(partial): TimeFacade
```

App bootstrap `provide` / React Context；Server 请求级 `withStyle({ locale })`。

---

## 7. 物理包结构

````text
packages/time/                          @memoflow/time
  src/
    types.ts                            re-export primitives + 本地辅助
    style/
    clock/
    codec/
    format/
    input/
    calendar/
    engine/
      date-fns-engine.ts
      intl-display-engine.ts
      types.ts
    facade.ts
    index.ts
    free/format-helpers.ts              公开 free helpers（非 legacy）
  README.md
packages/contracts/src/primitives/
  instant.ts / transfer-date.ts         brand ≡
  ymd.ts / hm.ts

packages/app-vue/src/shared/utils/format-*  → re-export @memoflow/time（dual 路径稳定）
packages/app-vue/src/shared/utils/product-time.ts  session facade + empty-label override```

Nx：`time` project；依赖 `contracts`、`date-fns`；被 app-*、domain packages 依赖。

---

## 8. 治理

### 8.1 Time Registry（`tools/governance/time-registry.json` + 人读 md）

```text
kind: canonical | boundary | legacy | exemption
path / symbol
reason
owner
retire_by?   // legacy/exemption 必填
````

### 8.2 ESLint（目标）

1. `no-restricted-imports`: `date-fns`、`date-fns/*` → 仅 `packages/time/engine/**`
2. apps 内限制 `toLocaleDateString` / `toLocaleString`（测试/story exemption）
3. 限制组件内新建 `function formatDate|formatTime|formatTimestamp`
4. 限制业务 `new Date()` 作为「现在」（鼓励 clock.now）；infra/codec 白名单

分阶段：warn → error + legacy 名单。

### 8.3 Surface / 测试

- Codec round-trip Transfer ↔ Instant
- Ymd 本地日不因 UTC 偏移错日（固定 TZ 测试）
- empty style
- combine Ymd+Hm
- 断供：抽查高流量模块 import 图
- 固定 Clock 的展示快照（关键列表）

### 8.4 与 Dual Registry

| Dual Registry            | Time Registry / ADR-037               |
| ------------------------ | ------------------------------------- |
| dual-retired 文件锁税    | 时间宪法与调用合法性                  |
| keep_boundary 语义双实现 | 时间 boundary 与 Domain/Transfer 语义 |

format 类 keep-boundary 迁移期双写，长期以 Time Registry + canonical API 为准。

---

## 9. 迁移波次（实施顺序）

| 波次                                                                       | 内容                                                                                    | 完成定义                                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **W0**                                                                     | ADR 已采纳；本文；package 骨架；默认 Style；Clock/Codec/Format.hm 最小集；引擎 date-fns | 可编译；样例测试绿                                                           |
| **W1**                                                                     | brand Instant≡TransferDate；Codec；文档 primitives                                      | 类型可被新代码使用                                                           |
| **W2**                                                                     | 上提 app-vue sole（hm、ymd、pad、display…）                                             | app-vue 主路径改 import                                                      |
| **W3**                                                                     | ESLint 断供 date-fns（error + legacy 表）                                               | CI 强制                                                                      |
| **W4**                                                                     | 屠龙组件/Screen 私有 format（含 app-react）                                             | rg 归零（白名单 0）                                                          |
| **W5**                                                                     | Ymd 引入高优先级字段（生日、全天）                                                      | 字段级合约测试                                                               |
| **W6**                                                                     | Domain getter 迁 Instant                                                                | 核心 VO 完成                                                                 |
| **W7**                                                                     | 删除 legacy re-export、utils/date 旧 API                                                | 主路径单一                                                                   |
| **W8**                                                                     | Style 接 presentation preference                                                        | 一处改全局可演示                                                             |
| **T9–T10**                                                                 | DomainDate 类型与 Codec 桥删除；registry 仅 canonical；empty 经 Style                   | 类型谱无 DomainDate                                                          |
| **T11**                                                                    | 收尾体检 + 冗余度量                                                                     | plan §9                                                                      |
| **P1–P10**                                                                 | **第二阶段**（调用层/领域扫尾）：见实施 plan §10                                        | 组件无私有 format*；session 对称；相对/时长/input；Domain Date 清；lint 终态 |
| **每一波：** 最近 nx test + 相关 surface +（触及治理时）governance-check。 |
| **禁止：** 为减 dual 文件数删除仍保护真旁路的断言。                        |

第二阶段刀序与 DoD 的**可执行详设**以  
[`../plan/archive/2026-07-26-product-time-system.md`](../plan/archive/2026-07-26-product-time-system.md) **§10** 为准（P1 Empty Catalog → … → P10 dual 降维；P11 TZ 远期）。
---

## 10. 调用拓扑（目标态）

```text
JSON TransferDate
  → codec (恒等校验)
  → domain 运算 calendar.*
  → 仍 TransferDate 出站
  → UI format.* / input.*

用户选 Ymd + Hm
  → input.combine
  → Instant
  → API TransferDate

通知相对时间
  → format.relative →（阈值外）format.dateTime
```

Infra：

```text
Prisma DateTime → codec.fromJsDate → Instant → 领域
```

---

## 11. 反模式（杀死清单）

| 反模式                                | 替代                     |
| ------------------------------------- | ------------------------ |
| `formatDate(value: any, fmt: string)` | 具名 format.* + 显式类型 |
| 仅 re-export date-fns                 | 真 Facade + Style        |
| `ensureDate` → 非法变 now             | ParsePolicy null/throw   |
| 新字段 `DomainDate`                   | Instant 或 Ymd           |
| 组件 `function formatDate`            | 门面                     |
| 业务 `from 'date-fns'`                | engine only              |
| PersistenceDate 回 contracts          | infra + codec            |
| fileSize 进 time 包                   | 仍 utils/frontend        |
| 静默 merge keep-boundary              | Registry + 改名          |

---

## 12. 成功图像

1. `date-fns` importers ⊆ `packages/time/engine`（+ 空 legacy 表）。
2. apps 无产品私有 `formatDate`/`formatTime`（测试除外）。
3. 改 `TimeStyle.empty.display` 一处，列表空时间全局变。
4. FixedClock 下关键文案稳定可测。
5. 新 contracts 字段无 `DomainDate`；TransferDate 为 brand Instant。
6. 全天/生日为 Ymd，不再用午夜 Date 冒充。
7. Time Registry legacy → 0 有截止日期趋势。
8. 设计/产品能读 `packages/time/TIME_STYLE.md` 提相对时间阈值而不改业务代码。

---

## 13. 相关

- [ADR-037](./adr/ADR-037-product-time-system.md)
- [Dual Registry](../governance/dual-registry.md)
- [AI runtime path map](./ai-runtime-path-map.md)（编排边界，非时间）
- 优雅化 plan：`docs/plan/archive/2026-07-26-codebase-elegance-foundation.md`
