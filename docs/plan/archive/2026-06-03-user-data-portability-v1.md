---
tags:
  - plan
  - active
  - data-portability
  - import-export
description: 用户数据导入导出 V1 详细实现方案
created: 2026-06-03T00:00:00
updated: 2026-06-03T22:58:00
---

# 用户数据导入导出 V1 详细实现方案

## 1. 背景

当前项目已经存在设置导入导出能力，但它只覆盖 `UserSetting` 偏好数据，不是完整的用户业务数据迁移能力。设置页和隐私页还存在一些 UI 入口，例如“导出数据”“创建本地备份”“恢复备份”“云同步”等，但并没有完整接线到统一的用户数据导入导出服务。

本方案设计一个最小可用的用户数据导入导出功能：

- 导出时生成一个数据文件。
- 导入时传入一个数据文件。
- 导入语义类似“批量新增”，不是数据库恢复。
- 数据文件只包含业务属性和文件内临时引用，不包含数据库主键、认证归属字段或运行时状态。

该功能优先服务个人迁移、手工备份和跨环境搬运，不承担复杂同步、冲突合并、账号恢复或二进制附件迁移。

## 2. 目标

- 提供一个独立的用户数据导出入口，生成单个 JSON 文件。
- 提供一个独立的用户数据导入入口，读取 JSON 文件并写入当前登录用户。
- 导入时为所有业务实体生成新 ID，并注入当前登录用户 `identityId`。
- 导出文件不暴露数据库 `id`、`identityId`、认证 token、session、API key、PowerSync 内部状态或缓存。
- 使用文件内 `_ref` 还原实体关系，例如父子目标、文件夹层级、目标-KR、任务依赖、提醒分组和资源层级。
- V1 只处理文本型数据和核心业务配置；二进制资源文件暂不纳入。

## 3. 非目标

- 不做数据库 dump。
- 不导出或导入 `accounts`、认证凭据、登录会话、refresh token、trusted device、OAuth binding 等认证资料。
- 不导出 AI provider 的 `apiKeyEncrypted`。
- 不导出 PowerSync 客户端状态、profile snapshot、同步 checkpoint 或本地 sqlite 原始文件。
- 不导出派生统计表、执行日志、通知历史、AI 索引、缓存和运行时路径。
- 不做复杂 merge、去重、冲突解决或覆盖恢复。
- 不做 ZIP 包，不包含图片、PDF、音视频等二进制文件。

## 4. 总体策略

新增独立的 `data-portability` 能力，不复用 `setting` 模块承载全量数据迁移。原因：

- 设置模块的领域边界是用户偏好，不应该承担所有业务模块的数据编排。
- 导入导出需要跨目标、任务、日程、提醒、资源库、AI 和设置模块。
- V1 需要一份统一白名单和统一文件格式，避免每个模块各自导出一套不兼容结构。

实现方式采用“portable package”而不是“table snapshot”：

- 导出阶段从数据库读取当前用户数据。
- 转成可迁移 DTO。
- 删除数据库 ID 和认证归属字段。
- 对需要恢复关系的实体分配文件内 `_ref`。
- 导入阶段先校验 schema。
- 生成 `_ref -> newId` 映射。
- 按固定顺序创建数据。
- 写入当前用户身份。

## 5. 数据文件格式

文件名：

```text
memoflow-user-data-v1-<timestamp>.json
```

Envelope：

```ts
interface UserDataExportEnvelopeV1 {
  kind: 'memoflow.user-data-export';
  schemaVersion: 1;
  exportedAt: string;
  exportedBy?: {
    appName: 'MemoFlow';
    appVersion?: string;
  };
  scope: {
    includesBinaryResources: false;
    importMode: 'append-create-like';
  };
  data: PortableUserDataV1;
}
```

核心约束：

- 每个实体可以有 `_ref`。
- `_ref` 只在文件内部有效，不写入数据库。
- 关系使用 `xxxRef` 或 `xxxRefs`。
- 不出现 `id`、`identityId`、`accountId`、`operatorId` 等认证或数据库归属字段。
- 时间使用 ISO 字符串。
- JSON 字段保持 JSON 对象或数组，不再二次字符串化，除非现有业务字段本身明确要求字符串。

示例：

```json
{
  "kind": "memoflow.user-data-export",
  "schemaVersion": 1,
  "exportedAt": "2026-06-03T00:00:00.000Z",
  "scope": {
    "includesBinaryResources": false,
    "importMode": "append-create-like"
  },
  "data": {
    "settings": {
      "preferences": {
        "appearance": { "theme": "dark" }
      }
    },
    "goals": {
      "folders": [
        {
          "_ref": "goalFolder:1",
          "name": "学习",
          "color": "#3B82F6",
          "parentRef": null,
          "sortOrder": 0
        }
      ],
      "items": [
        {
          "_ref": "goal:1",
          "name": "完成导入导出功能",
          "description": "实现 V1 用户数据导入导出",
          "folderRef": "goalFolder:1",
          "keyResults": [
            {
              "_ref": "keyResult:1",
              "title": "完成 JSON 导出",
              "targetValue": 1,
              "currentValue": 0
            }
          ]
        }
      ]
    }
  }
}
```

## 6. V1 数据范围

### 6.1 包含

V1 覆盖用户真实创建或配置的核心数据：

| 模块           | 包含内容                                                           |
| -------------- | ------------------------------------------------------------------ |
| `setting`      | `UserSetting.preferences`                                          |
| `goal`         | 目标文件夹、目标、关键结果、目标记录、目标复盘、专注会话、专注模式 |
| `task`         | 任务文件夹、任务模板、任务实例、任务依赖                           |
| `schedule`     | 手工日程、调度任务配置                                             |
| `reminder`     | 提醒分组、提醒模板、提醒实例、提醒响应、用户提醒偏好               |
| `repository`   | 仓库、文件夹、文本资源、资源元数据、资源引用                       |
| `editor`       | 编辑器工作区、会话、分组、标签页                                   |
| `ai`           | AI 对话和消息，不包含 provider API key                             |
| `notification` | 通知偏好，不包含通知历史和发送记录                                 |

### 6.2 排除

V1 排除以下数据：

