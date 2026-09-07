/**
 * ReminderTriggerService - 提醒触发服务
 *
 * DDD Domain Service:
 * - 处理提醒触发逻辑
 * - 记录触发历史
 * - 计算下次触发时间
 *
 * 职责：
 * - 执行提醒触发
 * - 创建触发历史记录
 * - 计算重复提醒的下次触发时间
 * - 处理提醒结果（成功/失败/跳过）
 */

import type { ReminderTemplate } from '../aggregates/reminder-template';
import type { IReminderTemplateRepository } from '../repositories/i-reminder-template-repository';
import { TriggerResult } from '@memoflow/contracts/reminder';
import type { ReminderTemplateControlService } from './reminder-template-control-service';

/**
 * 触发参数
 */
export interface ITriggerReminderParams {
  /** 提醒模板 */
  template: ReminderTemplate;
  /** 触发时间（默认当前时间） */
  triggerTime?: number;
  /** 触发原因（可选） */
  reason?: string;
}

/**
 * 触发结果
 */
export interface ITriggerReminderResult {
  /** 是否成功 */
  ok: boolean;
  /** 触发结果类型 */
  result: TriggerResult;
  /** 触发时间 */
  triggerTime: number;
  /** 下次触发时间（如果有重复） */
  nextTriggerTime: number | null;
  /** 消息 */
  message: string;
  /** 历史记录 UUID */
  historyId?: string;
}

/**
 * ReminderTriggerService
 */
export class ReminderTriggerService {
  constructor(
    private readonly templateRepository: IReminderTemplateRepository,
    private readonly controlService: ReminderTemplateControlService,
  ) {}

  /**
   * 触发提醒
   *
   * 流程：
   * 1. 检查模板是否真正启用
   * 2. 记录触发历史
   * 3. 更新统计数据
   * 4. 计算下次触发时间
   * 5. 保存模板
   */
  async triggerReminder(params: ITriggerReminderParams): Promise<ITriggerReminderResult> {
    const { template, triggerTime = Date.now() } = params;

    // 检查模板是否真正启用
    const isEnabled = await this.controlService.isTemplateEffectivelyEnabled(template);
    if (!isEnabled) {
      return {
        ok: false,
        result: TriggerResult.Skipped,
        triggerTime,
        nextTriggerTime: null,
        message: '模板未启用或被分组禁用',
      };
    }

    // 记录触发历史（成功）
    const history = template.createHistory({
      triggeredAt: triggerTime,
      result: TriggerResult.Success,
    });

    // 计算下次触发时间
    const nextTriggerTime = template.calculateNextTrigger();
    // The `calculateNextTrigger` method should update the internal state.
    // template.updateNextTriggerTime(nextTriggerTime);

    // 保存模板（包括历史记录）
    await this.templateRepository.save(template);

    return {
      ok: true,
      result: TriggerResult.Success,
      triggerTime,
      nextTriggerTime,
      message: '触发成功',
      historyId: history.id,
    };
  }

  /**
   * 记录触发失败
   */
  async recordTriggerFailure(
    template: ReminderTemplate,
    error: string,
    triggerTime: number = Date.now(),
  ): Promise<void> {
    template.createHistory({
      triggeredAt: triggerTime,
      result: TriggerResult.Failed,
      error: error,
    });

    await this.templateRepository.save(template);
  }

  /**
   * 记录触发跳过
   */
  async recordTriggerSkipped(
    template: ReminderTemplate,
    reason: string,
    triggerTime: number = Date.now(),
  ): Promise<void> {
    template.createHistory({
      triggeredAt: triggerTime,
      result: TriggerResult.Skipped,
      error: reason,
    });

    await this.templateRepository.save(template);
  }

  /**
   * 批量触发提醒
   */
  async triggerRemindersBatch(params: ITriggerReminderParams[]): Promise<ITriggerReminderResult[]> {
    const results: ITriggerReminderResult[] = [];

    for (const param of params) {
      try {
        const result = await this.triggerReminder(param);
        results.push(result);
      } catch (error) {
        results.push({
          ok: false,
          result: TriggerResult.Failed,
          triggerTime: param.triggerTime || Date.now(),
          nextTriggerTime: null,
          message: error instanceof Error ? error.message : '触发失败',
        });
      }
    }

    return results;
  }

  /**
   * 计算下次触发时间
   *
   * 基于当前触发时间和重复配置计算
   */
  calculateNextTriggerTime(template: ReminderTemplate, _currentTriggerTime: number): number | null {
    // Recurrence logic is now handled within the ReminderTemplate aggregate
    return template.calculateNextTrigger();
  }

}
