/**
 * Repository Prisma composition helpers.
 * 知识仓储模块 Prisma 组合辅助函数。
 *
 * Host-facing ingredient seams: the repository set type, the repository
 * factory, the runtime-contributions factory and the delegating convenience
 * module factory. Concrete GitHub client / service / Prisma adapter classes
 * stay implementation-private behind these factories.
 *
 * 面向宿主的组合原料：仓储集合类型、仓储工厂、运行时贡献工厂与委托式便捷模块工厂。
 * 具体 GitHub client / service / Prisma 适配器类保持在这些工厂背后，实现私有。
 */

import type { PrismaClient } from '@memoflow/database';
import { FsStorageAdapter } from './adapters/fs/fs-storage.adapter';
import {
  createRepositoryModule,
  type RepositoryModuleInstance,
  type RepositoryModuleRuntimeContribution,
} from './repository.module';
import { resolveRepositoryStorageBaseDir } from './storage-config';
import { KnowledgeRepositoryConnectionService } from '../application/services/knowledge-repository-connection.service';
import type { IGitHubAppClient } from '../application/ports/github-app-client.port';
import type { IKnowledgeRepositoryCloudDataPurger } from '../application/ports/knowledge-repository-cloud-data-purger.port';
import type { IKnowledgeRepositoryConnectionService } from '../application/ports/knowledge-repository-connection.service.port';
import type { IKnowledgeRepositoryProjectionService } from '../application/ports/knowledge-repository-projection.service.port';
import type { IKnowledgeNoteCommitService } from '../application/ports/knowledge-note-commit.service.port';
import { GitHubAppClient } from './services/github-app-client';
import {
  KnowledgeProjectionCheckpointPrismaRepository,
  KnowledgeRemoteBindingPrismaRepository,
  KnowledgeSpacePrismaRepository,
  RemoteHistoryFencePrismaRepository,
  RemoteRepositoryObservationPrismaRepository,
} from './adapters/prisma/knowledge-remote-binding-prisma.repositories';
import { KnowledgeRepositoryInstallationIntentPrismaRepository } from './adapters/prisma/knowledge-repository-installation-intent-prisma.repository';
import { KnowledgeRemoteBindingWritePrismaTransactionRunner } from './adapters/prisma/knowledge-remote-binding-write-prisma-transaction.runner';
import { KnowledgeDocumentIdentityPrismaRepository } from './adapters/prisma/knowledge-document-identity-prisma.repository';
import { GithubWebhookDeliveryPrismaRepository } from './adapters/prisma/github-webhook-delivery-prisma.repository';
import { KnowledgeNoteProjectionPrismaRepository } from './adapters/prisma/knowledge-note-projection-prisma.repository';
import { KnowledgeAttachmentProjectionPrismaRepository } from './adapters/prisma/knowledge-attachment-projection-prisma.repository';
import { KnowledgeAttachmentContentCachePrismaRepository } from './adapters/prisma/knowledge-attachment-content-cache-prisma.repository';
import { KnowledgeWriteRequestPrismaRepository } from './adapters/prisma/knowledge-write-request-prisma.repository';
import { KnowledgeRepositoryLeasePrismaRepository } from './adapters/prisma/knowledge-repository-lease-prisma.repository';
import { KnowledgeRepositoryProjectionService } from '../application/services/knowledge-repository-projection.service';
import { KnowledgeProjectionEngine } from '../application/services/knowledge-projection.engine';
import { KnowledgeNoteCommitService } from '../application/services/knowledge-note-commit.service';
import {
  PrismaOperationAuditRepository,
  globalUnifiedOperationMetrics,
} from '@memoflow/patterns/operations';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IKnowledgeSpaceRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../application/ports/knowledge-remote-binding.repositories';
import type { IKnowledgeRepositoryInstallationIntentRepository } from '../application/ports/knowledge-repository-installation-intent.repository';
import type { KnowledgeRepositoryInstallationRoutingConfig } from '../application/services/knowledge-repository-connection.service';
import type { IKnowledgeDocumentIdentityRepository } from '../application/ports/knowledge-document-identity.repository';
import type {
  IGithubWebhookDeliveryRepository,
  IKnowledgeNoteProjectionRepository,
  IKnowledgeWriteRequestRepository,
} from '../application/ports/knowledge-note-projection.repository';
import type { IKnowledgeAttachmentProjectionRepository } from '../application/ports/knowledge-attachment-projection.repository';
import type { IKnowledgeAttachmentContentCache } from '../application/ports/knowledge-attachment-content-cache.port';
import type { IKnowledgeRepositoryLeaseRepository } from '../application/ports/knowledge-repository-lease.repository';