| 类型              | 排除原因                                             |
| ----------------- | ---------------------------------------------------- |
| 认证和账号数据    | 涉及身份、安全、登录状态，不适合作为普通数据文件导入 |
| `apiKeyEncrypted` | 敏感凭据，不导出                                     |
| 二进制资源        | V1 只做单 JSON 文件，避免 ZIP 和文件流复杂度         |
| 统计表            | 可重新计算或属于派生状态                             |
| 执行日志          | 包含运行时历史，不适合按新增语义恢复                 |
| 通知历史          | 属于触达运行记录，不是用户要迁移的核心数据           |
| AI 知识索引       | 属于派生索引，可重建                                 |
| PowerSync 状态    | 属于同步内部状态，不是用户业务数据                   |
| 软删除数据        | V1 只导出当前有效数据，避免恢复用户已删除内容        |

## 7. Portable Ref 规则

### 7.1 Ref 命名

`_ref` 使用稳定前缀加序号：

```text
goalFolder:1
goal:1
keyResult:1
taskFolder:1
taskTemplate:1
repository:1
resourceFolder:1
resource:1
reminderGroup:1
reminderTemplate:1
aiConversation:1
```

### 7.2 Ref 映射

导入时维护一个映射表：

```ts
type RefMap = Map<string, string>;
```

创建实体后立即记录：

```text
goal:1 -> new generated goal id
keyResult:1 -> new generated key result id
```

后续实体通过 `RefMap` 填充外键。

### 7.3 缺失引用处理

如果导入文件包含不存在的引用：

- 默认视为校验失败。
- 不写入任何数据。
- 返回 `VALIDATION_ERROR` 和具体路径，例如 `data.goals.items[0].folderRef`。

如果某类引用是可选关系，例如目标没有文件夹：

- `null` 或字段缺失表示无关系。
- 不允许使用无法解析的字符串。

## 8. 导入语义

导入采用 append/create-like 语义：

- 不清空当前用户已有数据。
- 不覆盖已有目标、任务、资源、提醒等业务数据。
- 每次导入都创建一批新数据。
- 文件导入两次，会创建两批数据。
- 当前用户唯一单例数据例外，例如设置、通知偏好、提醒偏好、Dashboard 配置，这些只能更新当前用户已有单例。

单例导入策略：

| 数据                     | 策略                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `UserSetting`            | patch 或 replace 当前用户 preferences，V1 默认 replace preferences |
| `NotificationPreference` | upsert 当前用户偏好                                                |
| `UserReminderPreference` | upsert 当前用户偏好                                                |
| `DashboardConfig`        | upsert 当前用户配置，若 V1 纳入则覆盖当前配置                      |

## 9. 冲突策略

因为导入生成新 ID，大多数冲突来自唯一约束中的业务字段。

V1 处理规则：

- 新 ID 避免主键冲突。
- `identityId + path`、`identityId + name` 等唯一约束冲突时，追加导入批次后缀。
- 后缀格式：`Imported <yyyyMMddHHmmss>` 或 `-imported-<shortBatchId>`。
- 不尝试查重合并。

示例：

```text
/knowledge
/knowledge-imported-202606030001
```

如果某个唯一冲突无法自动修复：

- 跳过该实体及其依赖子实体。
- 在 `warnings` 中返回原因。
- V1 推荐先实现严格事务，遇到不可修复冲突直接失败；后续再支持部分跳过。

## 10. 模块设计

### 10.1 后端模块

新增包或模块建议：

```text
packages/data-portability/
```

核心结构：

```text
packages/data-portability/src/
  api/
    module.ts
    routes.ts
    transport-handlers.ts
  application-server/
    export-user-data.use-case.ts
    import-user-data.use-case.ts
    portable-schema.ts
    projection-manifest.ts
    import-order.ts
  infrastructure-client/
    adapters/http/data-portability-http.adapter.ts
    adapters/ipc/data-portability-ipc.adapter.ts
    index.ts
  electron-entry/
    index.ts
  index.ts
```

也可以先放在 `packages/setting` 外的独立 `packages/data-portability`，后续扩展更清晰。

### 10.2 API 路由

新增 HTTP 路由：

```text
POST /api/v1/data-portability/export
POST /api/v1/data-portability/import
```

导出请求：

```ts
interface ExportUserDataReq {
  include?: Array<
    | 'settings'
    | 'goals'
    | 'tasks'
    | 'schedule'
    | 'reminders'
    | 'repository'
    | 'editor'
    | 'ai'
    | 'notifications'
  >;
}
```

导出响应：

```ts
interface ExportUserDataRes {
  fileName: string;
  content: string;
  summary: {
    entityCounts: Record<string, number>;
    warnings: string[];
  };
}
```

导入请求：

```ts
interface ImportUserDataReq {
  content: string;
  dryRun?: boolean;
}
```

导入响应：

```ts
interface ImportUserDataRes {
  batchId: string;
  dryRun: boolean;
  created: Record<string, number>;
  updatedSingletons: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
}
```

### 10.3 Electron IPC

新增 IPC channels：

```text
data-portability:export
data-portability:import
```

Renderer 不直接操作数据库，只调用 client service。

桌面端文件读写继续复用现有 system user-files 能力：

```text
system:userFiles:saveText
system:userFiles:openText
```

### 10.4 前端接入

在设置页隐私或高级区接入：

- “导出数据”：调用 `DataPortabilityClientService.exportUserData()`。
- “导入数据”：打开 JSON 文件，读取后调用 `importUserData()`。
- 导入前弹出确认，说明“将作为新增数据导入，不会覆盖已有业务数据；设置会更新当前用户设置”。
- 导入后展示 summary。

V1 不新增复杂向导。只提供：

- 选择文件。
- 确认导入。
- 展示结果。

## 11. Projection Manifest

新增白名单，不允许直接导出整表。

Manifest 需要描述：

- 模块名。
- 数据集合名。
- 数据来源 delegate。
- 用户过滤条件。
- 导出字段。
- 删除字段。
- ref 生成规则。
- 导入顺序。
- 外键 ref 映射。
- 唯一冲突策略。

示例：

```ts
interface PortableEntityProjection {
  module: string;
  collection: string;
  source: string;
  whereIdentityScoped: true;
  refPrefix: string;
  exportFields: string[];
  relationRefs: Array<{
    sourceField: string;
    exportedField: string;
    targetRefPrefix: string;
    nullable: boolean;
  }>;
  import: {
    targetDelegate: string;
    order: number;
    generateId: true;
    injectIdentityId: true;
  };
}
```

Manifest 第一版不要过度抽象到完全通用。可以使用模块化 projection helper，让每个模块显式编写导出/导入函数，manifest 只承载公共白名单和顺序。

