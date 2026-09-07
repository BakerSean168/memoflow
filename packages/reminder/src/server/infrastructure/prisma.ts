/**
 * Reminder Prisma Composition Helpers
 * 提醒模块 Prisma 组合辅助函数
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
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import {
  createReminderModule,
  type ReminderModuleInstance,
  type ReminderModuleRuntimeContribution,
} from './reminder.module';
import { createReminderScheduleExecutionSource } from './schedule-execution-source';
import { createReminderScheduleProjectionSource } from './schedule-projection-source';
import { createReminderSnoozeReschedulerPrisma } from './reminder-snooze-rescheduler.prisma';
import { ReminderScheduleExecutionPrismaCommitAdapter } from './adapters/prisma/reminder-schedule-execution-commit.prisma.adapter';
import {
  ReminderTemplatePrismaRepository,
  ReminderGroupPrismaRepository,
  ReminderResponsePrismaRepository,
  UserReminderPreferencePrismaRepository,
  ReminderReliableOperationPrismaAdapter,
  PrismaReminderWriteTransactionRunner,
} from './adapters/prisma';
import type { ReminderScheduleExecutionSource } from '../../schedule-execution';
import type { ReminderScheduleExecutionCommitPort } from './schedule-execution-commit.port';
import type { ReminderScheduleProjectionSource } from '../../schedule-projection';
import { PrismaOperationAuditRepository } from '@memoflow/patterns/operations';
import { PrismaRoutineProfileStore } from './routine-vnext/routine-profile-store.prisma';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import type { ReminderReliableOperationPort } from '@memoflow/contracts/reliable-messaging';
import type { ReminderTransactionRunner } from '../domain/ports/reminder-transaction-runner.port';
import type { ReminderSnoozeRescheduler } from '../application/use-cases/commands/record-reminder-response.use-case';
import type {
  IReminderTemplateRepository,
  IReminderGroupRepository,
  IReminderResponseRepository,
  IUserReminderPreferenceRepository,
  RoutineProfileStore,
} from '../domain';

export interface CreateReminderPrismaModuleOptions {
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly runtimeContributions?:
    ReminderModuleRuntimeContribution | readonly ReminderModuleRuntimeContribution[];
}

/**
 * Host-facing reminder repository set for the Prisma lane.
 * 面向宿主暴露的 Prisma lane 提醒仓储集合。
 *
 * Contains the four domain repositories plus the reliable-operation port and
 * the transaction runner used by the module-owned cron/snooze runtime.
 * `closureChecker` is intentionally NOT part of the set: it is a host-owned
 * port passed explicitly to `createReminderPrismaModule`.
 *
 * 包含四个领域仓储，以及模块自有 cron/snooze runtime 使用的可靠操作端口、事务运行器、
 * snooze rescheduler 与操作审计仓储。`closureChecker` 刻意不在此列：它是宿主持有的
 * Port，由调用方显式传给 `createReminderPrismaModule`。
 */
export interface ReminderPrismaRepositorySet {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderGroupRepository: IReminderGroupRepository;
  readonly reminderResponseRepository: IReminderResponseRepository;
  readonly userReminderPreferenceRepository: IUserReminderPreferenceRepository;
  readonly routineProfileStore: RoutineProfileStore;
  readonly reliablePort: ReminderReliableOperationPort;
  readonly transactionRunner: ReminderTransactionRunner;
  /** R3c：snooze 作为真 command——推迟 reminder 对应 schedule task 的下次触发。 */
  readonly snoozeRescheduler: ReminderSnoozeRescheduler;
  /** W7：统一 operation timeline / replay / audit。 */
  readonly auditRepository: OperationAuditRepository;
}

/**
 * Create a fully-wired reminder module backed by Prisma repositories.
 * 创建基于 Prisma 仓储的完整提醒模块。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createReminderPrismaRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createReminderPrismaRepositories() 与规范化模块装配。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param options - Host wiring options: the required closure checker and optional runtime contributions.
 *                  宿主接线选项：必需的 closure checker 与可选运行时贡献。
 * @returns ReminderModuleInstance with Prisma-backed repositories attached.
 *          返回挂载 Prisma 仓储的提醒模块实例。
 */
export function createReminderPrismaModule(
  db: PrismaClient,
  options: CreateReminderPrismaModuleOptions,
): ReminderModuleInstance {
  if (!options?.closureChecker) {
    throw new Error('[FAIL-CLOSED] createReminderPrismaModule requires options.closureChecker');
  }

  const repositories = createReminderPrismaRepositories(db);

  return createReminderModule({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
    reminderGroupRepository: repositories.reminderGroupRepository,
    reminderResponseRepository: repositories.reminderResponseRepository,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
    routineProfileStore: repositories.routineProfileStore,
    closureChecker: options.closureChecker,
    runtimeContributions: options.runtimeContributions,
    snoozeRescheduler: repositories.snoozeRescheduler,
    reliablePort: repositories.reliablePort,
    auditRepository: repositories.auditRepository,
  });
}

/**
 * Create standalone reminder Prisma repositories.
 * 创建独立的提醒 Prisma 仓储。
 * Useful for cross-module wiring (e.g., schedule source executor).
 *
 * Host-level composition ingredient: selects the Prisma adapters and returns
 * the repository Port shape for the API lane.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回 API lane 的仓储 Port 形状，
 * 供跨模块接线（如 schedule source executor）使用。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @returns Repository set backed by the Prisma adapters.
 *          返回基于 Prisma 适配器的仓储集合。
 */
export function createReminderPrismaRepositories(db: PrismaClient): ReminderPrismaRepositorySet {
  return {
    reminderTemplateRepository: new ReminderTemplatePrismaRepository(db),
    reminderGroupRepository: new ReminderGroupPrismaRepository(db),
    reminderResponseRepository: new ReminderResponsePrismaRepository(db),
    userReminderPreferenceRepository: new UserReminderPreferencePrismaRepository(db),
    routineProfileStore: new PrismaRoutineProfileStore(db),
    reliablePort: new ReminderReliableOperationPrismaAdapter(db),
    transactionRunner: new PrismaReminderWriteTransactionRunner(db),
    snoozeRescheduler: createReminderSnoozeReschedulerPrisma(db),
    auditRepository: new PrismaOperationAuditRepository(db),
  };
}

export function createReminderPrismaScheduleProjectionSource(
  db: PrismaClient,
): ReminderScheduleProjectionSource {
  const repositories = createReminderPrismaRepositories(db);

  return createReminderScheduleProjectionSource({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
  });
}

export function createReminderPrismaScheduleExecutionCommitPort(
  db: PrismaClient,
  requestedWriter: NotificationRequestedWriterPort,
): ReminderScheduleExecutionCommitPort {
  return new ReminderScheduleExecutionPrismaCommitAdapter(db, requestedWriter);
}

export function createReminderPrismaScheduleExecutionSource(
  db: PrismaClient,
  requestedWriter: NotificationRequestedWriterPort,
): ReminderScheduleExecutionSource {
  const repositories = createReminderPrismaRepositories(db);

  return createReminderScheduleExecutionSource({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
    commitPort: createReminderPrismaScheduleExecutionCommitPort(db, requestedWriter),
  });
}
