/**
 * @memoflow/repository
 *
 * Public repository contracts stay centralized in
 * `@memoflow/contracts/repository`.
 * Root exports are limited to the canonical server composition roots:
 * ingredient factories, set types, module factory, runtime contribution
 * factories and port types. Client / API / Electron seams use dedicated
 * subpaths.
 *
 * 知识仓储模块运行时根。
 * 公开契约集中在 `@memoflow/contracts/repository`。
 * 根导出仅限于规范化的服务端组合根：原料工厂、集合类型、模块工厂、
 * 运行时贡献工厂与 Port 类型。Client / API / Electron 使用独立 subpath。
 */

export {
  createFsStorageAdapter,
  createRepositoryModule,
  createRepositoryPrismaModule,
  createRepositoryPrismaRepositories,
  createRepositoryPrismaRuntimeContributions,
  createRepositoryRuntimeContribution,
  resolveRepositoryStorageBaseDir,
  DEFAULT_REPOSITORY_STORAGE_BASE_DIR,
  type CreateRepositoryPrismaModuleOptions,
  type CreateRepositoryPrismaRuntimeContributionsInput,
  type ResolveRepositoryStorageBaseDirOptions,
  type RepositoryModuleDependencies,
  type RepositoryModuleInstance,
  type RepositoryModuleRuntimeContribution,
  type RepositoryPrismaRepositorySet,
  type RepositoryPrismaRuntimeContributions,
  type GithubAppConfig,
  type IKnowledgeRemoteBindingRepository,
  type IGithubWebhookDeliveryRepository,
  type IKnowledgeNoteProjectionRepository,
  type IKnowledgeWriteRequestRepository,
  type IKnowledgeAttachmentProjectionRepository,
  type IKnowledgeAttachmentContentCache,
  type IKnowledgeRepositoryLeaseRepository,
  type IKnowledgeRepositoryCloudDataPurger,
  type IGitHubAppClient,
  type IKnowledgeRepositoryConnectionService,
  type IKnowledgeRepositoryProjectionService,
  type IKnowledgeNoteCommitService,
} from './server';
export type { RepositoryApplicationPort } from './server';
