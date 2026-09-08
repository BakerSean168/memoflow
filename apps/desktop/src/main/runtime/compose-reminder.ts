/**
 * Reminder Electron composition root — desktop lane host runtime.
 * 提醒 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for reminder. The desktop main
 * runtime owns the per-profile PowerSync database (IElectronDatabase), so it
 * selects the PowerSync persistence adapters, assembles the transport-neutral
 * `ReminderModuleInstance` (the desktop fail-closed closure checker built from
 * the profile DB is passed explicitly), and turns it into an already-bound
 * `IElectronModule`-compatible handle via `createReminderElectronModule`. It
 * also returns the schedule execution/projection sources built from the SAME
 * repository set so schedule orchestration shares one set.
 *
 * 这是提醒在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择 PowerSync 持久化适配器、
 * 装配与传输无关的 `ReminderModuleInstance`（基于 profile DB 构建的桌面
 * fail-closed closure checker 显式传入），再通过 `createReminderElectronModule`
 * 变成已绑定 instance 的、兼容 `IElectronModule` 的 module handle。它还返回从
 * 同一仓储集合构建的 schedule execution/projection sources，使 schedule 编排共享
 * 一套集合。
 *
 * The desktop lane delegates to the canonical PowerSync convenience assembly
 * (`createReminderPowerSyncRepositories` + `createReminderModule`), preserving
 * the historical electron entry behavior exactly: the module owns no extra
 * snooze/reliable/audit runtime (the Prisma lane's snooze rescheduler has no
 * PowerSync counterpart in this package).
 *
 * 桌面 lane 委托给规范化的 PowerSync 便捷装配（`createReminderPowerSyncRepositories`
 * + `createReminderModule`），与历史 electron 入口行为完全一致：模块不自带额外的
 * snooze/reliable/audit runtime（Prisma lane 的 snooze rescheduler 在本包中没有
 * PowerSync 对应实现）。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → reminder PowerSync module
 * (repository set + closure checker) → schedule execution / projection sources
 * built from the SAME repository set → reminder instance → Electron module.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 提醒 PowerSync 模块（仓储集合 +
 * closure checker）→ 从同一仓储集合构建的 schedule execution / projection sources
 * → reminder instance → Electron module。
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { NotificationRequestedWriterPort } from '@memoflow/notification';
import {
  createReminderModule,
  createReminderPowerSyncRepositories,
  createReminderPowerSyncScheduleExecutionCommitPort,
  createReminderScheduleExecutionSource,
  createReminderScheduleProjectionSource,
  loadPowerSyncRoutineLocalRegistrations,
  type ReminderApplicationPort,
  type IReminderTemplateRepository,
  type ReminderScheduleExecutionSource,
  type ReminderScheduleProjectionSource,
} from '@memoflow/reminder';
import {
  createReminderElectronModule,
  type ReminderElectronModuleDef,
} from '@memoflow/reminder/electron';
import {
  createInterventionRuntime,
  createActiveUsageRuntime,
  createRoutineActivitySensorRuntime,
  createProtocolBreakCreditRuntime,
  type ProtocolBreakCreditRuntime,
  type InterventionPolicy,
  type InterventionRuntime,
  type AmbientBreakCreditRegistration,
  type ActiveUsageRuntime,
  type ActiveUsageRoutineRegistration,
  type RoutineActivitySensorRuntime,
  createRoutineCoachCommandService,
  createRoutineOverrideChangedNotifier,
  type RoutineCoachCommandPort,
} from '@memoflow/reminder/routine-runtime';
import type { IdleSensorPort } from '@memoflow/reminder/routine-runtime';
import { WindowsIdleSensorAdapter } from '../modules/routine/windows-idle-sensor.adapter';

/**
 * Dependencies the reminder composer needs from the desktop host runtime.
 * 提醒 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeReminderDesktopDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  /** Active profile owner used to project only this tenant's local Routine lanes. */
  readonly identityId: string;
  /** Reminder-owned durable NotificationRequested writer; Scheduler never receives it. */
  readonly notificationRequestedWriter: NotificationRequestedWriterPort;
  /** Optional per-profile sink for protocol break completion credit. */
  readonly protocolBreakCreditRuntime?: ProtocolBreakCreditRuntime;
  readonly idleSensor?: IdleSensorPort;
  readonly protocolBreakRegistrations?: readonly AmbientBreakCreditRegistration[];
  /** Presentation escalation timing only; method configuration will replace this default in ROUTINE-5301/5302. */
  readonly interventionPolicy?: InterventionPolicy;
}

const DEFAULT_DESKTOP_INTERVENTION_POLICY: InterventionPolicy = {
  gentleDurationMs: 2 * 60_000,
  graceDurationMs: 3 * 60_000,
  guidedDurationMs: 5 * 60_000,
  strictEnabled: false,
};

