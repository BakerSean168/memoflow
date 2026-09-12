/**
 * Account API composition root — API lane host runtime.
 * 账户 API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for account. The API runtime owns the
 * shared Prisma connection (created in main.ts by connectDatabase()) and the
 * CloudAuth capability (created in main.ts), so it selects the Prisma
 * persistence adapters, builds the module-owned runtime contributions, and
 * assembles the transport-neutral `AccountModuleInstance`. The instance is
 * then bound to an `IApiModule`-compatible handle via `createAccountApiModule`.
 *
 * 这是账户在 API lane 的组合根。API runtime 拥有共享的 Prisma 连接
 * （由 main.ts 的 connectDatabase() 创建）与 CloudAuth 能力（也在 main.ts 创建），
 * 因此由它选择 Prisma 持久化适配器、构建模块自有运行时贡献，并装配与传输无关的
 * `AccountModuleInstance`。实例随后通过 `createAccountApiModule` 绑定为兼容
 * `IApiModule` 的 handle。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → account Prisma repository
 * set (incl. the CloudAuth revocation adapter) → module-owned runtime
 * contributions → account instance → API module. This keeps the dependency
 * direction explicit: the host picks adapters, the account deep module stays
 * transport-agnostic, and the returned handle only registers transport +
 * lifecycle.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 账户 Prisma 仓储集合（含 CloudAuth
 * revocation 适配器）→ 模块自有运行时贡献 → account instance → API module。
 * 这使依赖方向显式化：宿主选择适配器，account 深模块保持与传输无关，
 * 返回的 handle 只负责 transport 注册与生命周期。
 *
 * Deliberately narrow interface: the host supplies the shared Prisma client and
 * the already-created CloudAuth port (`cloudAuth` is the exact object from
 * main.ts — never inferred from API context) plus optional extra runtime
 * contributions. Unused capabilities (storage dirs, transports) are not
 * accepted.
 *
 * 刻意保持窄接口：宿主提供共享 Prisma client 与已创建的 CloudAuth port
 * （`cloudAuth` 就是 main.ts 中的那个对象——绝不在 API context 推断）以及可选额外
 * 运行时贡献。不接收未使用的能力（存储目录、transport 等）。
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createAccountModule,
  createAccountPrismaRepositories,
  createAccountRuntimeContributions,
  type AccountRuntimeContributionsInput,
  type CloudAuthLike,
} from '@memoflow/account';
import type { Clock } from '@memoflow/time';
import { createAccountApiModule, type AccountApiModuleDef } from '@memoflow/account/api';

/**
 * Dependencies the account composer needs from the API host runtime.
 * 账户 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeAccountDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
  /** Host-owned CloudAuth capability typed as a port; used for closure revocation. 宿主持有的、以 Port 形式类型化的 CloudAuth 能力，用于 closure revocation。 */
  readonly cloudAuth: CloudAuthLike;
  /** Host-owned Product Time clock for Account mutations. */
  readonly clock: Clock;
  /** Extra runtime contributions from the host. 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: AccountRuntimeContributionsInput;
}

/**
 * Composes the account API module handle from the API runtime's Prisma client.
 * 用 API runtime 的 Prisma client 组装账户 API module handle。
 *
 * Wire order:
 * 1. createAccountPrismaRepositories({ db, cloudAuth }) — select the Prisma
 *    adapters and build the CloudAuth revocation adapter from the host port.
 * 2. createAccountRuntimeContributions(accountRepository, runtimeContributions)
 *    — build the module-owned runtime contributions.
 * 3. createAccountModule({ ...repositories, laneCapability: 'api',
 *    runtimeContributions }) — assemble the transport-neutral account instance
 *    (API-lane closure coordinator is fail-fast when the closure ingredients
 *    are missing).
 * 4. createAccountApiModule({ instance }) — bind the instance to an IApiModule
 *    handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createAccountPrismaRepositories({ db, cloudAuth }) —— 选择 Prisma 适配器，
 *    并用宿主 port 构建 CloudAuth revocation 适配器。
 * 2. createAccountRuntimeContributions(accountRepository, runtimeContributions)
 *    —— 构建模块自有运行时贡献。
 * 3. createAccountModule({ ...repositories, laneCapability: 'api',
 *    runtimeContributions }) —— 装配与传输无关的账户实例（API lane 的 closure
 *    coordinator 在缺少 closure 原料时会 fail-fast）。
 * 4. createAccountApiModule({ instance }) —— 把实例绑定到 IApiModule handle
 *    （只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ApiBootstrapper.register() must
 * be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ApiBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeAccountDependencies with the runtime Prisma client and CloudAuth port.
 * @returns AccountApiModuleDef — an already-bound IApiModule-compatible handle.
 */
export function composeAccount(dependencies: ComposeAccountDependencies): AccountApiModuleDef {
  const repositories = createAccountPrismaRepositories({
    db: dependencies.db,
    clock: dependencies.clock,
    cloudAuth: dependencies.cloudAuth,
  });

  const instance = createAccountModule({
    accountRepository: repositories.accountRepository,
    clock: dependencies.clock,
    closureOperationRepository: repositories.closureOperationRepository,
    revocationPort: repositories.revocationPort,
    eventPublisher: repositories.eventPublisher,
    laneCapability: 'api',
    runtimeContributions: createAccountRuntimeContributions(
      repositories.accountRepository,
      dependencies.runtimeContributions,
    ),
    auditRepository: repositories.auditRepository,
  });

  return createAccountApiModule({ instance });
}
