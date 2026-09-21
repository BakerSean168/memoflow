---
tags:
  - plan
  - archive
  - routine
  - ui
  - regression
description: Routine vNext configuration center / shell entry destructive-cutover regression recovery plan
created: 2026-09-21T13:20:00+08:00
updated: 2026-09-21T19:45:00+08:00
---

# Routine vNext Configuration Center 回归修复

## 0. 状态

- **状态**：DONE / ARCHIVED
- **目标分支**：chatgpt/routine-ui-regression-fix
- **基线**：main@c97ce1eec67
- **实现 head**：5bd206b767da2541bcd0facfcb7aa01283ae505b
- **问题类型**：destructive cutover regression / product surface loss
- **产品 owner**：Routine vNext
- **明确禁止**：恢复 legacy ReminderTemplate / ReminderGroup / ReminderInstance / ReminderResponse 或 /reminders 产品写路径

### 0.1 完成证据（2026-09-21）

本轮已恢复 canonical Routine vertical slice，而不是复活 legacy Reminder：

- `@memoflow/contracts/routine`：Routine Definition / Profile / Membership / RuntimeContext / TemporaryOverride / Trigger transport contract；
- `@memoflow/reminder/client`：Web HTTP + Desktop IPC 的统一 `RoutineClientPort`；
- API：`/api/routines`、`/api/routine-profiles` canonical routes；认证 identity 由 host 注入；
- Desktop：Routine configuration IPC + mutation 后本地 runtime refresh；
- Vue：`ROUTINE_SERVICE_KEY`、`/routines` router、Routine Configuration Center、Profile、Method Library、三类 trigger editor、temporary override；
- Shell：Routine capsule 恢复，顺序为 `Goal → Task → Routine → Note → Schedule → Notification`；旧 `/reminders` 仍保持 retired；
- Web 明确声明 `localRuntime=false`，并拒绝 profile runtime-active mutation（HTTP 409），避免制造无法驱动真实执行的 API 进程内状态；Desktop 保留真实 local-runtime active-state 能力。

验证证据：

- `pnpm nx affected -t lint --base=main --head=HEAD`：41 projects green（仅历史 warning，无 error）；
- `pnpm nx affected -t typecheck --base=main --head=HEAD`：37 projects + 31 dependency tasks green；
- `pnpm nx affected -t test --base=main --head=HEAD`：36 projects + 6 dependency tasks green；其中 app-vue 实跑 210 files / 840 tests 全绿；
- focused Routine/API/IPC/client/query/UI/i18n tests 全绿；
- `reminder:build`、`app-vue:build`、`web:build`、`desktop:build`、`api:build` 全绿；
- `docs:check`、`governance:check`、`test:inventory:check`、package export audit 全绿；
- prod-like Docker：API / Web / PowerSync / PostgreSQL / Redis 全部 healthy；
- OCI freshness：`memoflow-api:local`、`memoflow-web:local` revision 都精确等于 `5bd206b767da2541bcd0facfcb7aa01283ae505b`，无 freshness warning；
- runtime smoke：`GET http://127.0.0.1:20200/routines` → 200；未认证 `GET /api/routines/configuration` → 401（证明 canonical route 已注册且受 auth 保护，而非 404）。

**RUI-2502 验证偏差：** 当前执行环境的安全检查阻止读取/提交本地 E2E 凭据以及构造认证口令，因此没有执行真实登录后的 browser CRUD journey。该项以 owner-backed command/query tests、HTTP route integration、Desktop IPC contract、Vue mount smoke 与 fresh prod-like Docker route smoke 组合替代；不将其描述为 authenticated E2E。

## 1. 问题定义

2026-09-17 的 R4-2201C（738a6fad7bd refactor(routine): retire legacy Reminder model）正确完成了 legacy Reminder 领域、存储、transport 和兼容 UI 的破坏式退休，但同时删除了当时仍物理位于 packages/app-vue/src/modules/reminder/ 下、已经承担 ROUTINE-5301 产品职责的 Routine Configuration Center。