/**
 * Composed reminder surface for the desktop host.
 * 提醒在 desktop 宿主的组装结果。
 */
export interface ComposedReminderDesktop {
  /** Already-bound IElectronModule-compatible handle. 已绑定的 IElectronModule 兼容 handle。 */
  readonly module: ReminderElectronModuleDef;
  /** Canonical transport-neutral application port from the SAME module instance. */
  readonly applicationPort: ReminderApplicationPort;
  /** Routine Coach owner-domain command seam for approved AI/product orchestration. */
  readonly routineCommandPort: RoutineCoachCommandPort;
  /** Repository view exposed to sibling modules (dashboard). 暴露给兄弟模块（dashboard）的仓储视图。 */
  readonly repositories: { readonly reminderTemplateRepository: IReminderTemplateRepository };
  /** Schedule execution source built from the SAME repository set. 从同一仓储集合构建的 schedule execution source。 */
  readonly scheduleExecutionSource: ReminderScheduleExecutionSource;
  /** Schedule projection source built from the SAME repository set. 从同一仓储集合构建的 schedule projection source。 */
  readonly scheduleProjectionSource: ReminderScheduleProjectionSource;
  /** Per-profile local Routine intervention truth shared by occurrence coordinators and InterventionWindow. */
  readonly interventionRuntime: InterventionRuntime;
  readonly protocolBreakCreditRuntime: ProtocolBreakCreditRuntime;
  /** Per-profile activity sensor runtime and active-usage truth. */
  readonly activityRuntime: RoutineActivitySensorRuntime;
  readonly activeUsageRuntime: ActiveUsageRuntime;
  /** Register one ActiveUsage routine and optional explicit protocol-break compatibility. */
  readonly registerActiveUsageRoutine: (input: {
    readonly activeUsage: ActiveUsageRoutineRegistration;
    readonly credit?: AmbientBreakCreditRegistration | null;
  }) => void;
  /** Compatibility name retained for the ROUTINE-4203 composition seam. */
  readonly registerProtocolBreakRoutine: (input: {
    readonly credit: AmbientBreakCreditRegistration;
    readonly activeUsage: ActiveUsageRoutineRegistration;
  }) => void;
  /** Reload durable vNext RoutineDefinition/Profile/Membership state for this profile. */
  readonly refreshLocalRoutineRegistrations: () => Promise<void>;
}

/**
 * Composes the reminder Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装提醒 Electron module handle。
 *
 * Wire order:
 * 1. createReminderPowerSyncRepositories(db) — select the PowerSync adapters
 *    (four domain repositories + the desktop fail-closed closure checker).
 * 2. createReminderModule({ ...repositories, closureChecker }) — assemble the
 *    transport-neutral reminder instance (same assembly as the historical
 *    createReminderPowerSyncModule convenience root).
 * 3. createReminderScheduleExecutionSource({ reminderTemplateRepository }) and
 *    createReminderScheduleProjectionSource({ reminderTemplateRepository }) —
 *    build the schedule sources from the SAME repository set (consumed by
 *    schedule orchestration).
 * 4. createReminderElectronModule({ instance }) — bind the instance to an
 *    IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createReminderPowerSyncRepositories(db) —— 选择 PowerSync 适配器（四个领域
 *    仓储 + 桌面 fail-closed closure checker）。
 * 2. createReminderModule({ ...repositories, closureChecker }) —— 装配与传输无关的
 *    提醒实例（与历史 createReminderPowerSyncModule 便捷根同一装配）。
 * 3. createReminderScheduleExecutionSource({ reminderTemplateRepository }) 与
 *    createReminderScheduleProjectionSource({ reminderTemplateRepository })
 *    —— 从同一仓储集合构建 schedule sources（供 schedule 编排消费）。
 * 4. createReminderElectronModule({ instance }) —— 把实例绑定到 IElectronModule
 *    handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once (Reminder register is async and awaited), and its
 * destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次
 * （Reminder register 是异步的并会被 await），其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeReminderDesktopDependencies with the runtime Electron database.
 * @returns ComposedReminderDesktop — the bound module handle, repository view and schedule sources.
 */
