/**
 * Schedule Event Controller
 *
 * Encapsulates Zod validation and use case orchestration for schedule events (calendar entries).
 * Shared by both Express (HTTP) and IPC transport layers.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type { ScheduleEventApplicationPort } from '../application';
import {
  CreateScheduleRequestSchema,
  UpdateScheduleRequestSchema,
  DetectConflictsRequestSchema,
  ResolveConflictRequestSchema,
  DeleteScheduleRequestSchema,
  type GetSchedulesByTimeRangeInternalQuery,
  type DetectConflictsInternalQuery,
} from '@memoflow/contracts/schedule';
import { formatZodErrors } from '@memoflow/utils/result';

export class ScheduleEventController {
  constructor(private readonly api: ScheduleEventApplicationPort) {}

  async create(input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = CreateScheduleRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    if (parsed.data.autoDetectConflicts) {
      return this.createWithConflictDetection(input, ctx);
    }

    return this.api.createEvent(parsed.data, ctx);
  }

  async get(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.api.getEvent(id, ctx);
  }

  async getAll(ctx: Context): Promise<Result<unknown>> {
    return this.api.listAllEvents(ctx);
  }

  async getByTimeRange(query: Record<string, unknown>, ctx: Context): Promise<Result<unknown>> {
    const startTime = Number(query.startTime);
    const endTime = Number(query.endTime);

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'startTime 和 endTime 必须是有效的数字',
      });
    }

    const internalQuery: GetSchedulesByTimeRangeInternalQuery = {
      startTime,
      endTime,
      identityId: ctx.identityId as GetSchedulesByTimeRangeInternalQuery['identityId'],
    };

    return this.api.listEvents(internalQuery, ctx);
  }

  async update(id: string, input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = UpdateScheduleRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败: 缺失 expectedVersion 或参数非法',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.api.updateEvent(id, parsed.data, ctx);
  }

  async delete(id: string, input: unknown, ctx: Context): Promise<Result<null>> {
    const parsed = DeleteScheduleRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败: 缺失 expectedVersion 或参数非法',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    const result = await this.api.deleteEvent(id, ctx, parsed.data.expectedVersion);
    if (!result.ok) return result as Result<null>;
    return ok(null);
  }

  async getConflicts(id: string, ctx: Context): Promise<Result<unknown>> {
    return this.api.getConflicts(id, ctx);
  }

  async detectConflicts(input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = DetectConflictsRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    const internalQuery: DetectConflictsInternalQuery = {
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      excludeId: parsed.data.excludeId,
      identityId: ctx.identityId as DetectConflictsInternalQuery['identityId'],
    };

    return this.api.detectConflicts(internalQuery);
  }

  async createWithConflictDetection(input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = CreateScheduleRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.api.createEventWithConflictDetection(parsed.data, ctx);
  }

  async resolveConflict(id: string, input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = ResolveConflictRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.api.resolveConflict(id, parsed.data, ctx);
  }
}