## 12. 导出流程

1. 校验当前用户已认证。
2. 建立 export context：
   - `identityId`
   - `exportedAt`
   - `refAllocator`
   - `warnings`
3. 按模块读取数据。
4. 过滤软删除数据。
5. 为每个实体生成 `_ref`。
6. 用业务字段构建 portable DTO。
7. 用 `xxxRef` 替代外键。
8. 排除敏感字段和内部状态。
9. 构建 envelope。
10. `JSON.stringify(envelope, null, 2)`。
11. 返回文件名、内容、计数和 warnings。

## 13. 导入流程

1. 解析 JSON。
2. 校验 envelope：
   - `kind`
   - `schemaVersion`
   - `data`
3. 校验所有 `_ref` 唯一。
4. 校验所有 `xxxRef` 都能解析。
5. 创建 import context：
   - `identityId`
   - `batchId`
   - `refMap`
   - `created`
   - `updatedSingletons`
   - `warnings`
6. 如果 `dryRun=true`，只执行校验和冲突预检查，不写入。
7. 开启事务。
8. 按导入顺序创建顶层实体。
9. 写入 `_ref -> newId`。
10. 创建依赖实体和关系实体。
11. Upsert 单例偏好。
12. 提交事务。
13. 返回 summary。

## 14. 推荐导入顺序

1. `settings` 单例。
2. `notificationPreference`、`userReminderPreference` 等单例。
3. `repositories`。
4. `repository folders`。
5. `repository resources`。
6. `repository references`。
7. `goal folders`。
8. `goals`。
9. `key results`。
10. `goal records`。
11. `goal reviews`。
12. `focus sessions`、`focus modes`。
13. `task folders`。
14. `task templates`。
15. `task dependencies`。
16. `task instances`。
17. `schedules`。
18. `schedule tasks`。
19. `reminder groups`。
20. `reminder templates`。
21. `reminder instances`、`reminder responses`。
22. `editor workspaces`。
23. `editor sessions`。
24. `editor groups`。
25. `editor tabs`。
26. `ai conversations`。
27. `ai messages`。

## 15. 字段处理规则

### 15.1 必须移除

- `id`
- `identityId`
- `accountId`
- `operatorId`
- `apiKeyEncrypted`
- `createdBy`
- `updatedBy`
- 认证/session/token/device 相关字段

### 15.2 推荐保留

- 用户可见名称、描述、状态、颜色、图标、标签、排序。
- 业务时间，例如开始时间、目标日期、提醒触发时间、记录时间。
- 用户写入内容，例如笔记、评论、AI 消息、复盘内容。
- 配置字段，例如提醒配置、任务重复规则、编辑器布局、用户设置。

### 15.3 审计字段

V1 推荐导出：

- `createdAt`
- `updatedAt`

导入时允许保留这些时间作为历史语义，但不作为认证字段。若某些模块依赖 `updatedAt @updatedAt`，由数据库自动更新也可接受。

## 16. 二进制资源处理

V1 不包含二进制资源。

导出时：

- 文本、Markdown、代码资源可以导出 `content`。
- 图片、PDF、音视频等资源只导出元数据或直接跳过。
- 推荐直接跳过二进制资源，并写入 warning：

```text
Skipped 3 binary resources. Binary export is not supported in V1.
```

导入时：

- 不创建无法恢复内容的二进制资源。
- 如果文件中存在 V1 不支持的 binary resource block，校验失败或跳过并 warning。

## 17. 测试计划

### 17.1 单元测试

- export use case 不导出 `id`、`identityId`、`apiKeyEncrypted`。
- export use case 为有关系实体生成 `_ref`。
- import use case 可以解析合法 envelope。
- import use case 拒绝未知 `kind`。
- import use case 拒绝未知 `schemaVersion`。
- import use case 拒绝重复 `_ref`。
- import use case 拒绝无法解析的 `xxxRef`。
- import use case 在 `dryRun=true` 时不写入数据库。

### 17.2 集成测试

- 目标文件夹、目标、KR、记录导出后导入，关系正确。
- 任务模板、父任务、依赖和实例导出后导入，关系正确。
- 资源库、文件夹和文本资源导出后导入，层级正确。
- 提醒分组和模板导入后关系正确。
- AI 对话和消息导入后关系正确。
- 设置导入更新当前用户单例。
- 同一文件导入两次会创建两批业务数据。
- A 用户导出，B 用户导入后，新数据全部归属 B。

### 17.3 前端测试

- 设置页点击“导出数据”会调用 data portability service。
- 桌面端导出使用 `system:userFiles:saveText`。
- 桌面端导入使用 `system:userFiles:openText`。
- Web 端导出使用 Blob download。
- Web 端导入使用 file input。
- 导入成功展示 summary。
- 导入失败展示错误原因。

### 17.4 安全测试

- 导出文件中不包含 token/session/password/api key。
- 导入文件中的 `identityId` 字段即使出现也会被忽略或导致校验失败。
- 导入不能把数据写到非当前登录用户。
- 导入非法 JSON 不写入任何数据。

## 18. 验收标准

- 有统一导出入口和导入入口。
- 导出文件是单个 JSON 文件。
- 文件中没有数据库 `id`、`identityId` 和认证敏感字段。
- 导入时生成新 ID，并写入当前登录用户。
- 至少目标、任务、提醒、资源库文本资源、设置能完成端到端导出导入。
- 关系数据通过 `_ref` 正确恢复。
- 二进制资源暂不导入，并有明确 warning。
- 关键 use case 和 API/IPC adapter 有测试覆盖。
- 设置页“导出数据/导入数据”按钮可用。

## 19. 推荐提交切分

1. 新增 contracts 和 portable schema。
2. 新增后端 export/import use case 和 projection helpers。
3. 新增 HTTP route 和 Electron IPC entry。
4. 新增 client adapters 和 front-end service 注入。
5. 接线设置页导入导出按钮。
6. 补测试：schema/use case/API/IPC/front-end。
7. 文档补充：产品说明和操作说明。

每个提交尽量保持模块边界清晰，避免同时改 UI、contracts、后端和测试之外的无关内容。

## 20. 实施注意事项

