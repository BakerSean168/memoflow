# Contracts 与 DTO 类型定义规范：Optional (?) vs Nullable (| null)

**版本**: 1.0
**适用范围**: `libs/contracts`
**读者**: 开发人员, AI 助手

## 1. 核心原则

在 TypeScript 中，`undefined` (由 `?` 产生) 和 `null` 虽然都代表“无值”，但在架构分层中有着明确的语义区别。

- **Persistence (持久层)**: 数据库只有 `NULL`，没有 `undefined`。
- **Domain (领域层)**: 实体应保持 **Stable Shape (稳定形状)**，属性应始终存在。
- **Transfer (传输层)**: 允许为了带宽优化使用 `?`，但严禁与 `null` 混用。

**黄金法则**:

> **严禁使用 `key?: Type | null` (既可选又可空)。**
> 请在 `key?: Type` (可选) 和 `key: Type | null` (明确为空) 之间二选一。

---

## 2. 分层规范详解

### 2.1 Persistence DTO (持久化层)

**规则**:

1. **严禁使用 `?` (Optional)**。数据库表的列定义是固定的，列永远存在。
2. **必须使用 `| null**`。用于表示数据库中的 `NULL` 值。

✅ **正确示例**:

```typescript
export interface DeviceInfoPersistenceDTO {
  deviceId: string;
  // ✅ 对应 SQL: VARCHAR NOT NULL
  deviceType: string;

  // ✅ 对应 SQL: VARCHAR NULL
  // 明确表示字段存在，但值为 NULL
  os: string | null;
  ipAddress: string | null;

  firstSeenAt: Date;
}
```

❌ **错误示例**:

```typescript
export interface DeviceInfoPersistenceDTO {
  // ❌ 错误：ORM 读取时 os 字段一定存在，不会是 undefined
  os?: string;

  // ❌ 错误：混合写法，增加了类型判断负担
  ipAddress?: string | null;
}
```

---

### 2.2 Domain Object / Value Object (领域层)

**规则**:

1. **推荐使用 `| null**`。
2. **避免使用 `?**`。领域对象（尤其是 Value Object）应该是“完全水合”的（Fully Hydrated）。保持对象形状（Shape）的稳定有助于 V8 引擎优化，也能避免“我不确定这个属性是不存在还是没加载”的歧义。

✅ **正确示例**:

```typescript
export interface DeviceInfo {
  deviceId: string;
  // ✅ 明确表达：我们尝试获取了 OS 信息，但没有获取到 (Unknown)
  os: string | null;

  // ✅ 复杂对象如果整体缺失，也是 null
  location: {
    country: string | null;
    city: string | null;
  } | null;
}
```

---

### 2.3 Client DTO / API Request (传输层)

传输层的规则略显灵活，根据场景分为 **Response (读)** 和 **Request (写)**。

#### A. API Response (读模型)

建议与 Domain 保持一致，使用 **`| null`**。这构成了“显式契约”——前端不需要猜测字段是否存在。

```typescript
// API 返回给前端的数据
export interface DeviceInfoDTO {
  // ✅ 显式契约：前端可以直接用 if (dto.os) 判断
  os: string | null;
}
```

#### B. API Request (写模型 / PATCH)

允许使用 **`?` (Optional)**。
场景：更新接口（Partial Update），用户只提交需要修改的字段。

```typescript
// 前端提交给后端的更新请求
export interface UpdateDeviceReq {
  deviceId: string;
  // ✅ 可选：如果没传，表示不更新此字段
  // 如果传了 null，表示将字段清空 (如移除备注)
  deviceName?: string | null;

  // ✅ 可选：如果不传，不更新 tags
  tags?: string[];
}
```

---

## 3. 代码对比案例

以 `DeviceInfo` 为例，展示全链路的类型流转。

```typescript
// 1. Persistence (DB) - 严格映射 SQL
export interface DeviceInfoPersistenceDTO {
  id: string;
  os: string | null; // SQL: NULL
  browser: string | null; // SQL: NULL
}

// 2. Domain (Logic) - 稳定结构
export interface DeviceInfo {
  id: string;
  os: string | null; // 逻辑中明确知道 os 为空
  browser: string | null;
}

// 3. API Response (DTO) - 显式契约
export interface DeviceInfoDTO {
  id: string;
  os: string | null;
  browser: string | null;
}

// 4. API Request (Patch) - 仅此处允许 Optional
export interface UpdateDeviceProfileReq {
  id: string;
  os?: string; // 仅在不得不更新 OS 时才传
  browser?: string; // undefined = 不修改
}
```

---

## 4. 常见误区检查清单 (Checklist)

在 Review 代码或编写 `contracts` 时，请检查：

- [ ] **PersistenceDTO 中是否出现了 `?**`？ -> **修正**：改为 `| null`。
- [ ] **是否出现了 `?: Type | null` 的混合写法**？ -> **修正**：选一个，不要混用。
- [ ] **领域对象 (Entity/VO) 属性是否使用了 `?**`？ -> **建议**：改为 `| null` 以保持 Shape 稳定。
- [ ] **API 响应是否明确？** -> 推荐返回 `null` 而不是省略字段，除非为了极致的带宽优化。

## 5. 为什么这么规定？(Reasoning)

1. **数据库对齐**: SQL 中 `NULL` 是通过特殊标记位存储的，而 `undefined` 在 JS 中通常意味着 key 都不存在。使用 `| null` 能让 DTO 完美映射数据库行为。
2. **减少类型体操**:

- 混合写法需要判断：`if (val !== undefined && val !== null)`。
- 单一写法只需判断：`if (val)` 或 `if (val != null)`。

3. **性能优化**: JS 引擎（如 V8）喜欢“形状稳定”的对象（Hidden Classes）。如果一个对象一会儿有 `os` 属性，一会儿没有，引擎无法有效优化。初始为 `null` 的属性比不存在的属性性能更好。
