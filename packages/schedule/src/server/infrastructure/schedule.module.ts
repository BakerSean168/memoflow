/**
 * Planner/Calendar composition root.
 *
 * Temporal Engine worker state, queueing and ScheduleTask use cases live in
 * @memoflow/scheduler. This module owns CalendarEntry product state plus the
 * Calendar reliability workers (rebuild/outbox delivery).
 */

import type { IScheduleRepository } from '../domain';
import type { ScheduleApplicationPort, ScheduleEventApplicationPort } from '../application';
import { ScheduleEventApplicationService } from '../application/services/schedule-event-application-service';
import { ScheduleConflictDetectionService } from '../application/services/schedule-conflict-detection-service';
import { ScheduleConflictResolutionService } from '../application/services/schedule-conflict-resolution-service';
import {
  ScheduleRebuildWorkerService,
  ScheduleRebuildWorkerRuntime,
} from '../application/services/schedule-rebuild-worker-service';
import {
  ScheduleDomainEventPublisherService,
  ScheduleDomainEventPublisherRuntime,
} from '../application/services/schedule-domain-event-publisher';
import type { LeaseCoordinatorPort } from '@memoflow/patterns/lease';
import { ok, fail, toResultErrorException } from '@memoflow/contracts/result';
import { createEventBusAdapter } from '@memoflow/patterns';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import {
  runTimelineQueryWithAudit,
  globalUnifiedOperationMetrics,
} from '@memoflow/patterns/operations';
import { OperationTimelineEntrySchema } from '@memoflow/contracts/operations';
import type { OperationTimelineEntry } from '@memoflow/contracts/operations';
import type { ScheduleRebuildOutboxDTO } from '../domain/repositories/i-schedule-repository';
import { eventBus } from '@memoflow/utils/domain';
import type { CreateScheduleRequest, UpdateScheduleRequest } from '@memoflow/contracts/schedule';
import { resultify } from '@memoflow/utils/result';

export interface ScheduleModuleRuntimeContribution {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export type ScheduleRuntimeContributionsInput =
  | ScheduleModuleRuntimeContribution
  | readonly ScheduleModuleRuntimeContribution[];

export interface ScheduleModuleDependencies {
  readonly scheduleRepository: IScheduleRepository;
  /**
   * Host-provided fenced-work coordinator. The concrete lease implementation
   * belongs to @memoflow/scheduler; Schedule depends only on the shared port.
   */
  readonly leaseCoordinator: LeaseCoordinatorPort;
  readonly domainEventPublisher?: ScheduleDomainEventPublisherService;
  readonly eventDeliveryLogConsumer?: ScheduleModuleRuntimeContribution;
  readonly runtimeContributions?: ScheduleRuntimeContributionsInput;
  readonly auditRepository?: OperationAuditRepository;
}

export interface ScheduleModuleUseCases {
  readonly scheduleEventService: ScheduleEventApplicationService;
  readonly conflictDetectionService: ScheduleConflictDetectionService;
  readonly conflictResolutionService: ScheduleConflictResolutionService;
}

export interface ScheduleModuleInstance {
  readonly scheduleRepository: IScheduleRepository;
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

export function createScheduleUseCases(
  dependencies: ScheduleModuleDependencies,
): ScheduleModuleUseCases {
  const scheduleEventService = new ScheduleEventApplicationService(dependencies.scheduleRepository);
  const conflictDetectionService = new ScheduleConflictDetectionService(dependencies.scheduleRepository);
  return {
    scheduleEventService,
    conflictDetectionService,
    conflictResolutionService: new ScheduleConflictResolutionService(
      scheduleEventService,
      conflictDetectionService,
    ),
  };
}

function normalizeRuntimeContributions(
  input?: ScheduleRuntimeContributionsInput,
): readonly ScheduleModuleRuntimeContribution[] {
  if (!input) return [];
  return Array.isArray(input) ? Array.from(input) : [input as ScheduleModuleRuntimeContribution];
}

export function createScheduleModule(
  dependencies: ScheduleModuleDependencies,
): ScheduleModuleInstance {
  const { scheduleRepository, leaseCoordinator } = dependencies;
  const auditRepository = dependencies.auditRepository;
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

  const api: ScheduleApplicationPort = {
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
        () => useCases.scheduleEventService.createSchedule(toCreateSchedulePayload(data, ctx.identityId)),
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
    deleteEvent: async (id, ctx, expectedVersion) =>
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
      resultify(
        () => useCases.conflictResolutionService.detectConflicts(data),
        'Failed to detect schedule conflicts',
      ),
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
    useCases,
    api,
    eventApi,
    eventDeliveryLogConsumer,
    async start() {
      if (started) return;
      try {
        for (const runtime of runtimeContributions) {
          await runtime.start();
          startedRuntimes.push(runtime);
        }
      } catch (error) {
        for (const runtime of [...startedRuntimes].reverse()) await runtime.stop();
        startedRuntimes.length = 0;
        throw error;
      }
      started = true;
    },
    async dispose() {
      if (!started) return;
      for (const runtime of [...startedRuntimes].reverse()) await runtime.stop();
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
