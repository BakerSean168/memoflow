# MemoFlow 桌面端认证问题根因分析

> 范围：仅根因分析，**未修改任何代码**。所有结论基于仓库当前源码逐链路核实。
> 日期：2026-08-02

---

## 问题 1：桌面端登录历史数据失效（记住账号登录失败后未清除本地失效数据）

### 现象（用户描述）

桌面端登录时本地保存了旧密码数据；数据库已更新（如用户改密 / 服务端凭据失效），这些本地数据已失效。期望：登录失效一次后，应显示明确提示（"账号密码有问题" / "已失效"）并清除失效数据。当前设计缺少这一步。

### 涉及的本地数据

1. **记住账号条目**：`RememberedAccountsService` 持久化到 `auth/remembered-accounts.json`（`apps/desktop/src/main/modules/authentication/infrastructure/remembered-accounts-service.ts`），每条含 `encryptedPassword`（safeStorage 加密后的密码）。
2. **离线凭据**：本地 `AuthIdentity`（Argon2 哈希），由 `offline-auth-helper.verifyCredentials` 用于离线校验。

### 失败路径（核实）

- UI：`DesktopAuthView` 的记住账号登录走 `useRememberedAccounts.loginRememberedDesktopAccount`（`packages/app-vue/src/modules/authentication/composables/useRememberedAccounts.ts:33`）。
- 失败时（`:53`）仅调用 `reportAuthResultFailure(...)` —— 只弹 toast + 写入 `lastResultError`，**不删除任何本地数据**。
- 业务层：`AuthDesktopApplicationService.loginRememberedAccount` → `DesktopCredentialAuthCoordinator.loginRememberedAccount` 失败返回 `fail`，同样**不清除** `remembered-accounts.json` 条目，也不撤销本地 `AuthIdentity`。
- 唯一的清除入口：`removeRememberedAccount`（`:66`）→ `RememberedAccountsService.remove`（`:141`），**仅由 UI 的垃圾桶按钮 `handleRemove` 触发**。

### 根因

登录失败的判定与"本地失效数据清理"在架构上是**脱钩**的：

- 没有"这次失败是确定性失效（服务端 401 / 凭据无效 / 离线密码不匹配），而不是瞬时网络错误"的判别逻辑；
- 没有"判定为失效 → 显式提示 + 清除该账号的 remembered 条目与离线 AuthIdentity"的动作。

结果：失效的本地数据（记住账号 + 加密密码 + 离线身份）被永久保留，每次登录都重复失败，用户也收不到"已失效，请重新登录"的明确信号。这正是用户所说"设计有问题"的部分。

### 修复方向（仅建议，未改动）

1. 在 `loginRememberedAccount` 的失败分支区分错误类型：只有"凭据无效 / 账号已失效"类错误才进入"失效处理"。
2. 进入失效处理后：
   - 弹**明确**提示（如"该账号的本地登录信息已失效，请重新输入密码登录"）；
   - 调用 `rememberedAccountsService.remove(identityId)` 清除 `remembered-accounts.json` 中该条目（及其 `encryptedPassword`）；
   - 同时撤销 / 清除本地离线 `AuthIdentity`（避免离线路径继续用旧哈希校验）。
3. 可选：保留非敏感的 identifier / nickname 以便回填，仅清掉密码与离线身份。

---

## 问题 2：访客模式登录跳转异常（窗口变主窗口大小，但内容停在登录页）

### 现象（用户描述）

"保存的账号登录失败"（正常失败路径）后点击"访客模式登录"：窗口发生跳转、尺寸变成主窗口大小，但**实际页面内容仍停留在登录页面**。

### 关键结论先行

窗口尺寸变成主窗口，**证明窗口切换（`transitionToMainWindow`）确实执行了**；内容停在登录页，**证明主窗口渲染器拿到的认证快照是"未认证"**。二者由两条独立链路决定，因此出现"窗口切了、页面没切"的割裂现象。根因在"访客 session 与 token 的 TTL 不匹配 + 复用旧 session 不校验过期"。

### 逐链路核实

1. **窗口切换链路（确实发生）**：`ENTER_GUEST_MODE` 处理器（`apps/desktop/src/main/modules/authentication/desktop-auth-shell.ts:285`）依次执行 `prepareGuestProfile → service.enterGuestMode() → activatePreparedProfile({syncMode:'local'}) → windowManager.transitionToMainWindow(...)`。后者创建 1200×800 主窗口、100ms 后关闭 420×580 登录窗口。所以窗口尺寸变主窗口大小是预期内的。
2. **访客身份建立**：`coordinator.enterGuestMode`（`apps/desktop/src/main/modules/authentication/application/desktop-credential-auth-coordinator.ts:325`）→ `sessionManager.getOrCreateGuestIdentity()` + `authMode=GUEST` + `safeTransition AUTHENTICATED`。
3. **访客 session 的 TTL 错配（致命）**：`guest-identity-helper.getOrCreateGuestIdentity`（`apps/desktop/src/main/modules/authentication/infrastructure/guest-identity-helper.ts`）：
   - 新建分支（`:99`）：`AuthSession.expiresAt = Date.now() + 3600*1000`（**1 小时**）；
   - `saveTokens`（`:117-118`）：`accessTokenExpiresIn / refreshTokenExpiresIn = 365*24*3600`（**1 年**）。
   - **已有分支（`:66-76`）**：若磁盘上已存在 guest token 且 `sessionRepository.findByIdentityId(guestId)` 返回 ≥1 条，**直接返回第一条已有 session 对象，不做过期校验**。
