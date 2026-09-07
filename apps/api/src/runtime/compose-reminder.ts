/**
 * Reminder API composition root — API lane host runtime.
 * 提醒 API 组合根 —— API lane 宿主运行时。
 *
 * ROUTINE-3402 cutover: the API host no longer wires the legacy Reminder cron.
 * ReminderTemplate wall-clock work is projected into the shared Scheduler and
 * executed through schedule orchestration, so Scheduler is the sole production
 * timing authority. The retired Reminder cron and its due-set shadow diagnostic
 * are physically removed; no compatibility timing runtime remains.
 *
 * The host still owns the Prisma connection and closure checker, builds exactly
 * one Reminder repository set, assembles the transport-neutral module, and then
 * derives schedule execution/projection sources from that SAME repository set.
 * Optional host runtime contributions are preserved, but no implicit timing
 * runtime is injected here.
 */

import type { PrismaClient } from '@memoflow/database';
import type { NotificationRequestedWriterPort } from '@memoflow/notification';
import {
  createReminderModule,
  createReminderPrismaRepositories,
  createReminderPrismaScheduleExecutionCommitPort,
  createReminderScheduleExecutionSource,
  createReminderScheduleProjectionSource,
  createReminderUseCases,
  type ReminderModuleRuntimeContribution,
  type ReminderRuntimeContributionsInput,
  type IReminderTemplateRepository,
} from '@memoflow/reminder';
import { createReminderApiModule, type ReminderApiModuleDef } from '@memoflow/reminder/api';
import type { ReminderScheduleExecutionSource } from '@memoflow/reminder';
import type { ReminderScheduleProjectionSource } from '@memoflow/reminder';
import type { ReminderApplicationPort } from '@memoflow/reminder';

/**
 * Dependencies the reminder composer needs from the API host runtime.
 * 提醒 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeReminderDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
  /** Reminder-owned durable NotificationRequested writer; Scheduler never receives it. */
  readonly notificationRequestedWriter: NotificationRequestedWriterPort;
  /** Host-owned account-active checker (fail-closed for closed accounts). 宿主持有的账户激活检查器（对已关闭账户 fail-closed）。 */
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  /**
   * Optional executor-visible closure checker. When provided, the composed
   * result exposes `executorReminderPort`, whose `createTemplate` uses this
   * frozen merge-base predicate (account status + requested|revoking|closing
   * phases) instead of the module's account-active checker. The AI executor
   * path MUST receive this predicate, not the module checker.
   *
   * 可选的 executor 可见闭户检查器。提供后，组装结果暴露 `executorReminderPort`，
   * 其 `createTemplate` 使用该冻结的 merge-base 谓词（账户状态 +
   * requested|revoking|closing 阶段），而非模块的账户激活检查器。AI executor
   * 路径必须收到该谓词，而不是模块检查器。
   */
  readonly executorClosureChecker?: (identityId: string) => Promise<boolean>;
  /** Extra runtime contributions from the host. 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: ReminderRuntimeContributionsInput;
}

/**
 * Build the host-owned executor closure predicate frozen from merge-base.
 * 构建从 merge-base 冻结的、宿主持有的 executor 闭户谓词。
 *
 * Blocks when the account row is missing / `Deactivated` / `Closed`, or when an
 * active account-closure operation exists in phases `requested` | `revoking` |
 * `closing`. A `revoked` / `closed` operation alone does NOT block, and the
 * account status is always inspected first — exactly the predicate the
 * merge-base executor passed to its own reminder module. It is restored here
 * so the AI executor path keeps the pre-RefArch behavior while sharing the
 * single composed reminder instance.
 *
 * 账户缺失 / `Deactivated` / `Closed` 时阻断；或存在处于 `requested` | `revoking`
 * | `closing` 阶段的有效闭户操作时阻断。单独的 `revoked` / `closed` 操作不阻断，
 * 且始终先检查账户状态——这正是 merge-base 时代 executor 传给其自建提醒模块的
 * 谓词。在此恢复，使 AI executor 路径在共享单一组合提醒实例的同时保持
 * RefArch 之前的既有行为。
 *
 * @param db - API host-owned Prisma client. API 宿主持有的 Prisma client。
 * @returns An async predicate returning true to block new reminder work. 返回 true 表示阻断新提醒工作的异步谓词。
 */
export function createExecutorClosureChecker(
  db: PrismaClient,
): (identityId: string) => Promise<boolean> {
  return async (identityId: string): Promise<boolean> => {
    const account = await db.account.findUnique({
      where: { id: identityId },
      select: { status: true },
    });
    if (!account || account.status === 'Deactivated' || account.status === 'Closed') {
      return true;
    }
    const pendingClosure = await db.accountClosureOperation.findFirst({
      where: {
        identityId,
        phase: { in: ['requested', 'revoking', 'closing'] },
      },
    });
    return pendingClosure !== null;
  };
}

/**
 * Composed reminder surface for the API host.
 * 提醒在 API 宿主的组装结果。
 */