- 不要使用当前 `setting:export` 和 `setting:import` 作为全量用户数据入口；它们可以后续修正为只处理设置。
- 不要复用 PowerSync profile snapshot 作为用户导出文件；snapshot 是同步 hydrate 能力，不是可移植业务数据包。
- 不要直接遍历所有 `identity_id` 表导出；必须走白名单，避免泄漏内部状态。
- 不要导出认证、会话、token、provider API key。
- 不要在 V1 做二进制资源，避免把 JSON 文件膨胀成不可控的大文件。
- 不要在导入时信任文件里的任何身份字段。

## 21. 当前分支信息

本计划对应工作分支：

```text
feat/user-data-portability-v1
```

该分支基于当前本地 `main` 创建。创建时本地 `main` 落后 `origin/main` 2 个提交，未自动拉取远端。

## 22. 审查后的进一步优雅实现方案

### 22.1 当前初步实现状态

当前分支已经开始实现 `packages/data-portability`，并在 API 与 desktop 主进程入口注册了模块。但这还不是可合并状态，也不是完整可用的用户数据导入导出闭环。

已验证结果：

| 检查项                                   | 结果             | 说明                                                                       |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `pnpm nx run data-portability:typecheck` | 通过             | 类型检查可通过，但导入实现中存在 `any`，会掩盖 Prisma 字段映射问题         |
| `pnpm nx run data-portability:lint`      | 通过但有 warning | 存在未使用 import、`any` 等清洁度问题                                      |
| `pnpm nx run data-portability:test`      | 通过             | 目前只覆盖 envelope/ref allocator/schema 浅层测试                          |
| `pnpm nx run data-portability:build`     | 通过             | 新包自身可以打包                                                           |
| `pnpm nx build api`                      | 通过             | API 入口接入后可以构建                                                     |
| `pnpm nx build desktop`                  | 失败             | `@memoflow/data-portability/electron-entry` 无法解析                       |
| `pnpm nx run memoflow:governance-check`  | 失败             | `data-portability` 未加入 target baseline manifest                         |
| `package-export-audit`                   | 失败             | root barrel 暴露 `application-server`，且 package exports 暴露未白名单入口 |

主要缺口：

- 新包没有登记到 `tools/governance/target-baseline-manifest.json`。
- `@memoflow/data-portability` 没有加入 `apps/api/package.json`、`apps/desktop/package.json` 和需要消费它的前端包依赖。
- desktop production build 缺少新包解析策略。
- desktop IPC channel 已注册，但 handler 直接抛错，没有执行真实导入导出。
- 设置页仍只接旧 `setting` 导入导出，没有接入 `DataPortabilityClientService`。
- package root 导出面过宽，把 server application 层暴露给默认入口。
- portable schema 只校验 envelope，`data` 仍是 `unknown`，不能证明导入文件安全且结构正确。
- `schedule.sourceEntityId`、`editor.resourceId` 等字段仍有持久化 ID 语义或 ref 命名不一致风险。
- 导出敏感字段净化只做浅层 key 扫描，嵌套 token/secret 仍可能泄漏。
- 导入用例直接用 Prisma delegate 和大量 cast，类型检查无法证明字段映射正确。
- 测试没有覆盖 round-trip、ref 恢复、敏感字段、导入事务、UI 文件流和 IPC。

### 22.2 优雅实现的目标形态

优雅的 V1 不追求复杂功能，但必须满足四个条件：

1. 用户路径完整：设置页可以导出单个 JSON 文件，也可以选择 JSON 文件导入。
2. 模块边界清楚：`data-portability` 只做跨模块编排和 portable DTO，不把所有模块的领域规则变成一份大而散的脚本。
3. 治理门禁干净：governance、package exports、desktop build、API build、相关 test 都能通过。
4. 数据文件可信：文件中没有持久化 ID、身份字段和敏感字段；导入只使用当前登录用户身份，并能恢复文件内关系。

### 22.3 修复阶段划分

#### 阶段 0：先恢复工程门禁

目标：让当前分支重新满足基础治理和构建要求。

必做事项：

- 在 `tools/governance/target-baseline-manifest.json` 中把 `data-portability` 登记为 `runtime-lib`。
- 移除 `packages/data-portability/src/index.ts` 对 `./application-server` 的 root barrel 导出。
- 移除或调整 `packages/data-portability/package.json` 中不被 package-export-audit 允许的 `./application-server` export。
- 如果 server use cases 只供 API composition root 使用，优先只通过 `./api` 暴露 API module，内部相对路径引用 server application 层。
- 在 `apps/api/package.json` 中加入 `@memoflow/data-portability`。
- 在 `apps/desktop/package.json` 中加入 `@memoflow/data-portability`，或改为不在 desktop 主进程直接 import 该包。
- 修复 desktop Vite main 构建的 workspace 包解析策略，使 `pnpm nx build desktop` 不因新包失败。
- 清理 lint warning：删除未使用导入，去掉 `any`，或使用 Prisma transaction client 类型。

验收命令：

```text
pnpm nx run data-portability:lint
pnpm nx run data-portability:typecheck
pnpm nx run data-portability:build
pnpm nx build api
pnpm nx build desktop
pnpm nx run memoflow:governance-check
```

#### 阶段 1：收窄公开面和分层边界

目标：让 `data-portability` 看起来像仓库内其他 runtime-lib，而不是一个把 server/client/transport 全部摊开的工具包。

推荐 package exports：

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./api": {
    "types": "./dist/api/index.d.ts",
    "import": "./dist/api/index.js"
  },
  "./application-client": {
    "types": "./dist/application-client/index.d.ts",
    "import": "./dist/application-client/index.js"
  },
  "./infrastructure-client": {
    "types": "./dist/infrastructure-client/index.d.ts",
    "import": "./dist/infrastructure-client/index.js"
  },
  "./electron-entry": {
    "types": "./dist/electron-entry/index.d.ts",
    "import": "./dist/electron-entry/index.js"
  }
}
```

root `index.ts` 只导出客户端安全的类型和 service factory，不导出 server use case、Prisma adapter、projection helper。

推荐目录边界：

```text
src/
  api/                  # server composition root 和 HTTP route
  application-server/   # 只被 api/electron-entry 内部相对引用
  application-client/   # renderer/web 可消费
  infrastructure-client/# HTTP/IPC adapter
  electron-entry/       # desktop 主进程入口
