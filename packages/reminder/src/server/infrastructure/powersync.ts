/**
 * Reminder PowerSync Module Factory.
 * 提醒模块 PowerSync 工厂。
 *
 * Host-facing ingredient seams for the Electron lane: the repository set type,
 * the repository factory and the delegating convenience module factory.
 *
 * 面向宿主的 Electron lane 组合原料：仓储集合类型、仓储工厂与委托式便捷模块工厂。
 */

import {
  createReminderModule,
  type ReminderModuleInstance,
  type ReminderRuntimeContributionsInput,
} from './reminder.module';
import { createReminderScheduleExecutionSource } from './schedule-execution-source';
import { createReminderScheduleProjectionSource } from './schedule-projection-source';
import {
  ReminderTemplatePowerSyncRepository,
  ReminderGroupPowerSyncRepository,
  ReminderResponsePowerSyncRepository,
  UserReminderPreferencePowerSyncRepository,
} from './adapters/powersync';
import { PowerSyncRoutineProfileStore } from './routine-vnext/routine-profile-store.powersync';
import { PowerSyncProtocolSessionStore } from './routine-vnext/protocol-session-store.powersync';
import { PowerSyncRoutineTemporaryOverrideStore } from './routine-schedule/routine-temporary-override-store.powersync';
import { ReminderScheduleExecutionPowerSyncCommitAdapter } from './adapters/powersync/reminder-schedule-execution-commit.powersync.adapter';
import type { ReminderScheduleExecutionSource } from '../../schedule-execution';
import type { ReminderScheduleExecutionCommitPort } from './schedule-execution-commit.port';
import type { ReminderScheduleProjectionSource } from '../../schedule-projection';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { UserTimeContextPort } from '@memoflow/time';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import type {
  IReminderTemplateRepository,
  IReminderGroupRepository,
  IReminderResponseRepository,
  IUserReminderPreferenceRepository,
  RoutineProfileStore,
  ProtocolSessionStore,
  RoutineTemporaryOverrideStore,
} from '../domain';

type Queryable = IElectronDatabase;

/**
 * Desktop PowerSync closure gate: fails closed when (a) the local Account row is
 * missing / not Active, or (b) a local closure-request marker exists — i.e. the
 * user initiated cloud close and the remote saga is in requested/revoking while
 * the remote Account row is still Active. Blocks local new-work entrypoints
 * (AI / scheduler / use-cases) the moment the close request starts.
 *
 * 桌面 PowerSync closure 闸门：当 (a) 本地 Account 行缺失 / 非 Active，或
 * (b) 存在本地 closure-request 标记（用户发起云端关闭且远程 saga 处于
 * requested/revoking 窗口）时 fail closed。在关闭请求开始的同时阻断本地新工作入口。
 */
export function createPowerSyncClosureChecker(
  db: Queryable,
): (identityId: string) => Promise<boolean> {
  return async (identityId: string): Promise<boolean> => {
    try {
      const row = await db.getOptional<{ status: string }>(
        'SELECT status FROM accounts WHERE id = ? LIMIT 1',
        [identityId],
      );
      if (!row || row.status !== 'Active') {
        return true;
      }
      const marker = await db.getOptional<{ identity_id: string }>(
        'SELECT identity_id FROM account_closure_requested WHERE identity_id = ? LIMIT 1',
        [identityId],
      );
      return marker !== null;
    } catch {
      return true; // fail-closed on query failure
    }
  };
}

/**
 * Host-facing reminder repository set for the PowerSync lane.
 * 面向宿主暴露的 PowerSync lane 提醒仓储集合。
 *
 * Contains the four domain repositories plus the desktop fail-closed closure
 * checker built from the profile DB.
 *
 * 包含四个领域仓储，以及基于 profile DB 构建的桌面 fail-closed closure checker。
 */
export interface ReminderPowerSyncRepositorySet {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderGroupRepository: IReminderGroupRepository;
  readonly reminderResponseRepository: IReminderResponseRepository;
  readonly userReminderPreferenceRepository: IUserReminderPreferenceRepository;
  readonly routineProfileStore: RoutineProfileStore;
  readonly routineTemporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
}