4. **快照判定（决定页面）**：主窗口渲染器启动 → `GET_BOOTSTRAP_SNAPSHOT` → `buildBootstrapSnapshot`（`apps/desktop/src/main/modules/authentication/application/desktop-auth-lifecycle-coordinator.ts:340`）→ `sessionManager.ensureCurrentSession()`（`apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts:329`）。
   - `ensureCurrentSession`：`currentSession?.isValid()` 才直接返回；否则走 `restoreSession`。
   - `AuthSession.isValid()`（`packages/authentication/src/server/domain/aggregates/auth-session.ts:217`）：`!isRevoked && 状态 active && expiresAt >= Date.now()`。
   - `restoreSession`（`apps/desktop/src/main/modules/authentication/infrastructure/session-restore.ts:114`）：若取到的 session `!isValid()` → `tokenManager.clearTokens()` → 返回 `{ok:false, needsReLogin:true}`。
   - 回到 `getStatus()`：`authenticated = session?.isValid() ?? false` → **false** → 快照 `status.authenticated=false` → `currentUser=null`。
5. **渲染器路由**：渲染器 `isAuthenticated` 读取快照 `status.authenticated=false` → 启动重定向（`shouldRedirectAuthenticatedDesktopEntry`）不生效 → 停留在 `/auth`（登录页）。

### 根因（两条缺陷叠加）

- **缺陷 A（即时，触发报告中的症状）**：`getOrCreateGuestIdentity` 的"已有 guest session"分支**复用磁盘上的旧 session 而不校验过期**。guest profile 目录以常量 `GUEST_PROFILE_IDENTITY='__desktop_guest_profile__'` 为键、跨应用运行持久化；且 `SessionManager.startCurrentSessionLifecycle` 的活动定时器每 5 分钟执行 `sessionRepository.save(currentSession)`，把那个 1 小时 session 长期留在磁盘。于是"任何一次先前的访客使用"之后，下一次点访客会取回一个**已经过期的 1 小时 session** → `isValid()=false` → `restoreSession` 清 token → 快照未认证 → 登录页。
- **缺陷 B（潜伏，必然发生）**：guest session TTL（1h）与 token TTL（1y）严重不匹配。即使每次都新建 session，访客身份也只有效 1 小时；1 小时后 `restoreSession` 判定 session 过期 → 清 token → 被踢回登录页。访客模式实质只能连续用 1 小时，之后静默失效。

### 附加不一致（同一条"恢复 guest"逻辑的两种语义）

`getOrCreateGuestIdentity` 的恢复路径不统一：

- 已有 session 分支（`:66-76`）：返回磁盘上 1 小时旧 session（可能已过期）；
- "无 session 但存在 guest token"分支（`:78-86`，经 `restoreRuntimeSessionFromToken`）：用 token 的 1 年有效期重建 session（有效）。
  同一函数可能产出 1h 或 1y 两种 session，本身即 bug，加剧了排查难度。

### 修复方向（仅建议，未改动）

1. **统一并修正 guest session 有效期**：让 guest session 的 `expiresAt` 与 token TTL 对齐（例如都按 1 年，或引入明确的"guest 不过期"语义）；不要在 session 上挂一个远短于 token 的 1h 过期。
2. **恢复 guest 时必须重新校验并必要时重建**：`getOrCreateGuestIdentity` 在复用已有 session 前应调用 `isValid()`；过期则走 `restoreRuntimeSessionFromToken`（按 token 有效期重建），而不是把过期 session 原样返回。
3. （可选）访客模式本就不依赖 refresh token 合法性做"是否登录"判定，可直接以"存在 guest token"作为已认证依据，绕开 session 过期这一环。

---

## 附带问题 3：日志 `TaskGoalOutboxRuntime Dispatch cycle failed {"error":{"error":"no such column: event_id"}}`

与登录问题**无关**，但是日志里反复出现的独立回归：

- `packages/task/src/server/infrastructure/adapters/powersync/powersync-task-goal-outbox-dispatch-store.ts` 的 `claimPending / markDelivered / markRetry / replayDeadLetter` 仍按 `event_id` 列查询。
- 但 `packages/powersync-schema/src/index.ts` 的 `task_goal_outbox` 表定义**没有 `event_id` 列**（重构删列后适配器未同步）。PG 适配器用 `event_id` 合法（PG schema 有），SQLite / PowerSync 适配器没有该列，于是本地 / 桌面路径报 `no such column: event_id`。
- 这也呼应了"数据库已更新、本地适配器未同步"的大背景。修复：让 PowerSync 适配器的查询列与 `task_goal_outbox` 当前 schema 对齐（去掉 `event_id`，改用现有主键 / 标识列）。

---

## 优先级建议

1. **问题 2（缺陷 B）**：访客 1 小时静默失效，影响所有访客用户，优先修。
2. **问题 2（缺陷 A）**：即时"点访客却停在登录页"，开发者 / 测试环境高频踩到，优先修。
3. **问题 1**：本地失效数据不清，影响"改密后旧设备"的体验，按上述方向补失败清理。
4. **问题 3**：独立回归，另开修复。