```

#### 阶段 2：建立真正的 portable schema

目标：导入文件在进入 use case 前已经被结构化校验，而不是 `unknown` 进入后到处 cast。

推荐做法：

- `EnvelopeSchema` 继续校验 `kind`、`schemaVersion`、`scope`。
- 为每个模块建立显式 schema，例如：
  - `PortableSettingsSchema`
  - `PortableGoalDataSchema`
  - `PortableTaskDataSchema`
  - `PortableRepositoryDataSchema`
  - `PortableReminderDataSchema`
  - `PortableScheduleDataSchema`
  - `PortableEditorDataSchema`
  - `PortableAIDataSchema`
- `PortableUserDataV1Schema` 组合这些模块 schema，不再使用 `z.record(z.string(), z.unknown())` 作为最终校验。
- schema 使用 `strict()` 或等价策略，默认拒绝未知字段。这样导入文件中出现 `id`、`identityId`、`accountId`、`apiKeyEncrypted` 时可以直接失败。
- JSON 字段允许明确的 `JsonValueSchema`，但不能让整块业务实体退化为 `unknown`。

推荐公共 schema：

```ts
const PortableRefSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*:\d+$/);

const NoPersistentIdentityFieldsSchema = z
  .object({
    id: z.never().optional(),
    identityId: z.never().optional(),
    accountId: z.never().optional(),
    apiKeyEncrypted: z.never().optional(),
  })
  .passthrough();
```

实际实现时不要真的用 passthrough 放开全部字段；更推荐每个实体 schema 显式列字段。上面只表达禁止字段的规则。

#### 阶段 3：统一 ref 命名，消除持久化 ID 语义

目标：导出文件里所有关系都只使用文件内 ref，不出现数据库 ID 语义字段。

必须修正：

- `PortableScheduleTask.sourceEntityId` 改为可迁移表达，例如：
  - `sourceRef?: string`
  - `sourceModule: string`
  - `sourceKey?: string`
- 如果 `sourceModule/sourceEntityId` 指向 V1 不导出的运行时实体，则 V1 不应导出该 schedule task，或导出为 detached 状态并明确 warning。
- `PortableEditorTab.resourceId` 改为 `resourceRef?: string | null`。
- 导入 editor tab 时必须通过 `resourceRef -> new resource id` 解析，不能把 ref 字符串写入 `resourceId`。
- `focusedGoalRefs` 导出时如果无法解析目标，不要回退原数据库 ID；应记录 warning 并跳过该 ref，或让导出失败。
- `resolveRefOrThrow` 不应返回 `unresolved:<id>` 这类会进入导入文件的伪 ref。优先在导出阶段失败，或把缺失关系置空并 warning。

建议新增统一工具：

```ts
interface RefRegistry {
  allocate(prefix: string, sourceId: string): string;
  get(sourceId: string): string | null;
  require(sourceId: string, path: string): string;
}
```

这样 projection helper 不需要自己维护 `ctx.refToIdMap` 细节，也能记录具体路径。

#### 阶段 4：把导入逻辑拆成模块 importer

目标：避免 `ImportUserDataUseCase` 成为 400 行以上的跨模块 Prisma 字段脚本。

推荐接口：

```ts
interface PortableModuleImporter<TData> {
  module: ExportableModule;
  validateRefs(data: TData, refs: ImportRefResolver): void;
  import(data: TData, ctx: ImportContext, tx: DataPortabilityTx): Promise<void>;
}
```

推荐拆分：

```text
application-server/use-cases/importers/
  settings.importer.ts
  repository.importer.ts
  goal.importer.ts
  task.importer.ts
  reminder.importer.ts
  schedule.importer.ts
  editor.importer.ts
  ai.importer.ts
```

`ImportUserDataUseCase` 只负责：

1. parse JSON。
2. validate envelope。
3. validate duplicate refs。
4. validate cross refs。
5. 创建 batch context。
6. 开事务。
7. 按 `IMPORT_ORDER` 调用 importer。
8. 返回 summary。

这样每个模块的字段映射和测试可以独立收口，也更符合现有模块代码组织。

#### 阶段 5：明确 Repository/资源冲突策略

目标：append-create-like 导入不因为唯一约束随机失败，也不偷偷覆盖已有数据。

V1 推荐策略：

- 对 `Repository` 的 `identityId + path` 冲突，在导入前重写 path：
  - 原始 `/knowledge`
  - 导入 `/knowledge-imported-<shortBatchId>`
- 对 `Folder` 的 `repositoryId + parentId + name` 冲突，追加 `-imported-<n>`。
- 对 `EditorWorkspace.projectPath` 的全局唯一冲突，优先生成 `/imported/workspaces/<batchId>/<workspaceName>`。
- 对资源 path 冲突，追加批次后缀。
- 不做内容去重。
- 所有自动改名写入 `warnings`。

这一阶段可以先只覆盖当前 schema 里已有唯一约束。不要实现复杂 merge。

#### 阶段 6：敏感字段递归净化

目标：导出文件中不出现 token/password/secret/api key 等敏感值，包括嵌套对象。

推荐实现：

```ts
const SENSITIVE_KEY_PATTERN =
  /(token|password|secret|apiKey|api_key|sshKey|privateKey|credential|auth)/i;
