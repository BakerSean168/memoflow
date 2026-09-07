import { createTypedEventSubscriber, eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import { ExecutionStatus, ScheduleTaskStatus } from '@memoflow/contracts/schedule';
import type { ScheduleEventMap } from '@memoflow/contracts/schedule';
import type { ScheduleTask } from '../../domain/aggregates/schedule-task';
import type { IScheduleTaskRepository } from '../../domain/repositories/i-schedule-task-repository';
import type {
  ScheduleTaskExecutionResult,
  ScheduleTaskSourceExecutor,
} from '../../application/source-executors/runtime-contract';
import {
  ScheduleTaskQueue,
  type ScheduledItem,
} from '../../application/scheduler/schedule-task-queue';
import { SCHEDULE_LEASE_KEY } from '../lease/schedule-lease-coordinator';
import type { SchedulerModuleRuntimeContribution } from '../scheduler.module';

const logger = createLogger('ScheduleRuntime');

export type { ScheduleTaskExecutionResult, ScheduleTaskSourceExecutor };

type SyncTaskEventName =
  | 'schedule:task-created'
  | 'schedule:task-schedule-updated'
  | 'schedule:task-resumed'
  | 'schedule:task-executed';

type RemoveTaskEventName =
  | 'schedule:task-paused'
  | 'schedule:task-completed'
  | 'schedule:task-cancelled'
  | 'schedule:task-failed'
  | 'schedule:task-deleted';

type ScheduleRuntimeEventMap = Pick<ScheduleEventMap, SyncTaskEventName | RemoveTaskEventName>;

const scheduleRuntimeEvents = createTypedEventSubscriber<ScheduleRuntimeEventMap>(eventBus);

export interface SchedulerRuntimeDependencies {
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly sourceExecutor: ScheduleTaskSourceExecutor;
  readonly shouldScheduleTask?: (task: ScheduleTask) => boolean | Promise<boolean>;
  /** R0-3：业务指标 recorder（可选）。 */
  readonly metrics?: import('@memoflow/patterns').BusinessMetricRecorder;
  /**
   * R3a：调度器宿主租约（可选）。提供时，start 先原子 acquire DB lease，
   * 失败则本宿主先作为读模型 standby，并周期重试 lease；原 owner 退出或
   * crash-leftover lease 到期后自动 promotion。无 repository 的 coordinator
   *（单宿主/测试）直接放行。
   */
  readonly leaseCoordinator?: import('../lease/schedule-lease-coordinator').ScheduleLeaseCoordinator;
  /** Standby host retry cadence after another scheduler owns the host lease. */
  readonly leaseRetryIntervalMs?: number;
}

function toScheduledItem(task: ScheduleTask): ScheduledItem | null {
  const nextRunAt = task.execution.nextRunAt;
  if (!task.enabled || task.status !== ScheduleTaskStatus.Active || nextRunAt === null) {
    return null;
  }

  return {
    taskId: task.id,
    taskName: task.name,
    identityId: String(task.identityId),
    cronExpression: task.schedule.cronExpression,
    timezone: task.schedule.timezone,
    nextRunAt,
    metadata: task.metadata.toDTO().payload,
  };
}

async function isTaskAllowed(
  task: ScheduleTask,
  predicate?: (task: ScheduleTask) => boolean | Promise<boolean>,
): Promise<boolean> {
  if (!predicate) {
    return true;
  }

  return await predicate(task);
}

async function loadTaskForRuntime(
  repository: IScheduleTaskRepository,
  taskId: string,
  identityId?: string | null,
): Promise<ScheduleTask | null> {
  if (identityId) {
    return repository.findByIdForIdentity(String(identityId), taskId);
  }

  const task = await repository.findById(taskId);
  if (!task) {
    return null;
  }

  // Defense in depth: once identity is known from the aggregate, re-load owned.
  return repository.findByIdForIdentity(String(task.identityId), taskId);
}

async function syncTask(
  repository: IScheduleTaskRepository,
  queue: ScheduleTaskQueue,
  taskId: string,
  shouldScheduleTask?: (task: ScheduleTask) => boolean | Promise<boolean>,
  identityId?: string | null,
): Promise<void> {
  const task = await loadTaskForRuntime(repository, taskId, identityId);
  if (!task) {
    queue.removeTask(taskId);
    return;
  }

  if (!(await isTaskAllowed(task, shouldScheduleTask))) {
    logger.info(
      '[Schedule] Removing task from queue because it does not match runtime auth scope',
      {
        taskId,
        taskName: task.name,
        identityId: String(task.identityId),
      },
    );
    queue.removeTask(taskId);
    return;
  }

  const item = toScheduledItem(task);
  if (!item) {
    logger.warn('[Schedule] Removing task from queue because it is no longer schedulable', {
      taskId,
      exists: true,
      status: task.status,
      enabled: task.enabled,
      nextRunAt: task.execution.nextRunAt,
    });
    queue.removeTask(taskId);
    return;
  }

  logger.info('[Schedule] Syncing task into queue', {
    taskId,
    taskName: task.name,
    sourceModule: task.sourceModule,
    sourceEntityId: task.sourceEntityId,
    nextRunAt: item.nextRunAt,
  });
  queue.addTask(item);
}

async function executeScheduledTask(
  repository: IScheduleTaskRepository,
  sourceExecutor: ScheduleTaskSourceExecutor,
  taskId: string,
  shouldScheduleTask?: (task: ScheduleTask) => boolean | Promise<boolean>,
  identityId?: string | null,
): Promise<void> {
  const task = await loadTaskForRuntime(repository, taskId, identityId);
  if (!task) {
    logger.warn('[Schedule] Scheduled execution skipped because task no longer exists', { taskId });
    return;
  }

  if (!(await isTaskAllowed(task, shouldScheduleTask))) {
    logger.info(
      '[Schedule] Scheduled execution skipped because task does not match runtime auth scope',
      {
        taskId,
        taskName: task.name,
        identityId: String(task.identityId),
      },
    );
    return;
  }

  const startedAt = Date.now();
  let status: (typeof ExecutionStatus)[keyof typeof ExecutionStatus] = ExecutionStatus.Success;
  let errorMessage: string | undefined;
  let result: Record<string, unknown> | undefined;
  let nextRunAt: number | null | undefined;
  let explicitlySkippedBySource = false;

  // R3b：原子 claim——共享 DB 的多个宿主并发出队同一任务时，
  // 只有先 claim 成功的宿主继续执行；另一宿主直接跳过。
  if (repository.claimForExecution && task.execution.nextRunAt !== null) {
    const claimed = await repository.claimForExecution(taskId, new Date(task.execution.nextRunAt));
    if (!claimed) {
      logger.info('[Schedule] Execution skipped: task already claimed by another host', {
        taskId,
        nextRunAt: task.execution.nextRunAt,
      });
      return;
    }
  }

  if (!task.execute()) {
    status = ExecutionStatus.Skipped;
    errorMessage = 'Task is not executable';
    nextRunAt = task.calculateNextRun();
    logger.warn('[Schedule] Task was dequeued but not executable', {
      taskId,
      taskName: task.name,
      status: task.status,
      enabled: task.enabled,
      nextRunAt,
    });
  } else {
    try {
      logger.info('[Schedule] Executing task via source executor', {
        taskId,
        taskName: task.name,
        sourceModule: task.sourceModule,
        sourceEntityId: task.sourceEntityId,
      });
      const executionResult = await sourceExecutor.execute(task);
      result = executionResult?.result;
      const disposition = executionResult?.disposition;
      if (disposition === 'skipped') {
        status = ExecutionStatus.Skipped;
        explicitlySkippedBySource = true;
        errorMessage = executionResult?.error ?? 'Scheduled handler skipped execution';
        nextRunAt = executionResult?.nextRunAt ?? null;
      } else if (disposition === 'failed' || disposition === 'dead_letter') {
        status = ExecutionStatus.Failed;
        errorMessage =
          executionResult?.error ??
          (disposition === 'dead_letter'
            ? 'Scheduled handler moved invocation to dead letter'
            : 'Scheduled handler failed');
        // Explicit terminal handler failures never enter the legacy retry path.
        nextRunAt = executionResult?.nextRunAt ?? null;
      } else {
        nextRunAt = executionResult?.nextRunAt ?? task.calculateNextRun();
      }
      logger.info('[Schedule] Source executor completed', {
        taskId,
        sourceModule: task.sourceModule,
        disposition: disposition ?? 'legacy-success',
        nextRunAt,
        result,
      });
    } catch (error) {
      status = ExecutionStatus.Failed;
      errorMessage = error instanceof Error ? error.message : String(error);
      nextRunAt = task.shouldRetry()
        ? Date.now() + task.calculateNextRetryDelay()
        : task.calculateNextRun();
      logger.error('[Schedule] Source executor failed', {
        taskId,
        sourceModule: task.sourceModule,
        error: errorMessage,
        retryScheduledAt: nextRunAt,
      });
    }
  }

  task.recordExecution(status, Date.now() - startedAt, result, errorMessage, nextRunAt);

  if (status === ExecutionStatus.Failed && nextRunAt === null) {
    task.fail(errorMessage ?? 'Unknown schedule execution failure');
  }

  if (
    (status === ExecutionStatus.Success ||
      (status === ExecutionStatus.Skipped && explicitlySkippedBySource)) &&
    nextRunAt === null
  ) {
    task.complete();
  }

  await repository.save(task);
}

export function createSchedulerRuntimeContribution(
  deps: SchedulerRuntimeDependencies,
): SchedulerModuleRuntimeContribution {
  const queue = new ScheduleTaskQueue({
    taskLoader: {
      async loadActiveTasks() {
        const tasks = await deps.scheduleTaskRepository.findEnabled();
        const eligibleTasks = deps.shouldScheduleTask
          ? (
              await Promise.all(
                tasks.map(async (task) =>
                  (await isTaskAllowed(task, deps.shouldScheduleTask)) ? task : null,
                ),
              )
            ).filter((task): task is ScheduleTask => task !== null)
          : tasks;

        return eligibleTasks
          .map((task) => toScheduledItem(task))
          .filter((item): item is ScheduledItem => item !== null);
      },
    },
    onExecuteTask: async (taskId, item) => {
      // R0-3：occurrence claimed 指标（执行开始）。
      deps.metrics?.increment('schedule.occurrence.claimed');
      await executeScheduledTask(
        deps.scheduleTaskRepository,
        deps.sourceExecutor,
        taskId,
        deps.shouldScheduleTask,
        item.identityId,
      );
      // 执行成功（executeScheduledTask 内部会保存 completed 状态）。
      deps.metrics?.increment('schedule.occurrence.completed');
    },
    onExecuteError: (taskId, error) => {
      logger.error('[Schedule] Queue execution failed', { taskId, error: error.message });
      deps.metrics?.increment('schedule.occurrence.failed');
    },
  });

  const syncTaskHandler = async (event: { taskId?: string; identityId?: string }) => {
    const taskId = event.taskId;
    if (!taskId) {
      return;
    }

    logger.info('[Schedule] Received task sync event', { taskId, identityId: event.identityId });
    await syncTask(
      deps.scheduleTaskRepository,
      queue,
      taskId,
      deps.shouldScheduleTask,
      event.identityId,
    );
  };

  const removeTaskHandler = (event: { taskId?: string }) => {
    const taskId = event.taskId;
    if (!taskId) {
      return;
    }

    logger.info('[Schedule] Received task removal event', { taskId });
    queue.removeTask(taskId);
  };

  const createSyncTaskListener = <K extends SyncTaskEventName>(eventName: K) => {
    return (event: ScheduleEventMap[K]) => {
      void syncTaskHandler(event).catch((error) => {
        logger.error('[Schedule] Task sync event handler failed', {
          event: eventName,
          taskId: event.taskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };
  };

  const createRemoveTaskListener = <K extends RemoveTaskEventName>(_eventName: K) => {
    return (event: ScheduleEventMap[K]) => {
      removeTaskHandler(event);
    };
  };

  const syncTaskListeners = {
    'schedule:task-created': createSyncTaskListener('schedule:task-created'),
    'schedule:task-schedule-updated': createSyncTaskListener('schedule:task-schedule-updated'),
    'schedule:task-resumed': createSyncTaskListener('schedule:task-resumed'),
    'schedule:task-executed': createSyncTaskListener('schedule:task-executed'),
  } as const;

  const removeTaskListeners = {
    'schedule:task-paused': createRemoveTaskListener('schedule:task-paused'),
    'schedule:task-completed': createRemoveTaskListener('schedule:task-completed'),
    'schedule:task-cancelled': createRemoveTaskListener('schedule:task-cancelled'),
    'schedule:task-failed': createRemoveTaskListener('schedule:task-failed'),
    'schedule:task-deleted': createRemoveTaskListener('schedule:task-deleted'),
  } as const;

  const registerListeners = () => {
    scheduleRuntimeEvents.on('schedule:task-created', syncTaskListeners['schedule:task-created']);
    scheduleRuntimeEvents.on(
      'schedule:task-schedule-updated',
      syncTaskListeners['schedule:task-schedule-updated'],
    );
    scheduleRuntimeEvents.on('schedule:task-resumed', syncTaskListeners['schedule:task-resumed']);
    scheduleRuntimeEvents.on('schedule:task-executed', syncTaskListeners['schedule:task-executed']);
    scheduleRuntimeEvents.on('schedule:task-paused', removeTaskListeners['schedule:task-paused']);
    scheduleRuntimeEvents.on(
      'schedule:task-completed',
      removeTaskListeners['schedule:task-completed'],
    );
    scheduleRuntimeEvents.on(
      'schedule:task-cancelled',
      removeTaskListeners['schedule:task-cancelled'],
    );
    scheduleRuntimeEvents.on('schedule:task-failed', removeTaskListeners['schedule:task-failed']);
    scheduleRuntimeEvents.on('schedule:task-deleted', removeTaskListeners['schedule:task-deleted']);
  };

  const unregisterListeners = () => {
    scheduleRuntimeEvents.off('schedule:task-created', syncTaskListeners['schedule:task-created']);
    scheduleRuntimeEvents.off(
      'schedule:task-schedule-updated',
      syncTaskListeners['schedule:task-schedule-updated'],
    );
    scheduleRuntimeEvents.off('schedule:task-resumed', syncTaskListeners['schedule:task-resumed']);
    scheduleRuntimeEvents.off(
      'schedule:task-executed',
      syncTaskListeners['schedule:task-executed'],
    );
    scheduleRuntimeEvents.off('schedule:task-paused', removeTaskListeners['schedule:task-paused']);
    scheduleRuntimeEvents.off(
      'schedule:task-completed',
      removeTaskListeners['schedule:task-completed'],
    );
    scheduleRuntimeEvents.off(
      'schedule:task-cancelled',
      removeTaskListeners['schedule:task-cancelled'],
    );
    scheduleRuntimeEvents.off('schedule:task-failed', removeTaskListeners['schedule:task-failed']);
    scheduleRuntimeEvents.off(
      'schedule:task-deleted',
      removeTaskListeners['schedule:task-deleted'],
    );
  };

  let started = false;
  let starting: Promise<void> | null = null;
  let schedulerStarted = false;
  let leaseRetryTimer: NodeJS.Timeout | null = null;
  let leasePromotion: Promise<void> | null = null;
  const leaseRetryIntervalMs = Math.max(250, deps.leaseRetryIntervalMs ?? 5_000);
  /** R3a：acquire 返回的 owner token（stop 时释放租约）。 */
  let leaseOwnerToken: string | undefined;

  const startScheduler = async ({ register = true } = {}): Promise<void> => {
    if (register) registerListeners();
    await queue.start();
    schedulerStarted = true;
    started = true;
    logger.info('[Schedule] Runtime contribution started');
  };

  const scheduleLeaseRetry = (): void => {
    if (!started || schedulerStarted || leaseRetryTimer || !deps.leaseCoordinator) return;
    leaseRetryTimer = setTimeout(() => {
      leaseRetryTimer = null;
      void promoteStandbyHost();
    }, leaseRetryIntervalMs);
    leaseRetryTimer.unref?.();
  };

  const promoteStandbyHost = async (): Promise<void> => {
    if (!started || schedulerStarted || !deps.leaseCoordinator || leasePromotion) return;

    leasePromotion = (async () => {
      const result = await deps.leaseCoordinator!.acquire(SCHEDULE_LEASE_KEY);
      if (!started) {
        if (result.acquired) {
          await deps.leaseCoordinator!.release(SCHEDULE_LEASE_KEY, result.ownerToken);
        }
        return;
      }
      if (!result.acquired) {
        scheduleLeaseRetry();
        return;
      }

      leaseOwnerToken = result.ownerToken;
      try {
        await startScheduler({ register: false });
        logger.info('[Schedule] Standby host promoted to scheduler (lease held)');
      } catch (error) {
        schedulerStarted = false;
        await deps.leaseCoordinator!.release(SCHEDULE_LEASE_KEY, leaseOwnerToken);
        leaseOwnerToken = undefined;
        logger.error('[Schedule] Standby promotion failed; retrying lease acquisition', {
          error: error instanceof Error ? error.message : String(error),
        });
        scheduleLeaseRetry();
      }
    })().finally(() => {
      leasePromotion = null;
    });
    await leasePromotion;
  };

  return {
    start(): Promise<void> {
      if (started) {
        return Promise.resolve();
      }

      if (starting) {
        return starting;
      }

      starting = (async () => {
        try {
          const lease = deps.leaseCoordinator;
          if (!lease) {
            await startScheduler();
            return;
          }

          // R3a：唯一调度宿主——先原子抢占 DB lease；失败则本宿主只作为
          // 读模型宿主（不启动执行队列）。
          // 注意：不能 await 一个阻塞式 lease 回调（会让 bootstrap register
          // 阶段事件循环空转导致进程退出）；acquire 只抢占+心跳并立即返回。
          const result = await lease.acquire(SCHEDULE_LEASE_KEY);
          if (!result.acquired) {
            logger.warn(
              '[Schedule] Lease not acquired; running as read-model host and retrying promotion',
            );
            // 仍注册事件监听以跟踪任务变化；后台重试 lease，原 owner 退出或
            // crash-leftover lease 到期后，本宿主可自动升级为调度宿主。
            registerListeners();
            started = true;
            scheduleLeaseRetry();
            return;
          }

          leaseOwnerToken = result.ownerToken;
          await startScheduler();
          logger.info('[Schedule] Runtime contribution started (lease held)');
        } catch (error) {
          unregisterListeners();
          throw error;
        } finally {
          starting = null;
        }
      })();

      return starting;
    },

    stop: async (): Promise<void> => {
      if (!started) {
        return;
      }

      started = false;
      if (leaseRetryTimer) {
        clearTimeout(leaseRetryTimer);
        leaseRetryTimer = null;
      }
      await leasePromotion;

      // R3a：释放租约（仅 owner）；心跳 timer 由 coordinator 一并清理。
      if (leaseOwnerToken !== undefined) {
        await deps.leaseCoordinator?.release(SCHEDULE_LEASE_KEY, leaseOwnerToken);
        leaseOwnerToken = undefined;
      }

      unregisterListeners();
      // R1-3：先排空（等待进行中的 handler 完成），再停队列。
      if (schedulerStarted) {
        await queue.drain();
        queue.stop();
        schedulerStarted = false;
      }
      logger.info('[Schedule] Runtime contribution stopped');
    },
  };
}