export interface CreateRepositoryPrismaModuleOptions {
  readonly storageBaseDir?: string;
  readonly closureChecker?: (identityId: string) => Promise<boolean>;
  readonly runtimeContributions?:
    RepositoryModuleRuntimeContribution | readonly RepositoryModuleRuntimeContribution[];
  readonly githubApp?: GithubAppConfig;
  readonly knowledgeRepositoryCloudDataPurger?: IKnowledgeRepositoryCloudDataPurger;
}

export interface GithubAppConfig {
  readonly appId: string;
  readonly appSlug: string;
  readonly privateKey: string;
  readonly webhookSecret: string;
  readonly installationRouting: KnowledgeRepositoryInstallationRoutingConfig;
  readonly apiBaseUrl?: string;
  readonly client?: IGitHubAppClient;
  readonly installationIntentRepository?: IKnowledgeRepositoryInstallationIntentRepository;
}

/**
 * Host-facing knowledge repository set for the Prisma lane.
 * 面向宿主暴露的 Prisma lane 知识仓储集合。
 *
 * Contains the seven knowledge persistence categories (connection, webhook
 * delivery, note/attachment projections, attachment content cache, write
 * requests, lease) plus the operation audit repository.
 *
 * 包含七个知识持久化类别（连接、webhook delivery、note/attachment 投影、
 * attachment 内容缓存、write requests、lease）以及操作审计仓储。
 */
export interface RepositoryPrismaRepositorySet {
  readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository;
  readonly bindingRepository: IKnowledgeRemoteBindingRepository;
  readonly observationRepository: IRemoteRepositoryObservationRepository;
  readonly historyFenceRepository: IRemoteHistoryFenceRepository;
  readonly projectionCheckpointRepository: IKnowledgeProjectionCheckpointRepository;
  readonly installationIntentRepository: IKnowledgeRepositoryInstallationIntentRepository;
  readonly bindingWriteTransactionRunner: KnowledgeRemoteBindingWritePrismaTransactionRunner;
  readonly deliveryRepository: IGithubWebhookDeliveryRepository;
  readonly documentIdentityRepository: IKnowledgeDocumentIdentityRepository;
  readonly noteProjectionRepository: IKnowledgeNoteProjectionRepository;
  readonly attachmentProjectionRepository: IKnowledgeAttachmentProjectionRepository;
  readonly attachmentContentCache: IKnowledgeAttachmentContentCache;
  readonly writeRequestRepository: IKnowledgeWriteRequestRepository;
  readonly leaseRepository: IKnowledgeRepositoryLeaseRepository;
  readonly auditRepository: OperationAuditRepository;
}

export function createFsStorageAdapter(baseDir?: string): FsStorageAdapter {
  const resolvedBaseDir = resolveRepositoryStorageBaseDir({ storageBaseDir: baseDir });
  return new FsStorageAdapter(resolvedBaseDir);
}

/**
 * Creates Prisma-backed knowledge repository adapters.
 * 创建基于 Prisma 的知识仓储适配器。
 *
 * Host-level composition ingredient: selects the Prisma adapters and returns
 * the repository Port shape. Unlike the runtime-contributions factory, this
 * creates every adapter unconditionally — whether a GitHub App is configured is
 * decided by `createRepositoryPrismaRuntimeContributions`.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回仓储 Port 形状。与运行时贡献工厂不同，
 * 此工厂无条件创建全部适配器——是否配置 GitHub App 由
 * `createRepositoryPrismaRuntimeContributions` 决定。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @returns Repository set backed by the Prisma adapters.
 *          返回基于 Prisma 适配器的仓储集合。
 */