export interface ComposedReminder {
  /** Already-bound IApiModule-compatible handle. 已绑定的 IApiModule 兼容 handle。 */
  readonly module: ReminderApiModuleDef;
  /** The transport-neutral application port (`instance.api`) for sibling modules to orchestrate. 供兄弟模块编排的与传输无关 application port（`instance.api`）。 */
  readonly applicationPort: ReminderApplicationPort;
  /**
   * The application port the AI executor must consume: its `createTemplate`
   * uses the frozen merge-base closure predicate when `executorClosureChecker`
   * is provided, otherwise it is the same object as `applicationPort`.
   * 供 AI executor 消费的 application port：提供 `executorClosureChecker` 时其
   * `createTemplate` 使用冻结的 merge-base 闭户谓词，否则与 `applicationPort`
   * 是同一对象。
   */
  readonly executorReminderPort: ReminderApplicationPort;
  /** Repository views exposed to sibling modules in the same host. 暴露给同一宿主内兄弟模块的仓储视图。 */
  readonly repositories: { readonly reminderTemplateRepository: IReminderTemplateRepository };
  /** Schedule execution source built from the SAME repository set. 从同一仓储集合构建的 schedule execution source。 */
  readonly scheduleExecutionSource: ReminderScheduleExecutionSource;
  /** Schedule projection source built from the SAME repository set. 从同一仓储集合构建的 schedule projection source。 */
  readonly scheduleProjectionSource: ReminderScheduleProjectionSource;
}

function normalizeRuntimeContributions(
  runtimeContributions?: ReminderRuntimeContributionsInput,
): readonly ReminderModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }
  return Array.isArray(runtimeContributions)
    ? Array.from(runtimeContributions)
    : [runtimeContributions as ReminderModuleRuntimeContribution];
}

/**
 * Composes the reminder API module handle from the API runtime's Prisma client.
 *
 * ROUTINE-3402 wire order:
 * 1. createReminderPrismaRepositories(db)
 * 2. createReminderModule(..., runtimeContributions: hostOnly)
 * 3. createReminderScheduleExecutionSource / createReminderScheduleProjectionSource
 * 4. createReminderApiModule({ instance })
 *
 * No legacy trigger cron is created or started here. Scheduler owns wall-clock
 * wakeups; Reminder remains the business/source boundary.
 */
export function composeReminder(dependencies: ComposeReminderDependencies): ComposedReminder {
  const repositories = createReminderPrismaRepositories(dependencies.db);

  const instance = createReminderModule({
    reminderTemplateRepository: repositories.reminderTemplateRepository,
    reminderGroupRepository: repositories.reminderGroupRepository,
    reminderResponseRepository: repositories.reminderResponseRepository,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
    routineProfileStore: repositories.routineProfileStore,
    closureChecker: dependencies.closureChecker,
    reliablePort: repositories.reliablePort,
    snoozeOverrideWriter: repositories.snoozeOverrideWriter,
    auditRepository: repositories.auditRepository,
    runtimeContributions: normalizeRuntimeContributions(dependencies.runtimeContributions),
  });

  const reminderTemplateRepository = instance.reminderTemplateRepository;
  const scheduleExecutionSource = createReminderScheduleExecutionSource({
    reminderTemplateRepository,
    commitPort: createReminderPrismaScheduleExecutionCommitPort(
      dependencies.db,
      dependencies.notificationRequestedWriter,
    ),
  });
  const scheduleProjectionSource = createReminderScheduleProjectionSource({
    reminderTemplateRepository,
    routineProfileStore: repositories.routineProfileStore,
    userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
  });

  // Executor-visible closure path: when the host supplies the frozen
  // merge-base predicate, expose a port whose createTemplate runs through a
  // use case carrying that predicate (sharing the SAME repositories as the
  // single module instance). All other methods delegate to instance.api.
  // Without an executor checker the executor port is simply the module api.
  //
  // Executor 可见的闭户路径：宿主提供冻结的 merge-base 谓词时，暴露一个
  // createTemplate 走该谓词 use case 的 port（与单一模块实例共享同一套仓储）。
  // 其余方法全部委托给 instance.api；未提供 executor 检查器时该 port 即模块 api。
  const executorUseCases =
    dependencies.executorClosureChecker === undefined
      ? null
      : createReminderUseCases({
          reminderTemplateRepository: repositories.reminderTemplateRepository,
          reminderGroupRepository: repositories.reminderGroupRepository,
          reminderResponseRepository: repositories.reminderResponseRepository,
          userReminderPreferenceRepository: repositories.userReminderPreferenceRepository,
          routineProfileStore: repositories.routineProfileStore,
          closureChecker: dependencies.executorClosureChecker,
        });

  const executorReminderPort: ReminderApplicationPort =
    executorUseCases === null
      ? instance.api
      : {
          ...instance.api,
          createTemplate: (data, ctx) => executorUseCases.createReminderTemplate.execute(data, ctx),
        };

  return {
    module: createReminderApiModule({ instance }),
    applicationPort: instance.api,
    executorReminderPort,
    repositories: { reminderTemplateRepository },
    scheduleExecutionSource,
    scheduleProjectionSource,
  };
}
