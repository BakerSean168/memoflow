import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import {
  createRepositoryPrismaRepositories,
  createRepositoryPrismaRuntimeContributions,
  createRepositoryPrismaModule,
  createRepositoryModule,
  type RepositoryPrismaRepositorySet,
  type RepositoryPrismaRuntimeContributions,
  type RepositoryModuleInstance,
  type IKnowledgeRemoteBindingRepository,
  type IKnowledgeRepositoryProjectionService,
  type IKnowledgeNoteCommitService,
} from '../../../../src';

/**
 * Repository seam surface.
 * 知识仓储模块 seam 的表面契约。
 *
 * `createRepositoryPrismaRepositories` returns the knowledge persistence
 * / atomic-write capabilities plus audit; `createRepositoryPrismaRuntimeContributions` returns
 * port-shaped services and the runtime contribution, keeping the fail-closed
 * `githubApp + closureChecker` check. `RepositoryModuleDependencies` consumes
 * the narrow service ports, and no concrete GitHub/Prisma/Fs class leaks
 * through the root barrel.
 *
 * `createRepositoryPrismaRepositories` 返回八个知识持久化/原子写能力加审计；
 * `createRepositoryPrismaRuntimeContributions` 返回 Port 形状的服务与运行时贡献，
 * 保留 fail-closed 的 `githubApp + closureChecker` 检查。`RepositoryModuleDependencies`
 * 消费窄服务 Port，具体 GitHub/Prisma/Fs 类不通过根 barrel 泄漏。
 */
describe('repository factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;

  it('createRepositoryPrismaRepositories returns durable installation + atomic connection capabilities plus audit', () => {
    const set = createRepositoryPrismaRepositories(fakePrisma);
    expect(set).toHaveProperty('knowledgeSpaceRepository');
    expect(set).toHaveProperty('bindingRepository');
    expect(set).toHaveProperty('observationRepository');
    expect(set).toHaveProperty('historyFenceRepository');
    expect(set).toHaveProperty('projectionCheckpointRepository');
    expect(set).toHaveProperty('installationIntentRepository');
    expect(set).toHaveProperty('bindingWriteTransactionRunner');
    expect(set).toHaveProperty('deliveryRepository');
    expect(set).toHaveProperty('noteProjectionRepository');
    expect(set).toHaveProperty('attachmentProjectionRepository');
    expect(set).toHaveProperty('attachmentContentCache');
    expect(set).toHaveProperty('writeRequestRepository');
    expect(set).toHaveProperty('leaseRepository');
    expect(set).toHaveProperty('auditRepository');
    const typed: RepositoryPrismaRepositorySet = set;
    expect(typeof typed.bindingRepository.findByIdForIdentity).toBe('function');
    expect(typeof typed.installationIntentRepository.findLatestRecoverableVerified).toBe(
      'function',
    );
    expect(typeof typed.installationIntentRepository.renewVerifiedForRetry).toBe('function');
  });

  it('createRepositoryPrismaRuntimeContributions is null-safe without githubApp', () => {
    const repositories = createRepositoryPrismaRepositories(fakePrisma);
    const runtime = createRepositoryPrismaRuntimeContributions({ repositories });
    expect(runtime.knowledgeRepositoryConnectionService).toBeNull();
    expect(runtime.knowledgeRepositoryProjectionService).toBeNull();
    expect(runtime.knowledgeNoteCommitService).toBeNull();
    expect(runtime.runtimeContribution).toBeNull();
    const typed: RepositoryPrismaRuntimeContributions = runtime;
    expect(typeof typed).toBe('object');
  });

  it('createRepositoryPrismaRuntimeContributions is fail-closed for githubApp without closureChecker', () => {
    const repositories = createRepositoryPrismaRepositories(fakePrisma);
    expect(() =>
      createRepositoryPrismaRuntimeContributions({
        repositories,
        githubApp: {
          appId: 'a',
          appSlug: 's',
          privateKey: 'k',
          webhookSecret: 'w',
          installationRouting: {
            routeKey: 'test',
            webOrigin: 'https://app.example.test',
          },
        },
      }),
    ).toThrow(/FAIL-CLOSED/);
  });

  it('convenience module factory preserves api/start/dispose', () => {
    const instance = createRepositoryPrismaModule(fakePrisma);
    expect(instance).toHaveProperty('api');
    expect(typeof instance.start).toBe('function');
    expect(typeof instance.dispose).toBe('function');
    const typed: RepositoryModuleInstance = instance;
    expect(typeof typed.api.ingestGithubWebhook).toBe('function');
  });

  it('RepositoryModuleDependencies consumes port-shaped services', () => {
    const connectionRepo: IKnowledgeRemoteBindingRepository = {
      findById: async () => null,
      findByIdForIdentity: async () => null,
      findByIdentityId: async () => [],
      findByRepositoryId: async () => null,
      findByInstallationAndRepositoryId: async () => null,
      listProjectionCandidates: async () => [],
      save: async () => undefined,
      markDisconnected: async () => false,
    };
    const projectionService = {
      start: () => undefined,
      stop: () => undefined,
    } as IKnowledgeRepositoryProjectionService;
    const noteCommitService = {} as IKnowledgeNoteCommitService;

    const instance = createRepositoryModule({
      knowledgeRepositoryConnectionService: null,
      knowledgeRepositoryProjectionService: projectionService,
      knowledgeNoteCommitService: noteCommitService,
    });
    expect(instance.api).toBeDefined();
    expect(connectionRepo).toBeDefined();
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'GitHubAppClient',
      'FsStorageAdapter',
      'KnowledgeRemoteBindingPrismaRepository',
      'KnowledgeRepositoryInstallationIntentPrismaRepository',
      'KnowledgeRemoteBindingWritePrismaTransactionRunner',
      'GithubWebhookDeliveryPrismaRepository',
      'KnowledgeNoteProjectionPrismaRepository',
      'KnowledgeAttachmentProjectionPrismaRepository',
      'KnowledgeAttachmentContentCachePrismaRepository',
      'KnowledgeWriteRequestPrismaRepository',
      'KnowledgeRepositoryLeasePrismaRepository',
      'InMemoryKnowledgeRepositoryInstallationStateStore',
    ];

    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    for (const name of forbidden) {
      expect(root).not.toMatch(new RegExp(`\\b${name}\\b`));
    }

    const infra = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    for (const name of forbidden) {
      expect(infra).not.toMatch(new RegExp(`\\b${name}\\b`));
    }

    const rootModule = await import('../../../../src');
    const exportedNames = Object.keys(rootModule).sort();
    for (const name of forbidden) {
      expect(exportedNames).not.toContain(name);
    }
  });
});
