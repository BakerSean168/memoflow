---
tags:
  - adr
  - time
  - contracts
  - domain
  - utils
  - style
  - date-fns
description: ADR-037 - 产品时间体系：Instant/Ymd 契约、TransferDate 对齐、DomainDate 退役、门面与风格治理
created: 2026-07-26T00:00:00
updated: 2026-09-09T00:30:00+08:00
---

# ADR-037: 产品时间体系（Product Time System）

> **2026-09-09 第二轮收敛：** 本 ADR 的 `Instant / Ymd / Hm`、`@memoflow/time`、Clock/Codec/Calendar/Recurrence 与第三方隔离原则继续有效；`TimeContext`、timezone-aware Calendar/Format、branded `TimeZoneId` 与 presentation/compatibility surface 由 ADR-100/101 进一步收敛。

**状态：** 已采纳  
**日期：** 2026-07-26  
**影响范围：** contracts primitives、全体 domain VO/Entity、`@memoflow/utils` 时间相关 API、app-vue / app-react / desktop / api、展示与表单、Prisma/PowerSync mapper、Dual/Time Registry、ESLint 治理

**配套详述：** [`../product-time-system.md`](../product-time-system.md)

---

## 1. 背景

### 1.1 现象

仓库已选定 **date-fns** 作为主要日期库，并在多轮 dual 清理中收敛了大量本地 `format*`。但时间能力仍分裂为多套并行事实：

1. **开源库直连**：业务与 UI 大量 `import { format } from 'date-fns'`，locale/空值/pattern 各写各的。
2. **薄封装未成产品入口**：`@memoflow/utils` 的 `shared/date.ts` 能力窄，且 UI 主路径很少走它。
3. **组件私有 format**：Vue/React 卡片与 Screen 内仍大量 `function formatDate` / `toLocaleString`。
4. **契约双轨**：`DomainDate = Date` 与 `TransferDate = number`（epoch ms）在 contracts 与 domain VO 中广泛使用；VO 内部存 number、getter 返回 `new Date(ms)`；Domain shape 与 DTO shape 用双 interface 锁住（residual 859 类 keep-boundary）。
5. **日历日与瞬时混淆**：全天任务日、生日、目标日等被 `Date`/epoch 表达，导致 TaskTimeConfig 等「形状有意不同」却缺少一等日历类型。
6. **PersistenceDate** 已从 contracts 移除（正确）；infra 转换仍易散落 `getTime()` / `new Date`。

### 1.2 非目标回顾

- 优雅 ≠ dual-surface 文件数为 0。
- 不强制 merge 语义不同的 keep-boundary。
- 不在本 ADR 宣称换掉 date-fns 或上线 Temporal 为默认引擎。

### 1.3 要回答的问题

- 时间是否应作为**一等产品能力**受风格治理？
- 开源库、门面、领域、contracts 各处什么层？
- `DomainDate` / `TransferDate` 是否纳入、如何长期演进？
- 如何在「高质量、可长期维护」前提下大刀阔斧落地？

---

## 2. 决策总览

1. **采纳产品时间体系（Product Time System）** 为全仓时间横切的唯一宪法。
2. **规范瞬时类型为品牌化 `Instant`（epoch 毫秒）**；**`TransferDate` 与 `Instant` 同构对齐**（wire 主型）。
3. **引入一等日历日 `Ymd` 与钟面 `Hm`**，禁止用「某时区午夜 Date」长期冒充日历日。
4. **`DomainDate = Date` 别名已退役（T10）**；领域主型为 `Instant` 和/或 `Ymd`（及必要的不可变日历/区间值对象），禁止 reintroduce 可变 `Date` 别名。 5. **新建一等包 `@memoflow/time`**（产品时间门面 + Style + Codec + Calendar + 可替换 Engine）；业务与 UI **禁止**直连 date-fns / 散落产品级 `toLocale*`（白名单仅引擎与登记 exemption）。
5. **所有 Domain↔Transfer↔展示 转换只允许经 Codec（及经其生成的 mapper）**；展示只经 Format + `TimeStyle`。
6. **保留「domain shape ≠ transfer shape」原则**，但升级为**语义化类型差**（例如日 vs 瞬时），而非永远 `Date` vs `number` 别名差。
7. **Persistence 时间类型不重回 contracts**；infra 只经 Codec 与本地列类型。
8. **治理**：Time Registry + ESLint 断供 + surface 契约；与 Dual Registry 分工（dual 锁 ≠ 时间宪法）。

