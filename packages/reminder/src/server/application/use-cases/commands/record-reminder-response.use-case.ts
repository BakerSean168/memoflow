/**
 * Record Reminder Response Service
 *
 * Records user response analytics while keeping snooze as a distinct command.
 */

import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import {
  ReminderResponseAction,
  type ReminderEventMap,
  type ReminderResponseAction as ReminderResponseActionType,
} from '@memoflow/contracts/reminder';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import type { IReminderResponseRepository } from '../../../domain/repositories/i-reminder-response-repository';
import { ReminderResponse } from '../../../domain/entities/reminder-response';

const logger = createLogger('RecordReminderResponseUseCase');
const reminderAnalyticsEvents = createTypedEventPublisher<
  Pick<ReminderEventMap, 'reminder:response-recorded'>
>(eventBus);

/**
 * Durable snooze command port. Implementations must persist temporary Routine
 * override state; they must not mutate raw Scheduler persistence directly.
 */
export interface ReminderSnoozeOverrideWriter {
  snooze(routineId: string, identityId: string, durationSeconds: number): Promise<void>;
}

export interface RecordResponseDTO {
  templateId: string;
  action: ReminderResponseActionType;
  /** Actual latency from reminder presentation to user response, in seconds. */
  responseTime?: number;
  /** User-requested snooze delay, in seconds. Only valid for SNOOZED. */
  snoozeDurationSeconds?: number;
  identityId: string;
}

export interface ResponseRecordResult {
  id: string;
  templateId: string;
  action: ReminderResponseActionType;
  responseTime: number | null;
  snoozeDurationSeconds: number | null;
  recordedAt: number;
}

export interface ResponseStatsResult {
  total: number;
  clicked: number;
  ignored: number;
  snoozed: number;
  dismissed: number;
  completed: number;
  avgResponseTime: number;
}

export class RecordReminderResponseUseCase {
  constructor(
    private readonly responseRepository: IReminderResponseRepository,
    private readonly snoozeOverrideWriter?: ReminderSnoozeOverrideWriter,
  ) {}

  async execute(dto: RecordResponseDTO): Promise<Result<ResponseRecordResult>> {
    logger.info('Recording response', {
      templateId: dto.templateId,
      action: dto.action,
      responseTime: dto.responseTime,
      snoozeDurationSeconds: dto.snoozeDurationSeconds,
      identityId: dto.identityId,
    });

    if (
      dto.responseTime !== undefined &&
      (!Number.isInteger(dto.responseTime) || dto.responseTime < 0)
    ) {
      return error('VALIDATION_ERROR', 'responseTime must be a non-negative integer number of seconds');
    }

    const isSnoozed = dto.action === ReminderResponseAction.Snoozed;
    if (isSnoozed) {
      if (
        dto.snoozeDurationSeconds === undefined ||
        !Number.isInteger(dto.snoozeDurationSeconds) ||
        dto.snoozeDurationSeconds <= 0
      ) {
        return error(
          'VALIDATION_ERROR',
          'SNOOZED responses require a positive integer snoozeDurationSeconds',
        );
      }
      if (!this.snoozeOverrideWriter) {
        return error('SERVICE_UNAVAILABLE', 'Snooze runtime is not available');
      }
    } else if (dto.snoozeDurationSeconds !== undefined) {
      return error(
        'VALIDATION_ERROR',
        'snoozeDurationSeconds is only valid for SNOOZED responses',
      );
    }

    const response = ReminderResponse.create({
      reminderTemplateId: dto.templateId,
      identityId: dto.identityId,
      action: dto.action,
      responseTime: dto.responseTime,
      snoozeDurationSeconds: dto.snoozeDurationSeconds,
    });

    await this.responseRepository.save(response);
    const savedRecord = response.toServerDTO();

    if (isSnoozed) {
      try {
        await this.snoozeOverrideWriter!.snooze(
          dto.templateId,
          dto.identityId,
          dto.snoozeDurationSeconds!,
        );
      } catch (cause) {
        logger.error('Snooze override write failed after response record', {
          templateId: dto.templateId,
          error: cause instanceof Error ? cause.message : String(cause),
        });
        return error('SERVICE_UNAVAILABLE', 'Unable to persist snooze override');
      }
    }

    const recordedEvent: ReminderEventMap['reminder:response-recorded'] = {
      responseId: savedRecord.id,
      templateId: savedRecord.reminderTemplateId,
      identityId: savedRecord.identityId,
      action: savedRecord.action,
      responseTime: savedRecord.responseTime ?? null,
      snoozeDurationSeconds: savedRecord.snoozeDurationSeconds ?? null,
      recordedAt: savedRecord.timestamp,
    };
    reminderAnalyticsEvents.send('reminder:response-recorded', recordedEvent);

    logger.info('Response recorded', {
      id: savedRecord.id,
      templateId: dto.templateId,
      action: dto.action,
    });

    return ok({
      id: savedRecord.id,
      templateId: savedRecord.reminderTemplateId,
      action: savedRecord.action,
      responseTime: savedRecord.responseTime ?? null,
      snoozeDurationSeconds: savedRecord.snoozeDurationSeconds ?? null,
      recordedAt: savedRecord.timestamp,
    });
  }

  async getResponsesByTemplate(
    templateId: string,
    identityId: string,
    limit: number = 100,
  ): Promise<Result<unknown[]>> {
    const responses = await this.responseRepository.findByTemplateId(
      templateId,
      identityId,
      limit,
    );
    return ok(responses);
  }

  async deleteResponsesByTemplate(
    templateId: string,
    identityId: string,
  ): Promise<Result<number>> {
    logger.info('Deleting responses for template', { templateId, identityId });
    const count = await this.responseRepository.deleteByTemplateId(templateId, identityId);
    logger.info('Responses deleted', { templateId, count });
    return ok(count);
  }

  async getResponseStats(
    templateId: string,
    identityId: string,
    lookbackDays: number = 30,
  ): Promise<Result<ResponseStatsResult>> {
    const stats = await this.responseRepository.getResponseStats(
      templateId,
      identityId,
      lookbackDays,
    );
    return ok(stats as ResponseStatsResult);
  }
}