export function composeReminder(
  dependencies: ComposeReminderDesktopDependencies,
): ComposedReminderDesktop {
  const repositories = createReminderPowerSyncRepositories(dependencies.db);

  const routineCommandPort = createRoutineCoachCommandService({
    routineProfileStore: repositories.routineProfileStore,
    temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
    protocolSessionStore: repositories.protocolSessionStore,
    onOverrideChanged: createRoutineOverrideChangedNotifier(),
  });

  const instance = createReminderModule({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
    reminderGroupRepository: repositories.reminderGroupRepository,
    reminderResponseRepository: repositories.reminderResponseRepository,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
    routineProfileStore: repositories.routineProfileStore,
    closureChecker: repositories.closureChecker,
  });

  const reminderTemplateRepository = repositories.reminderTemplateRepository;
  const scheduleExecutionSource = createReminderScheduleExecutionSource({
    reminderTemplateRepository,
    commitPort: createReminderPowerSyncScheduleExecutionCommitPort(
      dependencies.db,
      dependencies.notificationRequestedWriter,
    ),
  });
  const scheduleProjectionSource = createReminderScheduleProjectionSource({
    reminderTemplateRepository,
    routineProfileStore: repositories.routineProfileStore,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
  });

  const interventionRuntime = createInterventionRuntime();
  const interventionPolicy = {
    ...DEFAULT_DESKTOP_INTERVENTION_POLICY,
    ...(dependencies.interventionPolicy ?? {}),
  };
  const completeInterventionNaturally = (occurrenceKey: string, at: number): void => {
    if (!interventionRuntime.getSnapshot(occurrenceKey)) return;
    interventionRuntime.execute(occurrenceKey, { action: 'natural-stop', at });
  };
  const idleSensor =
    dependencies.idleSensor ?? new WindowsIdleSensorAdapter({ idleThresholdMs: 5 * 60_000 });
  const activityRuntime = createRoutineActivitySensorRuntime({
    idleSensor,
    idleThresholdMs: 5 * 60_000,
  });
  const activeUsageRuntime = createActiveUsageRuntime({
    activitySensor: activityRuntime,
    onOccurrenceDue: (event) => {
      interventionRuntime.createDue({
        identityId: event.identityId,
        routineId: event.routineId,
        occurrenceKey: event.occurrenceKey,
        dueAt: event.dueAt,
        policy: interventionPolicy,
      });
    },
    onNaturalBreakSatisfied: (event) => {
      completeInterventionNaturally(event.occurrenceKey, Number(event.satisfiedAt));
    },
  });
  const protocolBreakCreditRuntime =
    dependencies.protocolBreakCreditRuntime ??
    createProtocolBreakCreditRuntime({
      activeUsage: activeUsageRuntime,
      registrations: dependencies.protocolBreakRegistrations ?? [],
      onRoutineSatisfied: (entry) => {
        completeInterventionNaturally(entry.activeUsage.occurrenceKey, Number(entry.satisfiedAt));
      },
    });
  const locallyRegisteredRoutineIds = new Set<string>();
  const registerActiveUsageRoutine = (input: {
    readonly activeUsage: ActiveUsageRoutineRegistration;
    readonly credit?: AmbientBreakCreditRegistration | null;
  }): void => {
    if (input.credit) {
      if (!protocolBreakCreditRuntime.register) {
        throw new TypeError('Protocol break credit runtime does not support registration');
      }
      protocolBreakCreditRuntime.register(input.credit);
    }
    try {
      activeUsageRuntime.registerRoutine(input.activeUsage);
    } catch (error) {
      if (input.credit) {
        protocolBreakCreditRuntime.unregister?.(input.credit.identityId, input.credit.routineId);
      }
      throw error;
    }
  };
  const registerProtocolBreakRoutine = (input: {
    readonly credit: AmbientBreakCreditRegistration;
    readonly activeUsage: ActiveUsageRoutineRegistration;
  }): void => registerActiveUsageRoutine(input);
  const refreshLocalRoutineRegistrations = async (): Promise<void> => {
    const snapshot = await loadPowerSyncRoutineLocalRegistrations(
      dependencies.db,
      dependencies.identityId,
    );
    for (const routineId of locallyRegisteredRoutineIds) {
      activeUsageRuntime.unregisterRoutine(dependencies.identityId, routineId);
      protocolBreakCreditRuntime.unregister?.(dependencies.identityId, routineId);
    }
    locallyRegisteredRoutineIds.clear();
    const credits = new Map(
      snapshot.protocolBreakCredits.map((credit) => [credit.routineId, credit] as const),
    );
    for (const activeUsage of snapshot.activeUsage) {
      registerActiveUsageRoutine({
        activeUsage,
        credit: credits.get(activeUsage.routineId) ?? null,
      });
      locallyRegisteredRoutineIds.add(activeUsage.routineId);
    }
  };

  return {
    module: createReminderElectronModule({ instance }),
    applicationPort: instance.api,
    routineCommandPort,
    repositories: { reminderTemplateRepository },
    scheduleExecutionSource,
    scheduleProjectionSource,
    interventionRuntime,
    protocolBreakCreditRuntime,
    activityRuntime,
    activeUsageRuntime,
    registerActiveUsageRoutine,
    registerProtocolBreakRoutine,
    refreshLocalRoutineRegistrations,
  };
}