```

规则：

- 对对象递归处理。
- 命中敏感 key 时，直接删除字段或替换为 `[REDACTED]`。
- 对字符串值不做内容猜测，避免误删用户正文。
- 对 AI provider config 整体不导出。
- 增加测试证明嵌套 `config.auth.token` 不会出现在导出 JSON。

#### 阶段 7：完成用户可用闭环

目标：用户在设置页能完成简单导出和导入，不需要了解内部 API。

前端接线：

- 在 `packages/app-vue/src/modules/setting/composables/` 新增或复用 data portability composable。
- 通过环境选择 HTTP adapter 或 IPC adapter，遵循现有 setting/goal/task 的 client service 注入风格。
- 设置页“导出数据”调用 `exportUserData()`。
- 桌面端导出成功后调用 `system:userFiles:saveText` 保存 `fileName/content`。
- Web 端用 Blob 下载 JSON。
- 设置页“导入数据”先打开文件：
  - 桌面端：`system:userFiles:openText`
  - Web 端：file input
- 导入前确认 append-create-like 语义。
- 导入后展示 `created`、`updatedSingletons`、`warnings`。

Electron IPC：

- 如果 desktop renderer 使用 HTTP adapter，则不要注册一个会抛错的 IPC channel。
- 如果保留 IPC adapter，则 main handler 必须真实执行 use case，像 `SettingElectronModule` 一样创建模块实例并调用 API。
- 两种路径只能选一种作为主路径，避免“有 adapter 但 handler 抛错”的假能力。

V1 推荐：

- Web/API 路径使用 HTTP adapter。
- Desktop 如果 API server 总是可用，也使用 HTTP adapter。
- IPC 只保留文件系统读写 `system:userFiles:*`，不新增 data-portability IPC。
- 如果必须支持无 API server 的 desktop 离线导入导出，再实现真实 IPC handler。

#### 阶段 8：补足测试矩阵

优雅实现的最低测试集：

| 层级              | 测试                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| schema            | 拒绝 `id`、`identityId`、未知 `schemaVersion`、重复 `_ref`、无法解析 ref |
| export projection | 导出结果不含持久化 ID 和敏感字段                                         |
| import use case   | dry-run 不写库；非法 JSON 不写库；失败事务回滚                           |
| round-trip        | goals/tasks/repository/reminder/ai 至少各 1 个核心关系能导出再导入       |
| cross-user        | A 导出，B 导入后所有业务数据归属 B                                       |
| UI/composable     | 导出调用 service 并触发文件保存；导入读取文件并展示 summary              |
| adapter           | HTTP adapter path/method 正确；如果保留 IPC，IPC contract 正确           |

先不要追求覆盖每个字段。优先覆盖：

- 安全不泄漏。
- ref 能恢复。
- 当前用户身份注入。
- append-create-like 不覆盖业务数据。
- 单例设置 upsert 行为明确。

### 22.4 推荐提交顺序

1. `data-portability` governance 和 package surface 修复。
2. API/desktop/app package 依赖和 build 解析修复。
3. portable schema 从 envelope-only 升级为模块 schema。
4. projection/ref 命名修复，移除持久化 ID 语义字段。
5. import use case 拆模块 importer，并补核心 importer 测试。
6. 敏感字段递归净化和安全测试。
7. 设置页导出/导入文件流接线。
8. API/adapter/UI 测试补齐。
9. 跑完整门禁并归档 active plan。

每个提交都应该能独立解释为“让 V1 更可用、更安全或更符合治理”，避免把无关 UI 样式、历史 setting import/export 修补和 data portability 核心逻辑混在一起。

### 22.5 最终验收门禁

最终合并前至少需要通过：

```text
pnpm nx run data-portability:lint
pnpm nx run data-portability:typecheck
pnpm nx run data-portability:test
pnpm nx run data-portability:build
pnpm nx build api
pnpm nx build desktop
pnpm nx run memoflow:governance-check
```

如果接线了 `app-vue` 设置页，还需要补：

```text
pnpm nx run app-vue:lint
pnpm nx run app-vue:typecheck
```

验收时必须手工或自动验证一次实际用户路径：

1. 登录用户 A 创建至少一个目标、任务、文本资源、提醒和设置。
2. 在设置页点击导出，保存 JSON 文件。
3. 登录用户 B 或清空业务数据后导入该 JSON。
4. 确认新数据全部属于当前用户。
5. 确认导入文件中没有 `identityId`、数据库 `id`、token、session、API key。
6. 确认关系正确恢复，例如目标文件夹、KR、任务依赖、资源文件夹、AI 消息归属。

## 23. 复审结果：治理已恢复，优雅性仍需收口

本轮复审基于当前工作树，不再沿用旧的初步实现结论。当前实现已经完成了若干关键修复：

- `data-portability` 已加入 target baseline manifest，治理门禁不再因为新项目未登记失败。
- package root 出口已收窄，不再从 root barrel 暴露 `application-server`。
- `apps/api`、`apps/desktop`、`apps/web`、`packages/app-vue` 已显式声明 `@memoflow/data-portability` workspace 依赖。
- web DI 已补齐 `DATA_PORTABILITY_SERVICE_KEY` 的 `web-core` 出口，并补齐 web typecheck 所需的 data-portability 类型解析。
- 设置页已接入 `useDataPortability()`，能够通过 HTTP service 导出 JSON 内容，并通过 desktop `system:userFiles:*` 或 Web file/blob 完成文件读写。

### 23.1 当前验证结果

| 命令                                                          | 结果                 | 说明                                                                                           |
| ------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm nx run data-portability:lint`                           | 通过                 | 新包 lint 无 error/warning                                                                     |
| `pnpm nx run data-portability:typecheck`                      | 通过                 | 依赖 build 后通过                                                                              |
| `pnpm nx run data-portability:test`                           | 通过                 | 3 个测试文件，52 个测试                                                                        |
| `pnpm nx run data-portability:build`                          | 通过                 | package exports 对应产物可生成                                                                 |
| `pnpm nx build api`                                           | 通过                 | API 注册新模块后可构建                                                                         |
| `pnpm nx build desktop`                                       | 通过                 | 之前的 `electron-entry` 解析失败已恢复                                                         |
| `pnpm nx run app-vue:lint`                                    | 通过但有既有 warning | warning 位于 `GoalDAGVisualization.vue`、`plugins/i18n.ts`，不在本次 data portability 改动文件 |
| `pnpm nx run app-vue:typecheck`                               | 通过                 | 设置页和 DI 类型通过                                                                           |
| `pnpm nx run web:typecheck`                                   | 通过                 | 初次失败已通过 web-core export、web dependency、TS alias 修复                                  |
| `pnpm nx build web`                                           | 通过                 | data-portability lazy import 可被 web production build 解析                                    |
| `pnpm nx run memoflow:governance-check`                       | 通过                 | target baseline、package export、internal boundary、public surface 等全部通过                  |
| `node ./tools/governance/package-export-audit.mjs`            | 通过                 | public package exports 当前符合治理                                                            |
| `node ./tools/governance/package-internal-boundary-audit.mjs` | 通过                 | 未发现 package internal boundary 违规                                                          |

构建过程中仍会打印 ui-vue/app-vue 的 Vite DTS 诊断，例如 radix-vue 相关 TS2742 和 goal DAG 相关 TS4082，但对应 Nx target 最终成功。这些属于当前仓库已有声明生成噪音，不是 data-portability 新增的阻塞错误。

### 23.2 是否符合 governance

结论：当前显式 governance 门禁已经通过，可以认为“治理规则层面合格”。

已经满足：

- 新 project 已在 `tools/governance/target-baseline-manifest.json` 登记为 `runtime-lib`。
- 新包具备 `build`、`lint`、`typecheck`、`test` targets。
- root public surface 没有直接暴露 server application 层。
- API 模块形状、platform leakage、singleton、desktop runtime locator、package internal boundary、package export、public surface audits 均通过。

