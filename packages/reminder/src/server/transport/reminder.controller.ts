/**
 * Reminder Controller
 *
 * Encapsulates Zod validation and use case orchestration.
 * Shared by both Express (HTTP) and IPC transport layers.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { ReminderApplicationPort } from '../application';
import {
  CreateReminderTemplateSchema,
  UpdateReminderTemplateSchema,
  GetUpcomingRemindersSchema,
  GetReminderTodayScheduleSchema,
  CreateReminderGroupSchema,
  UpdateReminderGroupSchema,
  BatchGroupTemplatesSchema,
  UpdateReminderPreferencesSchema,
} from '@memoflow/contracts/reminder';
import type {
  GetUpcomingRemindersRes,
  GetReminderTodayScheduleRes,
} from '@memoflow/contracts/reminder';
import { formatZodErrors } from '@memoflow/utils/result';

export class ReminderController {
  constructor(private readonly useCases: ReminderApplicationPort) {}

  // ==================== Template Operations ====================

  async createTemplate(input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = CreateReminderTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.createTemplate(parsed.data, ctx);
  }

  async listTemplates(ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.listTemplates(ctx);
  }

  async getUpcomingReminders(
    query: Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Result<GetUpcomingRemindersRes>> {
    const parsed = GetUpcomingRemindersSchema.safeParse(query);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.getUpcomingReminders(parsed.data, ctx);
  }

  async getTodaySchedule(
    query: Record<string, unknown>,
    ctx: ExecutionContext,
  ): Promise<Result<GetReminderTodayScheduleRes>> {
    const parsed = GetReminderTodayScheduleSchema.safeParse(query);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.getTodaySchedule(parsed.data, ctx);
  }

  async getTemplate(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getTemplate(id, ctx);
  }

  async updateTemplate(id: string, input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = UpdateReminderTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.updateTemplate(id, parsed.data, ctx);
  }

  async deleteTemplate(id: string, ctx: ExecutionContext): Promise<Result<null>> {
    const result = await this.useCases.deleteTemplate(id, ctx);
    if (!result.ok) return result as Result<null>;
    // Serialize as data:null (no Result.void / undefined dual-track).
    return ok(null);
  }

  // ==================== Group Operations ====================

  async createGroup(input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = CreateReminderGroupSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.createGroup(parsed.data, ctx);
  }

  async listGroups(ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.listGroups(ctx);
  }

  async getGroup(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getGroup(id, ctx);
  }

  async updateGroup(id: string, input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = UpdateReminderGroupSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.updateGroup(id, parsed.data, ctx);
  }

  async deleteGroup(id: string, ctx: ExecutionContext): Promise<Result<null>> {
    const result = await this.useCases.deleteGroup(id, ctx);
    if (!result.ok) return result as Result<null>;
    // Serialize as data:null (no Result.void / undefined dual-track).
    return ok(null);
  }

  async batchGroupTemplates(id: string, input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = BatchGroupTemplatesSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.batchGroupTemplates(id, parsed.data, ctx);
  }

  // ==================== Template Actions ====================

  async enableTemplate(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.enableTemplate(id, ctx);
  }

  async pauseTemplate(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.pauseTemplate(id, ctx);
  }

  async toggleTemplate(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.toggleTemplate(id, ctx);
  }

  async moveTemplate(id: string, input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const rawGroupId = (input as Record<string, unknown>)?.groupId;
    if (rawGroupId !== null && rawGroupId !== undefined && typeof rawGroupId !== 'string') {
      return fail({ code: 'VALIDATION_ERROR', message: 'groupId must be a string or null' });
    }
    return this.useCases.moveTemplate(id, rawGroupId ?? null, ctx);
  }

  async getTemplateHistory(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getTemplateHistory(id, ctx);
  }

  // ==================== Response Operations ====================

  async recordResponse(templateId: string, input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const action = (input as Record<string, unknown>)?.action;
    if (!action || typeof action !== 'string') {
      return fail({ code: 'VALIDATION_ERROR', message: 'action is required' });
    }
    return this.useCases.recordResponse(
      templateId,
      {
        action,
        note: (input as Record<string, unknown>)?.note as string | undefined,
      },
      ctx,
    );
  }

  async getTemplateResponses(templateId: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getTemplateResponses(templateId, ctx);
  }

  async getResponseStats(templateId: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getResponseStats(templateId, ctx);
  }

  // ==================== Frequency Analysis ====================

  async analyzeFrequency(templateId: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.analyzeFrequency(templateId, ctx);
  }

  async adjustFrequency(
    templateId: string,
    input: unknown,
    ctx: ExecutionContext,
  ): Promise<Result<unknown>> {
    const action = (input as Record<string, unknown>)?.action;
    if (!action || typeof action !== 'string') {
      return fail({ code: 'VALIDATION_ERROR', message: 'action is required (apply | custom)' });
    }
    return this.useCases.adjustFrequency(
      templateId,
      {
        action,
        customInterval: (input as Record<string, unknown>)?.customInterval as number | undefined,
      },
      ctx,
    );
  }

  async rejectFrequencyAdjustment(templateId: string, ctx: ExecutionContext): Promise<Result<null>> {
    const result = await this.useCases.rejectFrequencyAdjustment(templateId, ctx);
    if (!result.ok) return result as Result<null>;
    // Serialize as data:null (no Result.void / undefined dual-track).
    return ok(null);
  }

  // ==================== Group Actions ====================

  async toggleGroup(id: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.toggleGroup(id, ctx);
  }

  // ==================== Preferences ====================

  async getPreferences(ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getPreferences(ctx);
  }

  async updatePreferences(input: unknown, ctx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = UpdateReminderPreferencesSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.updatePreferences(parsed.data, ctx);
  }

  // ==================== W7 Operation Timeline / Replay / Audit ====================

  async queryOperationTimeline(ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.queryOperationTimeline(ctx);
  }

  async replayOperation(operationId: string, ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.replayOperation(operationId, ctx);
  }

  async getOperationAudit(ctx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.getOperationAudit(ctx);
  }
}