export function createRepositoryPrismaRepositories(
  db: PrismaClient,
): RepositoryPrismaRepositorySet {
  return {
    knowledgeSpaceRepository: new KnowledgeSpacePrismaRepository(db),
    bindingRepository: new KnowledgeRemoteBindingPrismaRepository(db),
    observationRepository: new RemoteRepositoryObservationPrismaRepository(db),
    historyFenceRepository: new RemoteHistoryFencePrismaRepository(db),
    projectionCheckpointRepository: new KnowledgeProjectionCheckpointPrismaRepository(db),
    installationIntentRepository: new KnowledgeRepositoryInstallationIntentPrismaRepository(db),
    bindingWriteTransactionRunner: new KnowledgeRemoteBindingWritePrismaTransactionRunner(db),
    deliveryRepository: new GithubWebhookDeliveryPrismaRepository(db),
    documentIdentityRepository: new KnowledgeDocumentIdentityPrismaRepository(db),
    noteProjectionRepository: new KnowledgeNoteProjectionPrismaRepository(db),
    attachmentProjectionRepository: new KnowledgeAttachmentProjectionPrismaRepository(db),
    attachmentContentCache: new KnowledgeAttachmentContentCachePrismaRepository(db),
    writeRequestRepository: new KnowledgeWriteRequestPrismaRepository(db),
    leaseRepository: new KnowledgeRepositoryLeasePrismaRepository(db),
    auditRepository: new PrismaOperationAuditRepository(db),
  };
}

export interface CreateRepositoryPrismaRuntimeContributionsInput {
  readonly repositories: RepositoryPrismaRepositorySet;
  readonly storageBaseDir?: string;
  readonly closureChecker?: (identityId: string) => Promise<boolean>;
  readonly githubApp?: GithubAppConfig;
  readonly knowledgeRepositoryCloudDataPurger?: IKnowledgeRepositoryCloudDataPurger;
}

export interface RepositoryPrismaRuntimeContributions {
  readonly knowledgeRepositoryConnectionService: IKnowledgeRepositoryConnectionService | null;
  readonly knowledgeRepositoryProjectionService: IKnowledgeRepositoryProjectionService | null;
  readonly knowledgeNoteCommitService: IKnowledgeNoteCommitService | null;
  readonly runtimeContribution: RepositoryModuleRuntimeContribution | null;
}

/**
 * Creates the port-shaped knowledge repository services and runtime contribution.
 * 创建 Port 形状的知识仓储服务与运行时贡献。
 *
 * Host-level composition ingredient: constructs the concrete GitHub App client
 * and the connection / projection / commit services behind the port-shaped
 * return, preserving the fail-closed `githubApp + closureChecker` check. The
 * projection service doubles as the module-owned runtime contribution.
 *
 * 宿主级组合原料：在 Port 形状的返回值背后构造具体 GitHub App client 与
 * connection / projection / commit 服务，保留 fail-closed 的
 * `githubApp + closureChecker` 检查。投影服务同时充当模块自有运行时贡献。
 *
 * @param deps - The repository set plus host wiring options (storage dir, closure checker,
 *               GitHub App config and cloud data purger).
 *               仓储集合与宿主接线选项（存储目录、closure checker、GitHub App 配置与云端数据清理器）。
 * @returns Port-shaped services and the runtime contribution (null when GitHub App is unset).
 *          返回 Port 形状的服务与运行时贡献（未配置 GitHub App 时为 null）。
 */
