/**
 * Account Prisma composition helpers.
 * 账户模块 Prisma 组合辅助函数。
 *
 * Host-facing ingredient seams: the repository set type, the repository
 * factory and the delegating convenience module factory. Concrete Prisma
 * adapter classes never cross the public barrel — hosts consume repositories
 * only through the port-shaped set.
 *
 * 面向宿主的组合原料：仓储集合类型、仓储工厂与委托式便捷模块工厂。
 * 具体 Prisma 适配器类不会越过公共 barrel——宿主只能通过 Port 形状的集合使用仓储。
 */

import type { PrismaClient } from '@memoflow/database';
import type { Clock } from '@memoflow/time';
// Structural cloud-auth shape (boundary: scope:account must not import scope:authentication libs directly)
export interface CloudAuthLike {
  revokeAllSessions(identityId: string): Promise<{ revokedSessions: number }>;
  deleteUserData?(identityId: string): Promise<{ deletedRecords: number }>;
}
import { createAccountModule, type AccountModuleInstance } from './account.module';
import { PrismaAccountRepository } from './adapters/prisma/account-prisma.repository';
import { PrismaAccountClosureOperationRepository } from './adapters/prisma/account-closure-operation-prisma.repository';
import { AccountClosureOutboxEventPublisher } from './adapters/outbox/account-closure-outbox-event-publisher';
import { PrismaCloudAuthRevocationAdapter } from './adapters/cloud-auth/cloud-auth-revocation.adapter';
import type {
  CloudAuthRevocationPort,
  AccountClosureEventPublisher,
  IAccountClosureOperationRepository,
} from '../index';
import {
  createAccountRuntimeContributions,
  type AccountRuntimeContributionsInput,
} from './runtime';
import { PrismaOperationAuditRepository } from '@memoflow/patterns/operations';
import type { IAccountRepository } from '../domain';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';

export interface CreateAccountPrismaModuleOptions {
  readonly runtimeContributions?: AccountRuntimeContributionsInput;
  readonly closureOperationRepository?: IAccountClosureOperationRepository;
  readonly revocationPort?: CloudAuthRevocationPort;
  readonly eventPublisher?: AccountClosureEventPublisher;
  readonly cloudAuth?: CloudAuthLike;
  readonly clock: Clock;
}

/**
 * Host-facing account repository set for the Prisma lane.
 * 面向宿主暴露的 Prisma lane 账户仓储集合。
 *
 * Represents the repository Ports that the API lane must satisfy to assemble
 * `createAccountModule` with laneCapability `api`. The closure-operation,
 * revocation, event-publisher and audit ports are required here because the
 * API lane coordinator is fail-fast when they are missing.
 *
 * 表示 API lane 装配 `createAccountModule`（laneCapability 为 `api`）所需满足的仓储 Port。
 * closure-operation、revocation、event-publisher 与 audit 在此处为必需，
 * 因为 API lane 缺少这些依赖时 coordinator 会 fail-fast。
 *
 * `CloudAuthLike` is the host-owned cloud auth capability typed as a port;
 * it is consumed by the factory (to build the revocation adapter) but never
 * returned as part of the set.
 * `CloudAuthLike` 是宿主持有的、以 Port 形式类型化的 cloud auth 能力；
 * 它被工厂消费（用于构建 revocation 适配器），但不会作为集合字段返回。
 */
export interface AccountPrismaRepositorySet {
  readonly accountRepository: IAccountRepository;
  readonly closureOperationRepository: IAccountClosureOperationRepository;
  readonly revocationPort: CloudAuthRevocationPort;
  readonly eventPublisher: AccountClosureEventPublisher;
  readonly auditRepository: OperationAuditRepository;
}

export function createAccountPrismaRepository(db: PrismaClient) {
  return new PrismaAccountRepository(db);
}

/**
 * Creates Prisma-backed account repositories.
 * 创建基于 Prisma 的账户仓储。
 *
 * Host-level composition ingredient: selects the Prisma adapters and returns
 * the repository Port shape for the API lane. `cloudAuth` is the host-owned
 * typed port used to build the revocation adapter; when absent the adapter
 * falls back to direct Prisma session revocation.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回 API lane 的仓储 Port 形状。
 * `cloudAuth` 是宿主持有的类型化 Port，用于构建 revocation 适配器；
 * 缺省时适配器回退到直接使用 Prisma 撤销会话。
 *
 * @param deps - Factory inputs: the Prisma client and the optional cloud auth port.
 *               工厂输入：Prisma client 与可选的 cloud auth Port。
 * @returns Repository set backed by the Prisma adapters.
 *          返回基于 Prisma 适配器的仓储集合。
 */
export function createAccountPrismaRepositories(deps: {
  readonly db: PrismaClient;
  readonly clock: Clock;
  readonly cloudAuth?: CloudAuthLike;
}): AccountPrismaRepositorySet {
  return {
    accountRepository: createAccountPrismaRepository(deps.db),
    closureOperationRepository: new PrismaAccountClosureOperationRepository(deps.db),
    revocationPort: new PrismaCloudAuthRevocationAdapter(deps.db, deps.clock, deps.cloudAuth),
    eventPublisher: new AccountClosureOutboxEventPublisher(deps.db),
    auditRepository: new PrismaOperationAuditRepository(deps.db),
  };
}

export function createAccountPrismaModule(
  db: PrismaClient,
  options: CreateAccountPrismaModuleOptions,
): AccountModuleInstance {
  const repositories = createAccountPrismaRepositories({
    db,
    clock: options.clock,
    cloudAuth: options.cloudAuth,
  });

  return createAccountModule({
    accountRepository: repositories.accountRepository,
    clock: options.clock,
    closureOperationRepository:
      options.closureOperationRepository ?? repositories.closureOperationRepository,
    revocationPort: options.revocationPort ?? repositories.revocationPort,
    eventPublisher: options.eventPublisher ?? repositories.eventPublisher,
    laneCapability: 'api',
    runtimeContributions: createAccountRuntimeContributions(
      repositories.accountRepository,
      options.runtimeContributions,
    ),
    auditRepository: repositories.auditRepository,
  });
}