仍建议收口：

- `packages/data-portability/tsup.config.ts` 仍构建 `src/application-server/index.ts`，但 package.json 不再公开该 subpath。治理允许这种内部产物存在，但从可读性看，应删除该 entry，或在文档中明确它只是内部 build artifact，避免后续开发者误以为它是可导入 public API。
- `application-client` 的请求/响应类型仍从 `../application-server/portable-schema` 引入。虽然 package export audit 通过，但分层语言不够干净。更优雅的形态是把 API DTO/schema 放到 `contracts` 或 `src/contracts`，让 client 与 server 同时依赖 contracts，而不是 client 从 server application layer 取类型。

### 23.3 是否符合其他模块代码规范

结论：入口注册、DI 注入、HTTP adapter、Nx target 形状大体贴合现有模块；但 data portability 自身的领域实现还没有达到“优雅”。

符合现有模式的部分：

- API 端通过 `DataPortabilityApiModule` 在 `apps/api/src/main.ts` 注册，形状接近其他 server feature module。
- Web 端通过 `createLazyService()` 和 `DATA_PORTABILITY_SERVICE_KEY` 注入 service，和 goal/task/setting 等前端服务消费方式一致。
- 设置页 composable 通过 DI 获取 service，不直接 new HTTP client，符合 app-vue 的宿主注入风格。
- package project targets 和 workspace dependency 声明已经补齐。

不够优雅的部分：

- Electron 仍注册 `data-portability:export/import` IPC handler，但 handler 内部直接抛出“请使用 HTTP”的错误；同时 client 侧还导出 `DataPortabilityIpcAdapter`。这是典型的假能力：public API 暗示可用，运行时不可用。
- UI 已有文件导入导出路径，但导入前没有确认 append-create-like 语义；按钮和结果文案是硬编码英文，没有接入 i18n；summary 只是拼接字符串，不利于后续错误态、warning 和明细展示。
- `portable-schema` 虽然对模块顶层使用了 `strict()`，但大量字段仍是 `z.unknown()`，例如 metadata/config/goalBinding/checklist/reminderConfig。导出侧有递归 sanitizer，但导入侧仍可能接收嵌套 `id`、`identityId`、`token` 等恶意字段，只是当前 importer 未必使用这些字段。
- projections 仍存在不应进入文件的 ref 处理方式：`resolveRefOrThrow()` 返回 `unresolved:<id>`，`focusMode.focusedGoalRefs` 解析失败时仍回退原始 ID。这不符合“导出文件不含持久化 ID 语义”的目标。
- importer 已拆分成多个文件，这是进步；但字段访问仍大量依赖 `rec()` cast 和 Prisma delegate 直写，类型系统没有真正证明 portable DTO 与 Prisma create data 的映射正确。
- `dryRun` 当前主要做 JSON/schema/ref 扫描，不会模拟 importer 执行，也不会覆盖唯一约束、事务回滚、字段映射失败等真实导入风险。
- 测试覆盖从 12 个增加到 52 个，但仍偏 schema/sanitizer/validation，没有覆盖 export projection、module importer、HTTP adapter、UI composable、A 用户导出 B 用户导入、round-trip 和失败事务回滚。

### 23.4 进一步优雅实现方案

推荐后续按以下顺序继续，而不是继续堆字段：

1. 清理 public API 假能力。
   - 如果桌面端确定走 HTTP adapter，就删除 `DataPortabilityIpcAdapter` 和 `DataPortabilityElectronModule` 中的 data-portability IPC handler。
   - 如果必须保留 IPC adapter，就实现真实 handler，而不是注册后抛错。
     应该实现IPC能力，从本地数据库导出

2. 把 contracts 从 server layer 移出来。
   - 新建 `src/contracts` 或放入 `@memoflow/contracts/data-portability`。
   - `application-client`、`api`、`application-server` 都依赖 contracts。
   - `portable-schema`、request/response DTO、`ExportableModule` 都从 contracts 出口读取。

3. 强化 import validation。
   - 在 envelope validation 后增加递归 banned-key check，拒绝任意层级的 `id`、`identityId`、`accountId`、`token`、`password`、`secret`、`apiKeyEncrypted` 等字段。
   - 逐步把 `z.unknown()` 收窄成模块内白名单 schema。
   - 对 JSON/config 字段明确哪些可以导入，哪些必须丢弃或默认重建。

4. 重构 ref registry。
   - 不允许 projection 返回 `unresolved:<id>`。
   - 不允许任何 ref 字段回退数据库 ID。
   - 缺失关系只允许两种策略：导出失败，或丢弃关系并写入 warning。
   - `validateRefs()` 需要覆盖 `*Ref`、`*Refs` 和模块特定数组字段。

5. 提升 importer 类型安全。
   - 为每个 module importer 建立 `PortableModuleImporter<TData>` contract。
   - importer 不再通过通用 `rec()` 访问字段，而是使用经过 schema parse 后的 typed DTO。
   - 对 Prisma transaction client 建立最小 typed port，降低 direct delegate/cast 的扩散。

6. 补齐端到端最小测试。
   - 每个核心模块至少一个 export projection test 和 importer test。
   - 增加 cross-user test：A 导出，B 导入后所有数据写入 B。
   - 增加 malicious import test：嵌套 `metadata.identityId`、`config.auth.token` 必须被拒绝或丢弃。
   - 增加 UI composable test：导出保存文件、导入读取文件、失败/成功 summary。

7. 优化用户体验。
   - 导入前增加确认，明确“作为新增数据导入，不覆盖已有业务数据；设置类单例会更新”。
   - 使用 i18n 文案。
   - summary 展示结构化计数和 warning，而不是拼接长字符串。
   - 区分“导出设置”和“导出全部用户数据”，避免用户误解。

### 23.5 当前合并建议

当前实现已经不再是“治理不通过”的状态；它通过了主要工程门禁，也具备可调用的最小 HTTP 导入导出路径。

但如果目标是“优雅实现”，不建议直接作为最终版本合并。最少还应先完成两项：

1. 移除或实现真实 data-portability IPC，避免 public surface 暴露不可用能力。
2. 修复 ref 泄漏/伪 ref 问题，确保导出文件不会出现数据库 ID 或 `unresolved:<id>`。

完成这两项后，再补一组 projection/importer round-trip 测试，这个 V1 才更接近可以长期维护的形态。

## 24. 继续实施结果：安全与分层收口

