/**
 * Repository API composition root — API lane host runtime.
 * 仓库 API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for repository. The API runtime owns the
 * shared Prisma connection (created in main.ts by connectDatabase()) and the
 * repository host ports (storage base dir, closure checker, GitHub App config,
 * cloud data purger), so it selects the Prisma persistence adapters, builds the
 * port-shaped connection/projection/commit services and the module-owned runtime
 * contribution, and assembles the transport-neutral `RepositoryModuleInstance`.
 * The instance is then bound to an `IApiModule`-compatible handle via
 * `createRepositoryApiModule`.
 *
 * 这是仓库在 API lane 的组合根。API runtime 拥有共享的 Prisma 连接
 * （由 main.ts 的 connectDatabase() 创建）与仓库宿主 ports（存储基础目录、closure
 * checker、GitHub App 配置、云端数据清理器），因此由它选择 Prisma 持久化适配器、
 * 构建 Port 形状的 connection/projection/commit 服务与模块自有运行时贡献，并装配
 * 与传输无关的 `RepositoryModuleInstance`。实例随后通过 `createRepositoryApiModule`
 * 绑定为兼容 `IApiModule` 的 handle。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → repository Prisma repository
 * set → repository Prisma runtime contributions (services + module-owned runtime)
 * → repository instance → API module. The application port stays reachable through
 * the returned handle's `getApplicationPort()` as an explicit dependency for
 * `composeAI` (API lane AI composition consumes it as `repositoryApiPort`).
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 仓库 Prisma 仓储集合 → 仓库 Prisma
 * 运行时贡献（服务 + 模块自有运行时）→ repository instance → API module。
 * 应用 port 仍可通过返回 handle 的 `getApplicationPort()` 获取，作为 `composeAI`
 * 的明确依赖（API lane 的 AI 组装以 `repositoryApiPort` 消费它）。
 *
 * Deliberately narrow interface: the host supplies the shared Prisma client and
 * exactly the repository host ports it owns. The fail-closed
 * `githubApp + closureChecker` check is preserved inside the runtime-contributions
 * factory. Unused capabilities are not accepted.
 *
 * 刻意保持窄接口：宿主提供共享 Prisma client 与其拥有的仓库宿主 ports。
 * fail-closed 的 `githubApp + closureChecker` 检查保留在运行时贡献工厂内。
 * 不接收未使用的能力。
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createRepositoryModule,
  createRepositoryPrismaRepositories,
  createRepositoryPrismaRuntimeContributions,
  type GithubAppConfig,
  type IKnowledgeRepositoryCloudDataPurger,
  KnowledgeDocumentRefResolverService,
} from '@memoflow/repository';
import { createRepositoryApiModule, type RepositoryApiModuleDef } from '@memoflow/repository/api';

/**
 * Dependencies the repository composer needs from the API host runtime.
 * 仓库 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeRepositoryDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
  /** Host-resolved repository storage base directory. 宿主导出的仓库存储基础目录。 */
  readonly storageBaseDir: string;
  /** Host-owned account-active checker (fail-closed when githubApp is configured). 宿主持有的账户激活检查器（配置 githubApp 时 fail-closed）。 */
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  /** Optional GitHub App configuration; when absent the knowledge services stay unavailable. 可选的 GitHub App 配置；缺省时知识服务保持不可用。 */
  readonly githubApp?: GithubAppConfig;
  /** Optional cloud data purger consumed by the connection service. 连接服务消费的可选云端数据清理器。 */
  readonly knowledgeRepositoryCloudDataPurger?: IKnowledgeRepositoryCloudDataPurger;
}

/**
 * Composes the repository API module handle from the API runtime's Prisma client.
 * 用 API runtime 的 Prisma client 组装仓库 API module handle。
 *
 * Wire order:
 * 1. createRepositoryPrismaRepositories(db) — select the Prisma adapters.
 * 2. createRepositoryPrismaRuntimeContributions({ repositories, storageBaseDir,
 *    closureChecker, githubApp, knowledgeRepositoryCloudDataPurger }) — build the
 *    port-shaped connection/projection/commit services and the module-owned
 *    runtime contribution (the projection service).
 * 3. createRepositoryModule({ ...services, runtimeContributions, auditRepository })
 *    — assemble the transport-neutral repository instance.
 * 4. createRepositoryApiModule({ instance }) — bind the instance to an IApiModule
 *    handle (transport + lifecycle only; getApplicationPort() stays instance-bound).
 *
 * 接线顺序：
 * 1. createRepositoryPrismaRepositories(db) —— 选择 Prisma 适配器。
 * 2. createRepositoryPrismaRuntimeContributions({ repositories, storageBaseDir,
 *    closureChecker, githubApp, knowledgeRepositoryCloudDataPurger }) —— 构建 Port
 *    形状的 connection/projection/commit 服务与模块自有运行时贡献（投影服务）。
 * 3. createRepositoryModule({ ...services, runtimeContributions, auditRepository })
 *    —— 装配与传输无关的仓库实例。
 * 4. createRepositoryApiModule({ instance }) —— 把实例绑定到 IApiModule handle
 *    （只负责 transport 与生命周期；getApplicationPort() 保持实例绑定）。
 *
 * The returned handle is already fully bound: ApiBootstrapper.register() must
 * be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ApiBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeRepositoryDependencies with the runtime Prisma client and host ports.
 * @returns RepositoryApiModuleDef — an already-bound IApiModule-compatible handle.
 */
export interface ComposedRepositoryApiModule extends RepositoryApiModuleDef {
  readonly knowledgeDocumentRefResolver: KnowledgeDocumentRefResolverService;
}

export function composeRepository(
  dependencies: ComposeRepositoryDependencies,
): ComposedRepositoryApiModule {
  const repositories = createRepositoryPrismaRepositories(dependencies.db);

  const runtime = createRepositoryPrismaRuntimeContributions({
    repositories,
    storageBaseDir: dependencies.storageBaseDir,
    closureChecker: dependencies.closureChecker,
    githubApp: dependencies.githubApp,
    knowledgeRepositoryCloudDataPurger: dependencies.knowledgeRepositoryCloudDataPurger,
  });

  const instance = createRepositoryModule({
    knowledgeRepositoryConnectionService: runtime.knowledgeRepositoryConnectionService,
    knowledgeRepositoryProjectionService: runtime.knowledgeRepositoryProjectionService,
    knowledgeNoteCommitService: runtime.knowledgeNoteCommitService,
    runtimeContributions: runtime.runtimeContribution ? [runtime.runtimeContribution] : [],
    auditRepository: repositories.auditRepository,
  });

  const module = createRepositoryApiModule({ instance });
  return Object.assign(module, {
    knowledgeDocumentRefResolver: new KnowledgeDocumentRefResolverService(
      repositories.bindingRepository,
      repositories.documentIdentityRepository,
    ),
  });
}
