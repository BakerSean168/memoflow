/**
 * createScheduleModule — explicit composition root for the schedule server runtime.
 * createScheduleModule —— 调度模块服务端运行时的显式组合根。
 *
 * The outer app selects concrete adapters and passes them in here.
 * This module then assembles the application layer exactly once and exposes a
 * stable facade to HTTP / IPC transports.
 *
 * 外层应用负责选择具体适配器并传入这里。
 * 组合根只做一次组装，然后向 HTTP / IPC 等传输层暴露稳定门面。
 *
 * Schedule uses the governance module as the canonical reference for
 * the target monorepo pattern: one composition root per module, constructor
 * injection only, no hidden service locator.
 */

import type {
  IScheduleRepository,
  IScheduleExecutionRepository,
  IScheduleTaskRepository,
} from '../domain';
import {
  BatchDeleteScheduleTasksUseCase,
  BatchOperateScheduleTasksUseCase,
  CancelScheduleTaskUseCase,
  CompleteScheduleTaskUseCase,
  CreateScheduleTaskUseCase,
  DeleteScheduleTaskUseCase,
  GetDueScheduleTasksUseCase,
  ListScheduleTasksBySourceUseCase,
  PauseScheduleTaskUseCase,
  ResumeScheduleTaskUseCase,
  GetScheduleTaskUseCase,
  ListScheduleTasksByAccountUseCase,
  ListScheduleTasksByStatusUseCase,
  TriggerScheduleTaskUseCase,
  UpdateScheduleTaskUseCase,
  UpdateScheduleTaskMetadataUseCase,
} from '../application/use-cases';
import type {
  ScheduleApplicationPort,
  ScheduleEventApplicationPort,
} from '../application';
import { ScheduleEventApplicationService } from '../application/services/schedule-event-application-service';
import { ScheduleConflictDetectionService } from '../application/services/schedule-conflict-detection-service';
import { ScheduleConflictResolutionService } from '../application/services/schedule-conflict-resolution-service';
import { ScheduleRebuildWorkerService, ScheduleRebuildWorkerRuntime } from '../application/services/schedule-rebuild-worker-service';
import { ScheduleDomainEventPublisherService, ScheduleDomainEventPublisherRuntime } from '../application/services/schedule-domain-event-publisher';
import { ScheduleLeaseCoordinator } from './lease/schedule-lease-coordinator';
import { ok, fail, toResultErrorException } from '@memoflow/contracts/result';
import { createEventBusAdapter } from '@memoflow/patterns';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import { runTimelineQueryWithAudit, globalUnifiedOperationMetrics } from '@memoflow/patterns/operations';
import { OperationTimelineEntrySchema } from '@memoflow/contracts/operations';
import type { OperationTimelineEntry } from '@memoflow/contracts/operations';
import type { ScheduleRebuildOutboxDTO } from '../domain/repositories/i-schedule-repository';
import { eventBus } from '@memoflow/utils/domain';
import type {
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '@memoflow/contracts/schedule';
import { ScheduleTaskStatus, SourceModule } from '@memoflow/contracts/schedule';
import { resultify } from '@memoflow/utils/result';

/**
 * Everything the schedule server runtime needs from the outside world.
 * 调度模块服务端运行时向外部索取的全部依赖。
 *
 * Refactor rule for other modules:
 * - only put ports or runtime contributions here
 * - never put transport objects (Express req/res, ipcMain, Router) here
 * - never hide these dependencies behind a singleton container
 */
export type ScheduleRuntimeContributionsInput =
  | ScheduleModuleRuntimeContribution
  | readonly ScheduleModuleRuntimeContribution[];

export interface ScheduleModuleDependencies {
  readonly scheduleRepository: IScheduleRepository;
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly leaseCoordinator?: import('./lease/schedule-lease-coordinator').ScheduleLeaseCoordinator;
  readonly domainEventPublisher?: ScheduleDomainEventPublisherService;
  /**
   * P1-1 production consumer：可靠、幂等消费 schedule domain events。
   * 提供时作为 module-owned runtime 随 start()/dispose() 启停。
   * Structural shape: only start/stop are consumed by the module, so the
   * concrete consumer class stays implementation-private.
   */
  readonly eventDeliveryLogConsumer?: ScheduleModuleRuntimeContribution;
  readonly runtimeContributions?: ScheduleRuntimeContributionsInput;
  /** W7：审计仓库（最小权限 + 审计） */
  readonly auditRepository?: OperationAuditRepository;
}

/**
 * Module-owned runtime side effects.
 * 模块拥有的运行时副作用。
 *
 * A contribution is the unit we start/stop together with the module instance.
 * This replaces the old global initialization pattern with explicit module-owned runtime hooks.
 */
export interface ScheduleModuleRuntimeContribution {
  start(): Promise<void> | void;
  stop(): void;
}

/**
 * Lower-level assembled use cases.
 * 已完成接线的底层 use case 集合。
 *
 * We keep this type because tests and low-level assembly sometimes need direct
 * access to use-case objects, but transports should prefer `ScheduleApplicationPort`.
 */
export interface ScheduleModuleUseCases {
  readonly createScheduleTask: CreateScheduleTaskUseCase;
  readonly updateScheduleTask: UpdateScheduleTaskUseCase;
  readonly deleteScheduleTask: DeleteScheduleTaskUseCase;
  readonly pauseScheduleTask: PauseScheduleTaskUseCase;
  readonly resumeScheduleTask: ResumeScheduleTaskUseCase;
  readonly triggerScheduleTask: TriggerScheduleTaskUseCase;
  readonly completeScheduleTask: CompleteScheduleTaskUseCase;
  readonly cancelScheduleTask: CancelScheduleTaskUseCase;
  readonly getScheduleTask: GetScheduleTaskUseCase;
  readonly getDueScheduleTasks: GetDueScheduleTasksUseCase;
  readonly listScheduleTasksByAccount: ListScheduleTasksByAccountUseCase;
  readonly listScheduleTasksBySource: ListScheduleTasksBySourceUseCase;
  readonly listScheduleTasksByStatus: ListScheduleTasksByStatusUseCase;
  readonly batchDeleteScheduleTasks: BatchDeleteScheduleTasksUseCase;
  readonly batchOperateScheduleTasks: BatchOperateScheduleTasksUseCase;
  readonly updateScheduleTaskMetadata: UpdateScheduleTaskMetadataUseCase;
  readonly scheduleEventService: ScheduleEventApplicationService;
  readonly conflictDetectionService: ScheduleConflictDetectionService;
  readonly conflictResolutionService: ScheduleConflictResolutionService;
}

/**
 * Primary schedule composition root return type.
 * 调度模块主组合根返回类型。
 *
 * `api` is the transport-facing surface.
 * `useCases` is kept for low-level tests and diagnostics.
 * `start` / `dispose` own runtime side effects.
 */
export interface ScheduleModuleInstance {
  readonly scheduleRepository: IScheduleRepository;
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly useCases: ScheduleModuleUseCases;
  readonly api: ScheduleApplicationPort;
  readonly eventApi: ScheduleEventApplicationPort;
  readonly eventDeliveryLogConsumer?: ScheduleModuleRuntimeContribution;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

function toCreateSchedulePayload(data: CreateScheduleRequest, identityId: string) {
  return {
    identityId,
    title: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    description: data.description,
    location: data.location,
    priority: data.priority,
    attendees: data.attendees,
  };
}

function toUpdateSchedulePayload(data: UpdateScheduleRequest) {
  return {
    title: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    description: data.description,
    location: data.location,
    priority: data.priority,
    attendees: data.attendees,
    expectedVersion: data.expectedVersion,
  };
}

/**
 * Pure assembly helper used by the class facade and tests.
 * 纯组装函数：给定依赖对象，返回已经接好线的 use case 集合。
 */
export function createScheduleUseCases(
  dependencies: ScheduleModuleDependencies,
): ScheduleModuleUseCases {
  const { scheduleRepository, scheduleTaskRepository } = dependencies;
  const deleteScheduleTask = new DeleteScheduleTaskUseCase(scheduleTaskRepository);
  const pauseScheduleTask = new PauseScheduleTaskUseCase(scheduleTaskRepository);
  const resumeScheduleTask = new ResumeScheduleTaskUseCase(scheduleTaskRepository);
  const cancelScheduleTask = new CancelScheduleTaskUseCase(scheduleTaskRepository);
  const updateScheduleTask = new UpdateScheduleTaskUseCase(scheduleTaskRepository);
  const scheduleEventService = new ScheduleEventApplicationService(scheduleRepository);
  const conflictDetectionService = new ScheduleConflictDetectionService(scheduleRepository);

  return {
    createScheduleTask: new CreateScheduleTaskUseCase(scheduleTaskRepository),
    updateScheduleTask,
    deleteScheduleTask,
    pauseScheduleTask,
    resumeScheduleTask,
    triggerScheduleTask: new TriggerScheduleTaskUseCase(scheduleTaskRepository),
    completeScheduleTask: new CompleteScheduleTaskUseCase(scheduleTaskRepository),
    cancelScheduleTask,
    getScheduleTask: new GetScheduleTaskUseCase(scheduleTaskRepository),
    getDueScheduleTasks: new GetDueScheduleTasksUseCase(scheduleTaskRepository),
    listScheduleTasksByAccount: new ListScheduleTasksByAccountUseCase(scheduleTaskRepository),
    listScheduleTasksBySource: new ListScheduleTasksBySourceUseCase(scheduleTaskRepository),
    listScheduleTasksByStatus: new ListScheduleTasksByStatusUseCase(scheduleTaskRepository),
    batchDeleteScheduleTasks: new BatchDeleteScheduleTasksUseCase(deleteScheduleTask),
    batchOperateScheduleTasks: new BatchOperateScheduleTasksUseCase({
      pauseScheduleTask,
      resumeScheduleTask,
      cancelScheduleTask,
      updateScheduleTask,
    }),
    updateScheduleTaskMetadata: new UpdateScheduleTaskMetadataUseCase(scheduleTaskRepository),
    scheduleEventService,
    conflictDetectionService,
    conflictResolutionService: new ScheduleConflictResolutionService(
      scheduleEventService,
      conflictDetectionService,
    ),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?:
    | ScheduleModuleRuntimeContribution
    | ReadonlyArray<ScheduleModuleRuntimeContribution>,
): readonly ScheduleModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  if (Array.isArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }

  return [runtimeContributions as ScheduleModuleRuntimeContribution];
}

/**
 * Canonical composition root.
 * 规范化的调度模块主组合根。
 *
 * This follows the governance module pattern: one composition root per module,
 * constructor injection only, no hidden service locator.
 * The expected reading order is:
 * 1. define `Dependencies`
 * 2. define transport-neutral `ApplicationPort`
 * 3. assemble use cases once
 * 4. wrap them in `api` (ok/fail wrapping lives here, not in transports)
 * 5. let the module instance own `start` / `dispose`
 */
export function createScheduleModule(
  dependencies: ScheduleModuleDependencies,
): ScheduleModuleInstance {
  const { scheduleRepository, scheduleExecutionRepository, scheduleTaskRepository } = dependencies;
  const auditRepository = dependencies.auditRepository;
  const leaseCoordinator = dependencies.leaseCoordinator ?? new ScheduleLeaseCoordinator(null);
  const workerService = new ScheduleRebuildWorkerService(
    scheduleRepository,
    leaseCoordinator,
    undefined,
    globalUnifiedOperationMetrics,
  );
  const workerRuntime = new ScheduleRebuildWorkerRuntime(workerService);
  const domainEventPublisher =
    dependencies.domainEventPublisher ??
    new ScheduleDomainEventPublisherService(
      scheduleRepository,
      leaseCoordinator,
      createEventBusAdapter(eventBus),
    );
  const publisherRuntime = new ScheduleDomainEventPublisherRuntime(domainEventPublisher);
  const eventDeliveryLogConsumer = dependencies.eventDeliveryLogConsumer;
  const runtimeContributions = [
    workerRuntime,
    publisherRuntime,
    ...(eventDeliveryLogConsumer ? [eventDeliveryLogConsumer] : []),
    ...normalizeRuntimeContributions(dependencies.runtimeContributions),
  ];
  const useCases = createScheduleUseCases(dependencies);
  let started = false;
  const startedRuntimes: ScheduleModuleRuntimeContribution[] = [];

  /**
   * ApplicationPort — wraps use cases with ok()/fail() so transports stay boring.
   * ApplicationPort —— 用 ok()/fail() 包裹 use case，让传输层保持简单无聊。
   */
  const api: ScheduleApplicationPort = {
    listTasks: async (query, ctx) => {
      if (query.status) {
        return useCases.listScheduleTasksByStatus.execute(
          query.status as ScheduleTaskStatus,
          ctx.identityId,
        );
      } else if (query.sourceModule && query.sourceEntityId) {
        return useCases.listScheduleTasksBySource.execute(
          query.sourceModule as SourceModule,
          query.sourceEntityId as string,
          ctx.identityId,
        );
      } else {
        return useCases.listScheduleTasksByAccount.execute(ctx.identityId);
      }
    },
    getTask: async (id, ctx) => useCases.getScheduleTask.execute(id, ctx.identityId),
    getDueTasks: async () => useCases.getDueScheduleTasks.execute(),

    queryRebuildTimeline: async (ctx) => {
      if (!auditRepository) {
        return fail({
          code: 'FAIL_CLOSED',
          message:
            '[FAIL-CLOSED] schedule rebuild timeline requires an explicit auditRepository dependency (timeline_query audit is mandatory).',
        });
      }
      const { entries } = await runTimelineQueryWithAudit({
        repository: auditRepository,
        source: 'schedule-rebuild',
        actorIdentityId: ctx.identityId,
        filters: { limit: 100 },
        query: () => scheduleRepository.fetchRebuildTimeline(ctx.identityId, 100),
      });
      return ok(entries.map(mapRebuildOutboxToTimelineEntry));
    },

    replayRebuildOutbox: async (operationId, ctx) => {
      if (!auditRepository) {
        return fail({
          code: 'FAIL_CLOSED',
          message:
            '[FAIL-CLOSED] schedule rebuild replay requires an explicit auditRepository dependency.',
        });
      }
      try {
        if (!scheduleRepository.replayRebuildOutboxWithAudit) {
          return fail({
            code: 'FAIL_CLOSED',
            message:
              '[FAIL-CLOSED] schedule rebuild replay requires a repository implementing atomic replayRebuildOutboxWithAudit (state + audit in one transaction).',
          });
        }
        const dto = await scheduleRepository.replayRebuildOutboxWithAudit(
          { identityId: ctx.identityId, operationId },
          {
            actorIdentityId: ctx.identityId,
            source: 'schedule-rebuild',
            operationId,
            action: 'replay',
          },
          auditRepository,
        );
        return ok(mapRebuildOutboxToTimelineEntry(dto));
      } catch (err) {
        return fail({
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    getOperationAudit: async (ctx) => {
      if (!auditRepository) {
        return fail({
          code: 'FAIL_CLOSED',
          message:
            '[FAIL-CLOSED] schedule operation audit requires an explicit auditRepository dependency.',
        });
      }
      return ok(await auditRepository.listByActor({ identityId: ctx.identityId }));
    },
  };

  const eventApi: ScheduleEventApplicationPort = {
    createEvent: async (data, ctx) =>
      resultify(
        () =>
          useCases.scheduleEventService.createSchedule(toCreateSchedulePayload(data, ctx.identityId)),
        'Failed to create schedule event',
      ),
    getEvent: async (id, ctx) =>
      resultify(async () => {
        const event = await useCases.scheduleEventService.getSchedule(id, ctx.identityId);
        if (!event) {
          throw toResultErrorException({ code: 'NOT_FOUND', message: '日程不存在' }, 404);
        }
        return event;
      }, 'Failed to get schedule event'),
    listEvents: async (query, _ctx) =>
      resultify(
        () =>
          useCases.scheduleEventService.getSchedulesByRange(
            query.identityId,
            query.startTime,
            query.endTime,
          ),
        'Failed to list schedule events',
      ),
    updateEvent: async (id, data, ctx) =>
      resultify(
        () =>
          useCases.scheduleEventService.updateSchedule(
            id,
            ctx.identityId,
            toUpdateSchedulePayload(data),
          ),
        'Failed to update schedule event',
      ),
    deleteEvent: async (id, ctx, expectedVersion: number) =>
      resultify(async () => {
        await useCases.scheduleEventService.deleteSchedule(id, ctx.identityId, expectedVersion);
        return null;
      }, 'Failed to delete schedule event'),
    getConflicts: async (id, ctx) =>
      resultify(
        () => useCases.conflictResolutionService.getConflicts(id, ctx.identityId),
        'Failed to get schedule conflicts',
      ),
    detectConflicts: async (data) =>
      resultify(() => useCases.conflictResolutionService.detectConflicts(data), 'Failed to detect schedule conflicts'),
    createEventWithConflictDetection: async (data, ctx) =>
      resultify(
        () => useCases.conflictResolutionService.createWithConflictDetection(data, ctx.identityId),
        'Failed to create schedule event with conflict detection',
      ),
    resolveConflict: async (id, data, ctx) =>
      resultify(
        () => useCases.conflictResolutionService.resolveConflict(id, data, ctx.identityId),
        'Failed to resolve schedule conflict',
      ),
  };

  return {
    scheduleRepository,
    scheduleExecutionRepository,
    scheduleTaskRepository,
    useCases,
    api,
    eventApi,
    eventDeliveryLogConsumer,
    async start(): Promise<void> {
      if (started) {
        return;
      }

      try {
        for (const runtime of runtimeContributions) {
          await runtime.start();
          startedRuntimes.push(runtime);
        }
      } catch (error) {
        for (const runtime of [...startedRuntimes].reverse()) {
          runtime.stop();
        }
        startedRuntimes.length = 0;
        throw error;
      }

      started = true;
    },
    async dispose(): Promise<void> {
      if (!started) {
        return;
      }

      // R1-3：按启动逆序关闭，并等待每个 runtime 排空。
      for (const runtime of [...startedRuntimes].reverse()) {
        await runtime.stop();
      }

      startedRuntimes.length = 0;
      started = false;
    },
  };
}

function mapRebuildOutboxToTimelineEntry(item: ScheduleRebuildOutboxDTO): OperationTimelineEntry {
  const entry: OperationTimelineEntry = {
    source: 'schedule-rebuild',
    operationId: item.id,
    status: normalizeRebuildStatus(item.status),
    failureReason: item.lastError ?? null,
    attempts: item.attempts ?? 0,
    nextRetryAt: item.nextAttemptAt ? item.nextAttemptAt.toISOString() : null,
    replayable: item.status === 'failed',
    updatedAt: (item.processedAt ?? item.createdAt).toISOString(),
  };
  return OperationTimelineEntrySchema.parse(entry);
}

function normalizeRebuildStatus(
  status: string,
): 'pending' | 'running' | 'succeeded' | 'skipped' | 'failed' | 'retryable' | 'dead_letter' | 'cancelled' {
  switch (status) {
    case 'processing':
      return 'running';
    case 'completed':
      return 'succeeded';
    case 'retry':
      return 'retryable';
    case 'failed':
      return 'dead_letter';
    default:
      return 'pending';
  }
}
