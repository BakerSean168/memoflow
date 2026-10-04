/**
 * Repository API composition root spec.
 * 仓库 API 组合根测试。
 *
 * Verifies composeRepository():
 * - assembles repository in the mandated plan §3.3 order
 *   (repository set → runtime contributions → module instance → API module)
 * - passes the host storageBaseDir, closureChecker, githubApp and cloud purger
 *   ports through unchanged
 * - keeps the application port reachable through getApplicationPort()
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /repositories and starts the owned instance when registered
 *
 * 验证 composeRepository()：
 * - 按计划 §3.3 顺序装配仓库（仓储集合 → 运行时贡献 → module instance → API module）
 * - 原样透传宿主 storageBaseDir、closureChecker、githubApp 与 cloud purger ports
 * - 通过 getApplicationPort() 保持应用 port 可达
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /repositories 并启动所属实例
 *
 * The ingredient factories are wrapped in vi.fn() so the spec can assert assembly
 * order, while delegating to the real implementations so the structural
 * registration test runs against genuine factories with a fake db.
 *
 * ingredient 工厂被包成 vi.fn() 以便断言装配顺序，同时委托真实实现，
 * 使结构注册测试用真实工厂 + fake db 运行。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { RepositoryApiModuleContext } from '@memoflow/repository/api';
import type { GithubAppConfig, IKnowledgeRepositoryCloudDataPurger } from '@memoflow/repository';

vi.mock('@memoflow/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/repository')>();
  return {
    ...actual,
    createRepositoryModule: vi.fn(actual.createRepositoryModule),
    createRepositoryPrismaRepositories: vi.fn(actual.createRepositoryPrismaRepositories),
    createRepositoryPrismaRuntimeContributions: vi.fn(
      actual.createRepositoryPrismaRuntimeContributions,
    ),
  };
});

vi.mock('@memoflow/repository/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/repository/api')>();
  return {
    ...actual,
    createRepositoryApiModule: vi.fn(actual.createRepositoryApiModule),
  };
});

import { composeRepository } from './compose-repository';
import {
  createRepositoryModule,
  createRepositoryPrismaRepositories,
  createRepositoryPrismaRuntimeContributions,
} from '@memoflow/repository';
import { createRepositoryApiModule } from '@memoflow/repository/api';

const fakeDb = {} as unknown as PrismaClient;
const storageBaseDir = '/tmp/memoflow-repo-test';
const closureChecker = async (_identityId: string): Promise<boolean> => false;
const githubApp = {
  appId: 'test-app',
  appSlug: 'test-slug',
  privateKey: 'test-key',
  webhookSecret: 'test-secret',
} as unknown as GithubAppConfig;
const cloudDataPurger: IKnowledgeRepositoryCloudDataPurger = {
  purgeKnowledgeRepositoryCloudData: vi.fn(async () => {}),
};

describe('composeRepository assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles in plan §3.3 order: repositories → runtime contributions → module → api module', () => {
    composeRepository({
      db: fakeDb,
      storageBaseDir,
      closureChecker,
      githubApp,
      knowledgeRepositoryCloudDataPurger: cloudDataPurger,
    });

    const reposOrder = createRepositoryPrismaRepositories.mock.invocationCallOrder[0];
    const runtimeOrder = createRepositoryPrismaRuntimeContributions.mock.invocationCallOrder[0];
    const moduleOrder = createRepositoryModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createRepositoryApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db and all host ports through unchanged', () => {
    composeRepository({
      db: fakeDb,
      storageBaseDir,
      closureChecker,
      githubApp,
      knowledgeRepositoryCloudDataPurger: cloudDataPurger,
    });

    expect(createRepositoryPrismaRepositories).toHaveBeenCalledWith(fakeDb);

    const repoSet = createRepositoryPrismaRepositories.mock.results[0].value;
    expect(createRepositoryPrismaRuntimeContributions).toHaveBeenCalledWith({
      repositories: repoSet,
      storageBaseDir,
      closureChecker,
      githubApp,
      githubAccountIdResolver: expect.any(Function),
      knowledgeRepositoryCloudDataPurger: cloudDataPurger,
    });
  });

  it('passes the assembled services and module-owned runtime contribution into the module', () => {
    composeRepository({
      db: fakeDb,
      storageBaseDir,
      closureChecker,
      githubApp,
      knowledgeRepositoryCloudDataPurger: cloudDataPurger,
    });

    const runtime = createRepositoryPrismaRuntimeContributions.mock.results[0].value;
    const repoSet = createRepositoryPrismaRepositories.mock.results[0].value;

    const moduleCall = createRepositoryModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      knowledgeRepositoryConnectionService: runtime.knowledgeRepositoryConnectionService,
      knowledgeRepositoryProjectionService: runtime.knowledgeRepositoryProjectionService,
      knowledgeNoteCommitService: runtime.knowledgeNoteCommitService,
      auditRepository: repoSet.auditRepository,
    });
    expect(moduleCall.runtimeContributions).toContain(runtime.runtimeContribution);

    const instance = createRepositoryModule.mock.results[0].value;
    expect(createRepositoryApiModule).toHaveBeenCalledWith({ instance });
  });

  it('returns a module handle with name Repository whose getApplicationPort() returns the instance api', () => {
    const handle = composeRepository({
      db: fakeDb,
      storageBaseDir,
      closureChecker,
      githubApp,
      knowledgeRepositoryCloudDataPurger: cloudDataPurger,
    });

    expect(handle).toMatchObject({ name: 'Repository' });
    expect(typeof handle.register).toBe('function');
    expect(typeof handle.destroy).toBe('function');

    const instance = createRepositoryModule.mock.results[0].value;
    expect(handle.getApplicationPort()).toBe(instance.api);
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: the repository Prisma repositories only hold the db reference
 * at construction, and with githubApp unset the runtime contributions return
 * null services (no runtime contribution), so registering with a fake db
 * succeeds and mounts /repositories.
 *
 * 真实工厂下：仓库 Prisma 仓储构造时只持有 db 引用（无查询），且未配置 githubApp
 * 时运行时贡献返回 null 服务（无运行时贡献），因此用 fake db 注册可成功并挂载
 * /repositories。
 */
describe('composeRepository structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /repositories on the router and starts the owned instance', () => {
    const handle = composeRepository({
      db: fakeDb,
      storageBaseDir,
      closureChecker,
      githubApp: undefined,
      knowledgeRepositoryCloudDataPurger: undefined,
    });

    const instance = createRepositoryModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: RepositoryApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    expect(() => handle.register(context)).not.toThrow();
    expect(routerUse).toHaveBeenCalledWith('/repositories', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    handle.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