/**
 * Creates PowerSync-backed reminder repositories.
 * 创建基于 PowerSync 的提醒仓储。
 *
 * Electron counterpart of createReminderPrismaRepositories(): selects the
 * PowerSync adapters and returns the repository Port shape, including the
 * desktop fail-closed closure checker.
 *
 * 与 createReminderPrismaRepositories() 对应的 Electron 版本：选择 PowerSync
 * 适配器并返回仓储 Port 形状，包含桌面 fail-closed closure checker。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @returns Repository set backed by the PowerSync adapters.
 *          返回基于 PowerSync 适配器的仓储集合。
 */
export function createReminderPowerSyncRepositories(db: Queryable): ReminderPowerSyncRepositorySet {
  return {
    reminderTemplateRepository: new ReminderTemplatePowerSyncRepository(db),
    reminderGroupRepository: new ReminderGroupPowerSyncRepository(db),
    reminderResponseRepository: new ReminderResponsePowerSyncRepository(db),
    userReminderPreferenceRepository: new UserReminderPreferencePowerSyncRepository(db),
    routineProfileStore: new PowerSyncRoutineProfileStore(db),
    routineTemporaryOverrideStore: new PowerSyncRoutineTemporaryOverrideStore(db),
    protocolSessionStore: new PowerSyncProtocolSessionStore(db),
    closureChecker: createPowerSyncClosureChecker(db),
  };
}

/**
 * Creates a ReminderModuleInstance backed by PowerSync repositories.
 * 创建一个由 PowerSync 仓储驱动的 ReminderModuleInstance。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createReminderPowerSyncRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createReminderPowerSyncRepositories() 与规范化模块装配。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @param runtimeContributions - Optional runtime side effects. 可选的运行时副作用。
 * @returns ReminderModuleInstance with PowerSync-backed repositories attached.
 *          返回挂载 PowerSync 仓储的提醒模块实例。
 */

export function createReminderPowerSyncModule(
  db: Queryable,
  options: {
    readonly userTimeContextPort: UserTimeContextPort;
    readonly runtimeContributions?: ReminderRuntimeContributionsInput;
  },
): ReminderModuleInstance {
  if (!options?.userTimeContextPort) {
    throw new Error('[FAIL-CLOSED] createReminderPowerSyncModule requires options.userTimeContextPort');
  }
  const repositories = createReminderPowerSyncRepositories(db);

  return createReminderModule({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
    reminderGroupRepository: repositories.reminderGroupRepository,
    reminderResponseRepository: repositories.reminderResponseRepository,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
    routineProfileStore: repositories.routineProfileStore,
    userTimeContextPort: options.userTimeContextPort,
    runtimeContributions: options.runtimeContributions,
    closureChecker: repositories.closureChecker,
  });
}

export function createReminderPowerSyncScheduleProjectionSource(
  db: Queryable,
): ReminderScheduleProjectionSource {
  const repositories = createReminderPowerSyncRepositories(db);
  return createReminderScheduleProjectionSource({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
    routineProfileStore: repositories.routineProfileStore,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
  });
}

export function createReminderPowerSyncScheduleExecutionCommitPort(
  db: IElectronDatabase,
  requestedWriter: NotificationRequestedWriterPort,
): ReminderScheduleExecutionCommitPort {
  return new ReminderScheduleExecutionPowerSyncCommitAdapter(db, requestedWriter);
}

export function createReminderPowerSyncScheduleExecutionSource(
  db: IElectronDatabase,
  requestedWriter: NotificationRequestedWriterPort,
): ReminderScheduleExecutionSource {
  return createReminderScheduleExecutionSource({
    reminderTemplateRepository: createReminderPowerSyncRepositories(db).reminderTemplateRepository,
    commitPort: createReminderPowerSyncScheduleExecutionCommitPort(db, requestedWriter),
  });
}

export {
  ReminderTemplatePowerSyncRepository,
  ReminderGroupPowerSyncRepository,
  ReminderResponsePowerSyncRepository,
  UserReminderPreferencePowerSyncRepository,
};
