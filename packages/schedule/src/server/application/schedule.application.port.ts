import type { Result } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type {
  OperationTimelineEntry,
  OperationAuditRecord,
} from '@memoflow/contracts/operations';
import type {
  CreateScheduleRequest,
  DetectConflictsInternalQuery,
  GetSchedulesByTimeRangeInternalQuery,
  ResolveConflictRequest,
  UpdateScheduleRequest,
} from '@memoflow/contracts/schedule';

/**
 * Planner/Calendar operational surface.
 *
 * Worker-job diagnostics live in @memoflow/scheduler. This port owns only
 * Calendar reliability/operations that are backed by Schedule-owned state.
 */
export interface ScheduleApplicationPort {
  queryRebuildTimeline(ctx: Context): Promise<Result<OperationTimelineEntry[]>>;
  replayRebuildOutbox(operationId: string, ctx: Context): Promise<Result<unknown>>;
  getOperationAudit(ctx: Context): Promise<Result<OperationAuditRecord[]>>;
}

/** Transport-neutral callable application surface for Calendar entries. */
export interface ScheduleEventApplicationPort {
  createEvent(data: CreateScheduleRequest, ctx: Context): Promise<Result<unknown>>;
  getEvent(id: string, ctx: Context): Promise<Result<unknown>>;
  listEvents(query: GetSchedulesByTimeRangeInternalQuery, ctx: Context): Promise<Result<unknown>>;
  updateEvent(id: string, data: UpdateScheduleRequest, ctx: Context): Promise<Result<unknown>>;
  deleteEvent(id: string, ctx: Context, expectedVersion: number): Promise<Result<unknown>>;
  getConflicts(id: string, ctx: Context): Promise<Result<unknown>>;
  detectConflicts(data: DetectConflictsInternalQuery): Promise<Result<unknown>>;
  createEventWithConflictDetection(
    data: CreateScheduleRequest,
    ctx: Context,
  ): Promise<Result<unknown>>;
  resolveConflict(id: string, data: ResolveConflictRequest, ctx: Context): Promise<Result<unknown>>;
}