export function createRepositoryPrismaRuntimeContributions(
  deps: CreateRepositoryPrismaRuntimeContributionsInput,
): RepositoryPrismaRuntimeContributions {
  if (deps.githubApp && !deps.closureChecker) {
    throw new Error(
      '[FAIL-CLOSED] createRepositoryPrismaRuntimeContributions requires closureChecker when githubApp is provided',
    );
  }

  const { repositories, githubApp } = deps;
  const bindingRepository = githubApp ? repositories.bindingRepository : null;
  const githubAppClient = githubApp
    ? (githubApp.client ??
      new GitHubAppClient({
        appId: githubApp.appId,
        privateKey: githubApp.privateKey,
        apiBaseUrl: githubApp.apiBaseUrl,
      }))
    : null;
  const projectionRepository = githubApp ? repositories.noteProjectionRepository : null;
  const attachmentRepository = githubApp ? repositories.attachmentProjectionRepository : null;
  const attachmentContentCache = githubApp ? repositories.attachmentContentCache : null;
  const leaseRepository = githubApp ? repositories.leaseRepository : null;
  const writeRequestRepository = githubApp ? repositories.writeRequestRepository : null;
  const knowledgeProjectionEngine =
    githubApp && projectionRepository
      ? new KnowledgeProjectionEngine({
          projectionRepository,
          attachmentRepository: attachmentRepository ?? undefined,
          documentIdentityRepository: repositories.documentIdentityRepository,
        })
      : null;

  const knowledgeRepositoryConnectionService =
    githubApp && bindingRepository && githubAppClient
      ? new KnowledgeRepositoryConnectionService({
          appSlug: githubApp.appSlug,
          knowledgeSpaceRepository: repositories.knowledgeSpaceRepository,
          bindingRepository,
          observationRepository: repositories.observationRepository,
          historyFenceRepository: repositories.historyFenceRepository,
          projectionCheckpointRepository: repositories.projectionCheckpointRepository,
          bindingWriteTransactionRunner: repositories.bindingWriteTransactionRunner,
          githubAppClient,
          installationIntentRepository:
            githubApp.installationIntentRepository ?? repositories.installationIntentRepository,
          installationRouting: githubApp.installationRouting,
          cloudDataPurger: deps.knowledgeRepositoryCloudDataPurger,
        })
      : null;
  const knowledgeRepositoryProjectionService =
    githubApp &&
    bindingRepository &&
    githubAppClient &&
    projectionRepository &&
    attachmentRepository
      ? new KnowledgeRepositoryProjectionService({
          webhookSecret: githubApp.webhookSecret,
          connectionRepository: bindingRepository,
          projectionCheckpointRepository: repositories.projectionCheckpointRepository,
          observationRepository: repositories.observationRepository,
          historyFenceRepository: repositories.historyFenceRepository,
          deliveryRepository: repositories.deliveryRepository,
          documentIdentityRepository: repositories.documentIdentityRepository,
          projectionRepository,
          attachmentRepository,
          attachmentContentCache: attachmentContentCache ?? undefined,
          writeRequestRepository: writeRequestRepository ?? undefined,
          leaseRepository: leaseRepository ?? undefined,
          githubAppClient,
          metrics: globalUnifiedOperationMetrics,
          projectionEngine: knowledgeProjectionEngine ?? undefined,
        })
      : null;
  const knowledgeNoteCommitService =
    githubApp && bindingRepository && githubAppClient && projectionRepository && deps.closureChecker
      ? new KnowledgeNoteCommitService({
          connectionRepository: bindingRepository,
          observationRepository: repositories.observationRepository,
          historyFenceRepository: repositories.historyFenceRepository,
          documentIdentityRepository: repositories.documentIdentityRepository,
          projectionRepository,
          writeRequestRepository: writeRequestRepository ?? repositories.writeRequestRepository,
          leaseRepository: leaseRepository ?? undefined,
          githubAppClient,
          closureChecker: deps.closureChecker,
          metrics: globalUnifiedOperationMetrics,
          projectionEngine: knowledgeProjectionEngine ?? undefined,
        })
      : null;

  return {
    knowledgeRepositoryConnectionService,
    knowledgeRepositoryProjectionService,
    knowledgeNoteCommitService,
    runtimeContribution: knowledgeRepositoryProjectionService,
  };
}

/**
 * Create a fully-wired repository module backed by Prisma.
 * 创建基于 Prisma 的完整知识仓储模块。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createRepositoryPrismaRepositories() and
 * createRepositoryPrismaRuntimeContributions() plus the canonical assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createRepositoryPrismaRepositories() 与 createRepositoryPrismaRuntimeContributions()
 * 及规范化装配。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param options - Host wiring options. 宿主接线选项。
 * @returns RepositoryModuleInstance with Prisma-backed services attached.
 *          返回挂载 Prisma 服务的知识仓储模块实例。
 */
export function createRepositoryPrismaModule(
  db: PrismaClient,
  options: CreateRepositoryPrismaModuleOptions = {},
): RepositoryModuleInstance {
  const repositories = createRepositoryPrismaRepositories(db);
  const runtime = createRepositoryPrismaRuntimeContributions({
    repositories,
    closureChecker: options.closureChecker,
    githubApp: options.githubApp,
    knowledgeRepositoryCloudDataPurger: options.knowledgeRepositoryCloudDataPurger,
  });

  const configuredRuntimeContributions = Array.isArray(options.runtimeContributions)
    ? options.runtimeContributions
    : options.runtimeContributions
      ? [options.runtimeContributions]
      : [];

  return createRepositoryModule({
    knowledgeRepositoryConnectionService: runtime.knowledgeRepositoryConnectionService,
    knowledgeRepositoryProjectionService: runtime.knowledgeRepositoryProjectionService,
    knowledgeNoteCommitService: runtime.knowledgeNoteCommitService,
    runtimeContributions: [
      ...configuredRuntimeContributions,
      ...(runtime.runtimeContribution ? [runtime.runtimeContribution] : []),
    ],
    auditRepository: repositories.auditRepository,
  });
}