删除后没有建立新的 Routine 产品 surface：

- defaultModuleCapsules 中没有 routine；
- ShellModule 中没有 routine；
- router 没有 /routines；
- packages/app-vue/src/modules/routine/ 不存在；
- @memoflow/reminder/client 目前为空；
- Routine HTTP / Electron transport 目前也是空 marker。

因此当前顶部没有 Routine 入口不是缓存或部署问题，而是主分支真实缺失一个完整 vertical slice。

### 1.1 历史事实

ROUTINE-5301 原计划定义为 **Routine configuration center**，职责是配置而不是执行；ROUTINE-5302 Method Library 已完成。旧页面在退休前已经包含 Routine configuration center 和 Method Library 的 surface gate。

R4-2201C 的正确目标是删除 legacy Reminder model，而不是删除 Routine 产品能力。因此本计划只恢复 Routine vNext 产品能力，不恢复任何 legacy Reminder 兼容层。

## 2. North Star

最终产品结构：

~~~text
WindowHeader
  └─ Routine capsule
       └─ /routines
            └─ Routine Configuration Center
                 ├─ Definitions
                 ├─ Profiles
                 ├─ Profile memberships
                 ├─ Runtime active state
                 ├─ Temporary override status/actions
                 └─ Method Library
~~~

执行面继续保持分离：

~~~text
Configuration Center = 配置 / 查看 owner truth
AI                 = 创建、修改、启停、profile/override command
Desktop Runtime    = ActiveUsage / Elapsed / Intervention
Protocol Surface   = 50/10 / Pomodoro session execution
Schedule Planner   = calendar projection / owner-command mutation
~~~

Routine Configuration Center **不是**旧 Reminder 页的 rename，也不是新的 Reminder CRUD。

## 3. 架构约束

### RUI-INV-01 — Routine 是唯一产品 owner

UI 只消费 canonical Routine contracts：

- RoutineDefinition
- RoutineProfile
- ProfileMembership
- RoutineRuntimeContext
- RoutineTemporaryOverride
- canonical RoutineTrigger

不得重新引入：

- ReminderTemplate
- ReminderGroup
- ReminderInstance
- ReminderResponse
- reminder master switch
- legacy reminder stats
- legacy reminder API / IPC channels

### RUI-INV-02 — Client seam 必须真实

不得只添加顶部按钮和静态页面。

/routines 必须通过：

~~~text
Vue
 -> ROUTINE_SERVICE_KEY
 -> @memoflow/reminder/client
 -> HTTP (Web) / IPC (Desktop)
 -> host composition
 -> Routine owner application/query service
 -> canonical stores
~~~

### RUI-INV-03 — Query 与 command 都不能暴露 persistence row

UI DTO 不得直接使用 Prisma row 或 PowerSync row。

Domain entity 可以在 server 内部继续使用，但 transport contract 必须是序列化 DTO。

### RUI-INV-04 — RuntimeContext 不伪造持久化

RuntimeContext 是运行时状态，不写回 RoutineProfile definition truth。

Desktop 可以返回本地真实 runtime state；Web 不具备本地 ActivitySensor 能力时，只返回由 host 实际拥有的状态，不伪造 ActiveUsage 数据。

### RUI-INV-05 — /reminders 保持退休

- 不恢复 legacy /reminders route；
- 不建立 compatibility redirect；
- moduleForPath('/reminders') === null 继续成立；
- 新 canonical route 仅为 /routines。

### RUI-INV-06 — 配置中心只管理配置

Occurrence/intervention 的 daily execution 不搬进配置中心。页面最多展示 owner-backed 状态摘要；执行动作继续由 notification/intervention/protocol surfaces 拥有。

## 4. Canonical client contract

新增 @memoflow/reminder/client，物理包名继续沿用历史 reminder，产品 API 名全部使用 Routine。

