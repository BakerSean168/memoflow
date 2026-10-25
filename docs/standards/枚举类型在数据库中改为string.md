---
created: 2026-01-27T11:49:44
updated: 2026-01-27T11:50:34
tags:
  - standards
  - contract
---

在使用 Prisma + PostgreSQL 的组合时，关于 `DeviceType` 在数据库层面的定义，通常有两种选择：**PostgreSQL 原生 ENUM** 或 **String**。

在 DDD 和 现代后端架构中，**强烈建议使用 `String`**，而不是数据库原生的 `ENUM`。

以下是详细的对比和落地实施方案：

### 1. 推荐方案：数据库存 `String`，代码控 `Union Type`

这是最灵活、最符合 DDD 战术设计的方案。

#### 为什么？

1. **迁移成本低**：如果你以后要在 `contracts` 包里增加一种设备类型 `'VR_HEADSET'`。

   - 如果是 **String**：你只需要改代码，**不需要**做数据库迁移（Migration）。
   - 如果是 **DB ENUM**：PostgreSQL 的 ENUM 修改虽然支持 `ALTER TYPE ADD VALUE`，但在 Prisma 中管理起来相对麻烦，且回滚困难。

2. **解耦**：数据库只负责存数据，业务规则（哪些是合法的 DeviceType）由你的领域层（Domain Layer）和契约包（Contracts）决定。

#### Prisma Schema 写法

在 `schema.prisma` 中，直接定义为 `String`：

代码段

```
model DeviceInfo {
  id              String   @id @default(uuid())
  // ... 其他字段
  // 在数据库里，它就是一个 varchar/text
  deviceType      String

  firstSeenAt     DateTime
  lastSeenAt      DateTime

  @@map("device_infos")
}
```

#### Repository 层转换 (关键)

因为 Prisma 生成的类型是 `string`，而你的领域对象需要 `DeviceType` 联合类型，所以需要在 **Repository (持久化层)** 做强制类型转换。

TypeScript

```
// libs/infrastructure-server/src/repositories/PrismaDeviceRepository.ts

import { DeviceInfo } from '@memoflow/domain-server'; // 你的领域对象
import type { DeviceInfoPersistenceDTO } from '@memoflow/contracts';
import { prisma } from '../prisma';

// 假设这是 Prisma 返回的原生数据
const prismaData = await prisma.deviceInfo.findUnique({ where: { id: '...' } });

if (prismaData) {
  // 1. 强制断言 (Type Assertion)
  // 因为写入时我们保证了它是合法的，所以读取时可以信任它
  const deviceType = prismaData.deviceType as DeviceInfoPersistenceDTO['deviceType'];

  // 2. 组装成 Persistence DTO
  const persistenceDTO: DeviceInfoPersistenceDTO = {
    ...prismaData,
    deviceType: deviceType, // string -> 'DESKTOP' | 'MOBILE' ...
    // Prisma 的 DateTime 直接对应 JS Date，不需要转换
    firstSeenAt: prismaData.firstSeenAt,
    lastSeenAt: prismaData.lastSeenAt,
  };

  // 3. 还原为领域对象
  const domainEntity = DeviceInfo.fromPersistence(persistenceDTO);
}
```

---

### 2. 备选方案：使用 Prisma Enum (映射原生 PG ENUM)

只有当你极度依赖数据库层面的数据完整性校验（例如有其他非 Node.js 应用直接写库），才建议使用此方案。

#### Prisma Schema 写法

你需要显式在 Prisma 里再定义一遍这个枚举。

代码段

```
// 必须手动保持和 TypeScript 中的 DeviceType 一致
enum DeviceTypeEnum {
  BROWSER
  DESKTOP
  MOBILE
  TABLET
  API
  UNKNOWN
}

model DeviceInfo {
  // ...
  deviceType DeviceTypeEnum // 使用枚举
}
```

#### 问题所在

这将导致你有**两份**枚举定义：

1. `libs/contracts/src/types/device-type.ts` (TypeScript 联合类型)
2. `prisma/schema.prisma` (Prisma Enum)

**痛点**：每次修改类型，你都要改两个地方，并且必须运行 `prisma migrate dev` 来修改数据库结构。这违背了 Monorepo "Single Source of Truth" 的原则。

---

### 3. 关于你的 `PersistenceDTO`

你定义的 `DeviceInfoPersistenceDTO` 非常好，它充当了 **ORM (Prisma)** 和 **Domain Entity** 之间的桥梁。

针对你的定义，有一个小细节需要注意：

```TypeScript
export interface DeviceInfoPersistenceDTO {
  // ...

  // 这里的类型如果是 contracts 里的联合类型
  deviceType: DeviceType;

  // Prisma 返回的是 Date 对象，这里定义为 Date 是对的
  firstSeenAt: Date;
  lastSeenAt: Date;
}
```

**最佳实践流程：**

1. **写入数据库 (To DB)**：

   Domain Entity (`deviceType` 是联合类型) -> 赋值给 Prisma input (`string`)。TypeScript 兼容（联合类型是 string 的子集）。

2. **读取数据库 (From DB)**：

   Prisma output (`string`) -> **强制断言 (`as DeviceType`)** -> `PersistenceDTO` -> Domain Entity。

### 总结建议

1. **Schema 定义**：在 Prisma 中使用 **`String`**。
2. **类型定义**：保持你的 `contracts` 包中的 **`DeviceType` 联合类型** 不变。
3. **桥接**：在 Repository 层读取数据时，使用 `row.deviceType as DeviceType` 进行类型转换。

这样你的数据库极具弹性，而你的代码依然享有严格的类型检查。
