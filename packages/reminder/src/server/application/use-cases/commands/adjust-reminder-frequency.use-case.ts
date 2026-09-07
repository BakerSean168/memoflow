/**
 * Adjust Reminder Frequency Service
 *
 * 调整提醒频率
 */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IReminderTemplateRepository } from '../../../domain/repositories/i-reminder-template-repository';
import type { ReminderEventMap } from '@memoflow/contracts/reminder';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';

const reminderAnalyticsEvents = createTypedEventPublisher<
  Pick<ReminderEventMap, 'reminder:frequency-adjusted'>
>(eventBus);

/**
 * 调整结果
 */
export interface AdjustmentResult {
  templateId: string;
  originalInterval: number;
  adjustedInterval: number;
  reason: string;
  appliedAt: number;
}

/**
 * 频率调整请求
 */
export interface AdjustFrequencyRequest {
  templateId: string;
  newInterval: number;
  reason: string;
  identityId: string;
}

/**
 * Adjust Reminder Frequency Service
 *
 * 职责：
 * - 应用用户显式提交的 interval 调整
 * - 持久化后发布 frequency-adjusted 事件
 * - 不维护或自动应用后台建议状态
 */
export class AdjustReminderFrequencyUseCase {
  constructor(private readonly templateRepository: IReminderTemplateRepository) {}

  /**
   * 接受并应用频率调整
   *
   * @param request - 调整请求
   * @returns 调整结果
   */
  async execute(request: AdjustFrequencyRequest): Promise<Result<AdjustmentResult>> {
    const template = await this.templateRepository.findByIdForIdentity(
      request.identityId,
      request.templateId,
    );
    if (!template) {
      return error('NOT_FOUND', `Template ${request.templateId} not found`);
    }

    const trigger = {
      type: template.trigger.type,
      fixedTime: template.trigger.fixedTime,
      interval: template.trigger.interval,
    };
    if (trigger.type !== 'Interval' || !trigger.interval) {
      return error('BAD_REQUEST', `Template ${request.templateId} does not use interval trigger`);
    }

    const originalInterval = trigger.interval.minutes;

    template.update({
      trigger: {
        ...trigger,
        interval: {
          ...trigger.interval,
          minutes: request.newInterval,
        },
      },
    });

    await this.templateRepository.save(template);

    // Publish event
    const adjustedEvent: ReminderEventMap['reminder:frequency-adjusted'] = {
      templateId: request.templateId as ReminderEventMap['reminder:frequency-adjusted']['templateId'],
      originalInterval,
      adjustedInterval: request.newInterval,
      reason: request.reason,
      identityId: request.identityId as ReminderEventMap['reminder:frequency-adjusted']['identityId'],
      adjustedAt: Date.now(),
    };
    reminderAnalyticsEvents.send('reminder:frequency-adjusted', adjustedEvent);

    return ok({
      templateId: request.templateId,
      originalInterval,
      adjustedInterval: request.newInterval,
      reason: request.reason,
      appliedAt: Date.now(),
    });
  }

}