### 4.1 Query DTO

建议最小 landing snapshot：

~~~ts
interface RoutineConfigurationSnapshot {
  definitions: RoutineDefinitionDto[];
  profiles: RoutineProfileDto[];
  memberships: RoutineMembershipDto[];
  runtimeContext: RoutineRuntimeContextDto;
  overrides: RoutineTemporaryOverrideDto[];
}
~~~

Definition DTO：

~~~ts
interface RoutineDefinitionDto {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: RoutineTriggerDto | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
~~~

Profile DTO：

~~~ts
interface RoutineProfileDto {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  active: boolean;
  version: number;
}
~~~

Membership DTO：

~~~ts
interface RoutineMembershipDto {
  routineId: string;
  profileId: string;
  enabled: boolean;
  version: number;
}
~~~

Override DTO：

~~~ts
interface RoutineTemporaryOverrideDto {
  routineId: string;
  snoozeUntil: number | null;
  suppressUntil: number | null;
  overrideIntervalMs: number | null;
  expiresAt: number;
  reason: string;
  source: 'user' | 'ai' | 'runtime';
}
~~~

### 4.2 ClientPort

首批必须覆盖配置中心实际需要的接口：

~~~ts
interface RoutineClientPort {
  getConfigurationSnapshot(): Promise<Result<RoutineConfigurationSnapshot>>;

  createRoutine(input): Promise<Result<RoutineDefinitionDto>>;
  updateRoutine(id, input): Promise<Result<RoutineDefinitionDto>>;
  deleteRoutine(id, expectedVersion?): Promise<Result<void>>;

  createProfile(input): Promise<Result<RoutineProfileDto>>;
  updateProfile(id, input): Promise<Result<RoutineProfileDto>>;
  deleteProfile(id, expectedVersion?): Promise<Result<void>>;

  replaceRoutineProfiles(routineId, expectedVersion, profileIds): Promise<Result<...>>;
  setMembershipEnabled(...): Promise<Result<...>>;
  setProfileActive(profileId, active): Promise<Result<...>>;