---

## 3. 详细决策

### 3.1 分层（逻辑）

```text
L5 UI / Application     → 只消费 @memoflow/time（+ 可选模块 presentation）
L4 Module Presentation  → i18n/业务句子；原子时间串只来自门面
L3 Product Time Facade  → Clock · Style · Codec · Format · Input · Calendar
L2 Time Engine          → date-fns / Intl 等，仅 L3 引用
L1 Platform             → Date / Intl / 可注入 Clock
+ contracts primitives  → Instant/TransferDate/Ymd/Hm 等类型真相（见 3.3）
+ Domain VO/Entity      → 存储与对外 API 遵守 primitives；运算走 Calendar/Clock
+ Infra mappers         → 只经 Codec
```

**展示风格（人眼）**、**日历/时钟策略（领域）**、**边界形态（wire/domain）** 是三件事，同属时间体系，职责不可混写进一个 `formatDate(any)`。

### 3.2 规范类型

| 类型                                                                 | 含义                                                 | 长期角色                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| **`Instant`**                                                        | 品牌化 epoch **毫秒**                                | 规范瞬时；比较、排序、API 瞬时字段               |
| **`TransferDate`**                                                   | wire/DTO/VO 内部传输名                               | **≡ `Instant`**（同构；可保留名作 API 文档用语） |
| **`Ymd`**                                                            | 品牌化 `YYYY-MM-DD` **本地日历日**（或产品约定日历） | 生日、全天、目标「日期」、日历格键               |
| **`Hm`**                                                             | 品牌化 `HH:mm` 本地钟面                              | 表单 time input、日内时刻                        |
| **`IsoUtc`**                                                         | UTC ISO 字符串                                       | 日志、需互操作的外部文本                         |
| **`DurationMs` / `DurationMin`**                                     | 时长                                                 | 算法与展示分流                                   |
| **`DomainDate`**                                                     | 已删除                                               | **禁止 reintroduce**                             |
| **禁止**无品牌 `number` 同时表示秒、毫秒、时长、日期键。             |
| **禁止**新代码用 `string` 无 brand 表示「可能是 ISO 也可能是 YMD」。 |

#### 时区（第一版拍板，预留扩展）

| 场景                      | 策略                                                          |
| ------------------------- | ------------------------------------------------------------- |
| 存储 / API 瞬时           | `Instant`（UTC 瞬间）                                         |
| 用户日历日 / 日程格 / Ymd | **设备本地时区**（Local Calendar），第一版                    |
| 多用户「业务时区」        | 接口预留 `TimeZonePolicy`；**不**在第一版 entangle 进默认路径 |
| 日志                      | `IsoUtc`                                                      |

### 3.3 `TransferDate` 与 DomainDate（已退役）

#### TransferDate（保留名、升级语义）

- **决策：** `TransferDate` **正式等于** 品牌化 `Instant`（epoch ms）。
- OpenAPI/JSON 继续传 number ms；类型层消除「普通 number」。
- 所有 DTO、客户端投影、VO **内部 props** 的瞬时字段使用 `TransferDate` / `Instant`。
- 文档与口语统一 **TransferDate**；废弃 **TransportDate** 第三名词。

#### DomainDate（已退役 · T10）

- **决策：不保留 `type DomainDate = Date`。** 符号、导出与 Codec `fromDomainDate`/`toDomainDate` 已删除。 - **理由（质量优先）：**
  - `Date` 可变，破坏值对象不变量；
  - getter `new Date(ms)` 制造分配与相等陷阱；
  - 与 wire 双栈，迫使每层手写 `getTime`；
  - 类型别名在 TS 结构上等于 `Date`，**无真正防错**。
- **领域 API：**
  - 瞬时：`Instant`；
  - 日历日：`Ymd`；
  - 富领域行为用 **不可变值对象**（内部仍存 Instant/Ymd），不暴露可变 `Date`。
- **Infra：** 仅 `fromJsDate` / `toJsDate` 在 Codec 与 mapper 边界。

#### Domain shape ≠ Transfer shape

