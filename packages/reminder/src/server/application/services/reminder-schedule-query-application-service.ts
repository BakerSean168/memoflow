import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  GetReminderTodayScheduleReq,
  GetReminderTodayScheduleRes,
  GetUpcomingRemindersReq,
  GetUpcomingRemindersRes,
} from '@memoflow/contracts/reminder';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import type { UserTimeContextPort } from '@memoflow/time';
import { UpcomingReminderCalculationService } from '../../domain/services/upcoming-reminder-calculation-service';

export interface ReminderScheduleQueryApplicationServiceDependencies {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly userTimeContextPort: UserTimeContextPort;
}

export class ReminderScheduleQueryApplicationService {
  private readonly reminderTemplateRepository: IReminderTemplateRepository;
  private readonly userTimeContextPort: UserTimeContextPort;

  constructor(dependencies: ReminderScheduleQueryApplicationServiceDependencies) {
    this.reminderTemplateRepository = dependencies.reminderTemplateRepository;
    this.userTimeContextPort = dependencies.userTimeContextPort;
  }

  /** Explicit request timezone wins; otherwise resolve the identity-scoped canonical Product Time context. */
  private async resolveTimezone(
    requestTimezone: string | undefined | null,
    identityId: string,
  ): Promise<string> {
    if (requestTimezone && requestTimezone.trim().length > 0) {
      return requestTimezone;
    }
    const context = await this.userTimeContextPort.getUserTimeContext(identityId);
    return context.timeZone;
  }

  async getUpcomingReminders(
    params: GetUpcomingRemindersReq,
    ctx: ExecutionContext,
  ): Promise<Result<GetUpcomingRemindersRes>> {
    const templates = await this.reminderTemplateRepository.findByIdentityId(ctx.identityId, {
      includeDeleted: false,
    });
    const filteredTemplates = templates
      .map((template) => template.toServerDTO())
      .filter((template) => (params.type ? template.type === params.type : true))
      .filter((template) =>
        params.importanceLevel ? template.importanceLevel === params.importanceLevel : true,
      );

    const effectiveTimezone = await this.resolveTimezone(params.timezone, ctx.identityId);

    const upcoming = UpcomingReminderCalculationService.calculateUpcomingReminders(
      filteredTemplates,
      {
        days: params.days,
        limit: Number.MAX_SAFE_INTEGER,
        timezone: effectiveTimezone,
      },
    );
    const limited = typeof params.limit === 'number' ? upcoming.slice(0, params.limit) : upcoming;

    return ok({
      data: limited,
      total: upcoming.length,
    });
  }

  async getTodaySchedule(
    params: GetReminderTodayScheduleReq,
    ctx: ExecutionContext,
  ): Promise<Result<GetReminderTodayScheduleRes>> {
    const templates = await this.reminderTemplateRepository.findByIdentityId(ctx.identityId, {
      includeDeleted: false,
    });

    const effectiveTimezone = await this.resolveTimezone(params.timezone, ctx.identityId);

    const schedule = UpcomingReminderCalculationService.calculateTodaySchedule(
      templates.map((template) => template.toServerDTO()),
      {
        includeExpired: Boolean(params.includeExpired),
        timezone: effectiveTimezone,
      },
    );
    const limited = typeof params.limit === 'number' ? schedule.slice(0, params.limit) : schedule;

    return ok({
      data: limited,
      total: schedule.length,
    });
  }
}