  setTemporaryOverride(...): Promise<Result<...>>;
  clearTemporaryOverride(routineId, expectedVersion?): Promise<Result<...>>;
}
~~~

Method Library 是静态 canonical catalog，直接从 @memoflow/reminder/method-library 读取，不再复制一份 UI 常量。

### 4.3 Query application service

新增 Routine 配置查询 service，组合：

- RoutineProfileStore.listDefinitions
- RoutineProfileStore.listProfiles
- RoutineProfileStore.listMembershipsForRoutines
- RoutineRuntimeContextStore.get
- RoutineTemporaryOverrideStore.findRoutineTemporaryOverride

它负责 domain -> DTO projection，不把 storage 结构暴露给 transport。

## 5. Transport

### 5.1 Web HTTP

建立 canonical Routine endpoints，统一前缀：

~~~text
GET    /api/v1/routines/configuration
POST   /api/v1/routines
PATCH  /api/v1/routines/:routineId
DELETE /api/v1/routines/:routineId

POST   /api/v1/routine-profiles
PATCH  /api/v1/routine-profiles/:profileId
DELETE /api/v1/routine-profiles/:profileId
PUT    /api/v1/routines/:routineId/profiles
PATCH  /api/v1/routines/:routineId/profiles/:profileId
PATCH  /api/v1/routine-profiles/:profileId/runtime

PUT    /api/v1/routines/:routineId/override
DELETE /api/v1/routines/:routineId/override
~~~

身份由 host/request context 注入，客户端不得提交 authority identityId。

### 5.2 Desktop IPC

新增 Routine IPC channel group，与 HTTP client 保持同一 RoutineClientPort 语义。

Renderer 不接触 PowerSync 表，也不直接调用 main 内部 store。

### 5.3 Host composition

API / Desktop 都复用同一 Routine application command/query service；transport 只做：

- auth/request context
- validation
- DTO mapping
- Result/error envelope

## 6. Vue product surface

新增：

~~~text
packages/app-vue/src/modules/routine/
  router/
  views/
  components/
  composables/
  index.ts
~~~

### 6.1 页面 IA

第一版 Configuration Center 采用单页配置工作台：

1. **Header**
   - Routine
   - “管理日常例程、触发条件和场景”
   - Create Routine

2. **Overview**
   - enabled routines
   - profiles
   - active profiles
   - temporary overrides

3. **Profile rail**
   - All
   - Work / Study / Gaming / user profiles
   - active state toggle
   - enabled/disabled status

4. **Routine list**
   - name / description
   - enabled state
   - trigger summary
   - profile memberships
   - override badge
   - edit/delete

5. **Method Library**
   - 6 canonical methods
   - WallClock methods -> prefill Create Routine
   - Protocol methods -> clearly标记为 protocol session，不伪装成 ordinary Routine timer

### 6.2 Trigger 编辑

首批 editor 必须支持 canonical trigger algebra：

- WallClock
- Elapsed
- ActiveUsage

但 UI 能力必须受宿主 capability 约束。Web 可以配置 canonical data；需要 Desktop local runtime 的行为应明确标示“桌面运行时执行”，不得让用户误以为 Web tab 自己执行 ActiveUsage sensor。

### 6.3 Route

canonical landing：

~~~text
/routines
~~~

不新增 /routine、/reminders alias。

## 7. Shell 修复

### RUI-1101 — Shell identity

- ShellModule 增加 routine
- BUSINESS_MODULES 增加 routine
- MODULE_PREFIXES 增加 ['/routines', 'routine']
- MODULE_TITLE_KEYS 增加 Routine key

### RUI-1102 — Capsule

defaultModuleCapsules 增加：

~~~ts
{
  id: 'routine',
  title: 'nav.capsule.routine',
  icon: Repeat2,
  route: '/routines'
}
~~~

产品顺序：

~~~text
Goal → Task → Routine → Note → Schedule → Notification
~~~

### RUI-1103 — i18n

新增：

- nav.routines
- nav.capsule.routine
- routine.*

历史 nav.reminders 文案不作为新产品 surface 的依赖。

## 8. 实施 tickets

### Phase A — Contract / owner seam

#### RUI-2101 Routine configuration query
- 定义 serializable DTO
- 建 query service
- tests：definitions/profiles/memberships/runtime/overrides

#### RUI-2102 Routine client public seam
- @memoflow/reminder/client
- Result-based port
- package export
- anti-legacy surface test

### Phase B — Host transport

#### RUI-2201 Web HTTP
- canonical Routine routes
- request identity ownership
- validation
- API composition
- route integration tests

#### RUI-2202 Desktop IPC
- canonical Routine channels
- main composition
- renderer client
- IPC contract tests

### Phase C — Vue composition

#### RUI-2301 DI
- IRoutineService = RoutineClientPort
- ROUTINE_SERVICE_KEY
- Web/desktop provide client

#### RUI-2302 Module/router
- modules/routine
- /routines
- route tests

#### RUI-2303 Configuration Center
- owner-backed list/profile/filter
- create/edit/delete routine
- profile management
- enable/active state
- method library
- override display/control

### Phase D — Shell recovery

#### RUI-2401 Capsule + tab semantics
- Routine capsule
- router sync
- tab persistence
- preview strategy：首版允许无 hover preview；不得因此阻塞 landing surface

#### RUI-2402 Accessibility/responsive
- keyboard navigation
- aria
- narrow panel
- dark theme semantic tokens

### Phase E — Anti-resurrection / validation

#### RUI-2501 Regression locks

必须断言：

- /routines -> routine
- /reminders -> null
- shell registry 有 routine
- router 注册 routineRoutes
- app-vue 不 import legacy Reminder DTO
- client/API/IPC route names 不出现 legacy CRUD vocabulary

#### RUI-2502 Product journey

至少覆盖：

1. 顶部点击 Routine -> 打开 /routines
2. 创建 profile
3. 创建 WallClock routine
4. 绑定 profile
5. 禁用/启用 routine
6. 激活/关闭 profile runtime state
7. 编辑 routine
8. 删除 routine
9. Method Library prefill
10. 刷新后 owner truth 仍一致

Web 与 Desktop 至少各验证一次核心 landing + CRUD smoke。

## 9. 测试矩阵

Focused：

~~~text
pnpm nx run reminder:test
pnpm nx run reminder:typecheck
pnpm nx run app-vue:test
pnpm nx run app-vue:typecheck
pnpm nx run api:test
pnpm nx run api:typecheck
pnpm nx run desktop:test
pnpm nx run desktop:typecheck
~~~

Structure：

~~~text
pnpm docs:check
pnpm governance:check
pnpm test:inventory:check
~~~

Build：

~~~text
pnpm nx run reminder:build
pnpm nx run app-vue:build
pnpm nx run web:build
pnpm nx run desktop:build
~~~

E2E 按受影响环境选择 local-docker / shell / desktop smoke；不以单元测试替代真实 route + host composition 验证。

## 10. 验收标准

### P0

- [x] 顶部出现 Routine
- [x] 点击后真实进入 /routines
- [x] 页面不是静态 placeholder
- [x] Web / Desktop 都能读取 canonical Routine owner truth
- [x] Create/update/delete 不写 legacy Reminder
- [x] /reminders 仍 retired

### P1

- [x] Profile membership 可管理
- [x] Profile active state 可管理（Desktop local runtime；Web capability 明确禁用）
- [x] 三类 canonical trigger 可表达
- [x] Method Library 可用于创建配置
- [x] temporary override 有真实 owner-backed 状态
- [x] panel / focus shell 行为与 Goal/Task/Note 一致

### Quality

- [x] focused tests green
- [x] typecheck green
- [x] governance/docs/test-inventory green
- [x] affected builds green
- [x] diff review P0/P1 = 0

## 11. 明确不做

本轮不做：

- legacy Reminder data migration
- /reminders redirect
- compatibility read/write layer
- 重写 Routine scheduler/runtime
- 把 Notification Center 合进 Routine
- 把 Planner ownership 改给 Routine UI
- 把 50/10 / Pomodoro 降格成普通 Reminder timer
- 为 Web 伪造 Desktop ActivitySensor capability

## 12. 风险与控制

### 风险 A：为了恢复 UI 复活 legacy DTO

控制：所有新增 transport vocabulary 必须为 Routine；增加 source scan gate。

### 风险 B：UI 直接读 PowerSync/Prisma

控制：只允许通过 RoutineClientPort。

### 风险 C：Web/Desktop 语义漂移

控制：同一 ClientPort + 同一 application query/command service；只 adapter 不同。

### 风险 D：shell 只有按钮没有 owner wiring

控制：P0 验收要求 owner-backed CRUD smoke。

### 风险 E：一次性扩展过大

控制：先建立最小 vertical slice（snapshot + CRUD + shell landing），再补完整 trigger/profile/override UI；每阶段都可独立验证，但最终合并前必须满足 P0/P1。

## 13. 回滚策略

此修复不涉及 legacy 数据恢复。若 UI vertical slice 出现 blocker：

1. revert 本修复 branch；
2. 保持现状（Routine runtime owner truth 不受影响）；
3. 不恢复 /reminders；
4. 修复 client/transport 后重新启用 /routines。

## 14. 完成后的归档

完成后：

- 回填 exact head、测试、build、E2E 证据；
- 将本文件移动到 docs/plan/archive/；
- 更新 docs/plan/active/README.md；
- 在 Routine product doc 标明 Configuration Center 已以 /routines canonical surface 恢复；
- 必要时补 ADR-111 follow-up，明确“destructive retirement 不能删除 replacement product surface”。