- **保留原则：** 领域视图与传输 DTO **可以**字段集合或语义不同（residual 859）。
- **判据：** 差异必须是 **语义**（例：领域 `startDay: Ymd` vs 传输 `startInstant: TransferDate`），**不是**同一瞬时的 `Date` vs `number` 换皮。
- 两侧皆 Instant/Ymd 且同构时，允许 type alias；当前 859 仍以双 interface 名锁住 Instant 域 vs TransferDate 线。

#### Persistence

- **不**恢复 contracts 级 `PersistenceDate`。
- Prisma `DateTime` 等 ↔ `Instant` **仅**经 `@memoflow/time` Codec 或模块 mapper（调用 Codec）。

### 3.4 包与依赖

| 决策                                | 说明                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@memoflow/time`**                | 新建一等 package：Facade、Style、Clock、Codec、Format、Input、Calendar、Engine                                                                                                                           |
| **类型放置**                        | `Instant` / `TransferDate` / `Ymd` / `Hm` 的 **品牌类型** 以 **contracts primitives（或极薄 shared types）为真相**；`@memoflow/time` 实现行为并 re-export 便利入口，**避免** time ↔ 业务 module 循环依赖 |
| **`@memoflow/utils` 时间 API**      | `shared/date.ts` 等迁入 time 后删除或短命 re-export；utils 不再作为产品时间主入口                                                                                                                        |
| **app-vue `shared/utils/format-*`** | sole 上提至 `@memoflow/time` 后删除；过渡 re-export 有明确到期                                                                                                                                           |
| **引擎**                            | 默认 **date-fns** 实现 Calendar/部分 format；展示可组合 **Intl**；均仅存在于 `packages/time/engine/**`                                                                                                   |

### 3.5 产品门面能力（必须具备的稳定面）

调用方稳定依赖以下命名空间（具体函数名在 `product-time-system.md` 冻结）：

- **Clock** — `now()`；测试可注入；领域默认「现在」禁止静默 `new Date()`
- **Codec** — Transfer/Domain(迁移)/Ymd/Hm/Iso 互转；**非法输入策略显式**（null/throw），禁止 `ensureDate` 变 now
- **Format** — `hm` / `date` / `dateTime` / `relative` / `duration` / `range` / `ymdDisplay`… 全部吃 **TimeStyle**
- **Input** — date/time 控件值与 parse/combine（消化 formatDateToInput 的 Date vs ms 分裂）
- **Calendar** — start/endOfDay、addDays、diffCalendarDays、周起始、同日、isToday

**模块 presentation（L4）** 只做 i18n 与业务拼装，禁止 pad/parse/date-fns。

### 3.6 TimeStyle（风格一等公民）

凡 **给人看的时间** 与 **日历键/表单时间** 默认受 `TimeStyle` 管理：

- locale、timeZone policy、空值（display/input/unknown）、pattern/密度、相对时间阈值、时长偏好、周起始与日界

优先级：调用参数 > 局部 partial > 会话 preference > 应用默认。

**领域不引用 UI locale 做展示**；领域只消费日历/时钟**策略**（与 Style 中 calendar 段对齐的同一政策源，避免日界两套）。

### 3.7 开源库与「再封装」

- **只认 date-fns 为默认算术/ pattern 引擎**（可替换的是 Engine，不是调用方 import）。
- **禁止** L1 式「仅 re-export date-fns」冒充门面。
- **采纳 L3 门面 + L2 Engine**：换库改 Engine；换产品口味改 Style；换业务措辞改 L4。
- **直连 date-fns** 仅允许 `packages/time/engine/**`（及登记的临时 legacy，有 `retire_by`）。

### 3.8 治理

| 机制              | 作用                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Time Registry** | canonical / boundary / legacy / exemption；承接 format keep-boundary 与 Domain/Transfer 语义边界 |
| **ESLint**        | 断供业务 `date-fns`、限制产品级 `toLocaleDateString`、限制组件内 `function formatDate` 等        |
| **Surface**       | 门面契约、Ymd 本地日、空值、combine(date+time)、Transfer brand                                   |
| **Dual Registry** | 继续管 dual-retired 锁文件税；**不**替代时间宪法                                                 |
| **新字段门禁**    | 禁止新增 `DomainDate`；瞬时用 TransferDate/Instant，日用 Ymd                                     |

### 3.9 迁移原则（大刀阔斧但可证伪）

1. **先宪法与断供，再搬迁 sole，再屠龙私有 format，再改领域 getter。**
2. **绞杀式：** legacy 名单有到期日；到期 CI 失败。
3. **Codemod + 人工：** 同契约自动收；异契约改名进 Registry，禁止静默 merge。
4. **不**与 agent-host 产品完成定义捆绑；时间体系独立里程碑。
5. **质量优先于速度：** 允许大 PR 分波次合并，但每一波必须门面测试与关键路径绿，禁止「删锁充数」。

---

## 4. 后果

### 4.1 正面

- 全仓时间**单一入口**与**可配置风格**，展示与表单一致。
- wire / 领域 / 日历日 **类型诚实**，减少 Date≠number 假 dual 与静默 bug。
- 换引擎、换口味、换文案职责清晰，长期可维护。
- 与现有 dual 清理成果衔接：sole 上提为 canonical，而非再刷 micro dual。

### 4.2 代价与风险

- 新建包与全域 import 迁移成本高（app-react 私有 format、domain getter 尤重）。
- brand 类型在 TS 中需纪律（构造只经 Codec）。
- 短期 lint 断供会暴露大量存量，需要 legacy 配额而不是关规则。
- 日历日 vs 瞬时的产品语义需在 task/goal/account 字段级清理，有行为变化风险——必须契约测试与抽检。

### 4.3 明确不做什么

- 不引入 dayjs/moment 并行。
- 不恢复 PersistenceDate 进 contracts。
- 不强制第一版多用户业务时区。
- 不 force-merge 真异语义 boundary。
- 不把 fileSize、快捷键等非时间 format 塞进 `@memoflow/time`。

---

## 5. 合规检查（采纳后）

新代码审查至少问：

1. 是否绕过 `@memoflow/time` 做了产品格式化或日期算术？
2. 新字段是 `Instant`/`Ymd` 还是又引入了裸 `Date` / 已删的 `DomainDate`？ 3. DTO 与 Domain 若分形，差异是否语义诚实？
3. 空值/locale 是否来自 Style 而非魔数？
4. mapper 是否只经 Codec？

---

## 6. 参考

- 详设：[`../product-time-system.md`](../product-time-system.md)
- AI 路径地图（展示无关，边界参考）：[`../ai-runtime-path-map.md`](../ai-runtime-path-map.md)
- Dual Registry：[`../../governance/dual-registry.md`](../../governance/dual-registry.md)
- 优雅化 plan：[`../../plan/archive/2026-07-26-codebase-elegance-foundation.md`](../../plan/archive/2026-07-26-codebase-elegance-foundation.md)
- primitives：`packages/contracts/src/primitives/{instant,transfer-date,ymd,hm}.ts`
- VO 模式：`packages/goal/src/server/domain/value-objects/goal-time-range.ts`
- 历史：PersistenceDate 移除 plan archive；residual 859 Instant/TransferDate dual keep-boundary

---

## 7. 修订

| 日期       | 说明                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-07-26 | 初版采纳：产品时间体系 + Transfer≡Instant + DomainDate 退役 + `@memoflow/time` |
| 2026-07-26 | T10：删除 DomainDate 类型与 Codec from/toDomainDate；registry 仅 canonical     |

## 8. 2026-09-08 Setting vNext clarification

ADR-093 采纳后，ADR-037 中“第一版不强制多用户业务时区”只保留为历史实施阶段描述，不再是 vNext 目标边界。

User-level timezone source 现在明确为：

```text
UserPreferenceProfile.regional.timeZone
  -> UserTimeContextPort
  -> Product Time consumers
```

其中：

- IANA validation/TimeContext/TimePresentationStyle/Calendar/Recurrence 仍由 `@memoflow/time` owner；
- Preferences 只拥有“用户选择的 zone/style 值”；
- server 不允许回退 ambient host timezone；
- Task/Routine 等实体自己的 explicit schedule timezone snapshot 不因 user preference change 被静默追溯修改；
- first-profile device timezone 只能作为显式 initialization input，不成为 Time package 对 Setting 的反向依赖。

详见 [ADR-093](./ADR-093-user-preference-profile-and-product-time-context.md)。