本轮继续实施没有扩大功能范围，而是优先处理“看起来可用但运行时不可用”和“导入文件可能夹带内部字段”的风险。当前 V1 更接近一个可维护的最小闭环：Web/API 路径可用，desktop 不再暴露假的全量数据导入导出入口。

### 24.1 已落地改动

1. 移除假的 data-portability IPC public surface。
   - 删除 `data-portability:export/import` 这类注册后直接抛错的 Electron handler。
   - 删除 `DataPortabilityIpcAdapter` 和 `@memoflow/data-portability/electron-entry` package export。
   - `apps/desktop` 不再直接依赖 `@memoflow/data-portability`，desktop 主进程也不再注册该模块。

2. 避免 desktop 设置页因缺少 service 注入崩溃。
   - `useDataPortability()` 改为可选注入 `DATA_PORTABILITY_SERVICE_KEY`，并暴露 `isAvailable`。
   - `SettingAdvancedActions` 只在 service 可用时展示“导出/导入全部用户数据”。
   - 当前 desktop 仍保留原有设置文件导入导出能力；全量用户数据导入导出入口只在 Web/API service 注入后展示。

3. 修复 projection ref 泄漏。
   - `resolveRefOrThrow()` 不再返回 `unresolved:<id>` 伪 ref。
   - 任务实例、目标记录、提醒响应、资源等必需关系在无法解析时直接抛出 `EXPORT_VALIDATION_ERROR`。
   - `focusMode.focusedGoalRefs` 不再回退数据库 ID；无法解析的目标 ref 会被丢弃并写入 warning。

4. 强化导入侧安全校验。
   - `validateEnvelope()` 在 Zod 结构校验通过后，对 `data` 执行递归 banned-key scan。
   - 嵌套 `id`、`identityId`、`accountId`、`resourceId`、`apiKeyEncrypted`、`auth`、`token`、`password`、`secret` 等字段会被拒绝。
   - 校验只检查字段名，不检查字符串内容，避免误伤用户正文中出现的普通文字。
   - 导出侧 sanitizer 复用同一套 banned-key 规则，避免“导出文件被自己的导入校验拒绝”。

5. 收窄 contracts 分层。
   - API DTO/schema 从 `src/application-server/portable-schema.ts` 移到 `src/contracts/portable-schema.ts`。
   - `application-client`、`infrastructure-client`、`api` 都改为依赖 `contracts`，不再从 server application layer 取类型。
   - `tsup` 不再把 `src/application-server/index.ts` 作为独立 entry 构建；server application 层不作为 public runtime entry 暴露。

### 24.2 为什么本轮没有实现 desktop 本地数据库 IPC

计划中曾提出“应该实现 IPC 能力，从本地数据库导出”。复查后结论是：这一步不能直接复用当前 API module。

原因：

- `DataPortabilityApiModule` 当前通过 Prisma repositories 和 `PrismaClient` 组装 use case。
- desktop `IElectronModuleContext.db` 是 PowerSync-backed 本地库，不是 PrismaClient。
- 如果直接把 API module 接到 desktop，会形成类型上能绕过、运行时不可靠的假实现。

因此本轮选择先删除假的 IPC 能力并隐藏不可用 UI。真正的 desktop 本地导入导出需要后续单独实现：

- 为 `data-portability` 补 PowerSync read/write adapters。
- 或把后端 use case 抽象成更小的 repository ports，让 Prisma 和 PowerSync 分别实现。
- 再恢复 `electron-entry` 和 IPC adapter，并补 desktop IPC contract 测试。

### 24.3 新增测试覆盖

本轮新增或扩展测试覆盖：

- projection ref safety：无法解析的必需 ref 直接失败，不产生 `unresolved:<id>`。
- focus mode ref safety：无法解析的目标 ID 不写入导出文件。
- nested import banned keys：嵌套 settings/repository/resource metadata 中的身份字段、持久化 ID 和敏感字段会被拒绝。
- 用户正文字符串中出现 token 等词不会被误判。

当前 `data-portability:test` 结果为 4 个测试文件、62 个测试全部通过。

### 24.4 本轮验证结果

| 命令                                           | 结果                 | 说明                                                                                  |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install --ignore-scripts`                | 通过                 | 移除 desktop 直接依赖后更新 lockfile                                                  |
| `pnpm nx run data-portability:lint`            | 通过                 | 新包 lint 无 error/warning                                                            |
| `pnpm nx run data-portability:typecheck`       | 通过                 | contracts 移动后类型通过                                                              |
| `pnpm nx run data-portability:test`            | 通过                 | 4 个测试文件，62 个测试                                                               |
| `pnpm nx run data-portability:build`           | 通过                 | build 输出不再包含独立 `dist/application-server/index.js` entry                       |
| `pnpm nx run app-vue:typecheck`                | 通过                 | 设置页可选注入和 UI props 类型通过                                                    |
| `pnpm nx run app-vue:lint`                     | 通过但有既有 warning | 3 个 warning 仍位于 `GoalDAGVisualization.vue` 和 `plugins/i18n.ts`，不在本次改动文件 |
| `pnpm nx build api`                            | 通过                 | API module 和 contracts path 通过构建                                                 |
| `pnpm nx build desktop`                        | 通过                 | 移除 `data-portability/electron-entry` 后 desktop 构建通过                            |
| `pnpm nx run web:typecheck`                    | 通过                 | Web 对 data-portability dist contracts 类型解析通过                                   |
| `pnpm nx build web --configuration=production` | 通过                 | Web production build 通过                                                             |
| `pnpm nx run memoflow:governance-check`        | 通过                 | 本轮最终 governance 门禁通过                                                          |

构建仍会提示 `database:build` 被 Nx 判定为 flaky task；这与此前并发 Prisma 生成文件占用有关，本轮失败项已串行重跑并通过。desktop/web build 仍有现有 chunk size 提示和 app-vue DTS 诊断噪音，Nx target 最终成功。

### 24.5 下一步优雅实现优先级

1. 实现 desktop PowerSync adapters，然后恢复真实 `data-portability/electron-entry`。
2. 把 importer 的 `rec()` cast 收敛成 typed module importer contract。
3. 补 round-trip 测试：目标、任务、资源、提醒、AI 至少各一条核心关系。
4. 补 cross-user 测试：A 用户导出，B 用户导入后所有新增数据归属 B。
5. 前端结果展示从拼接字符串改为结构化 summary，并接入 i18n。
