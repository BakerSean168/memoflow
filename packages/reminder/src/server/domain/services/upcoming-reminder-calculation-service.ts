/**
 * UpcomingReminderCalculationService - 即将到来的提醒计算服务
 *
 * 职责：
 * - 计算指定时间范围内的提醒触发时间
 * - 支持各种类型的提醒（一次性、循环、间隔）
 * - 支持过滤和排序
 *
 * @architecture
 * - 领域服务层（Domain Service）
 * - 纯函数式设计，无状态
 * - 与业务逻辑耦合最小化
 */

import {
  ReminderType,
  ReminderStatus,
  TriggerType,
} from '@memoflow/contracts/reminder';
import type {
  FixedTimeTrigger,
  IntervalTrigger,
  ReminderTemplateServerDTO,
  TriggerConfigDTO,
  UpcomingReminderDTO,
} from '@memoflow/contracts/reminder';
import { InvalidTimezoneError } from '../errors/reminder-errors';

const REMINDER_CALCULATION_DEBUG =
  typeof process !== 'undefined' && process.env.DEBUG_REMINDER_CALCULATION === 'true';

function debugUpcomingReminderCalculation(message: string, payload?: unknown): void {
  if (!REMINDER_CALCULATION_DEBUG) {
    return;
  }

  if (payload === undefined) {
    console.log(message);
    return;
  }

  console.log(message, payload);
}

/**
 * 即将到来的提醒计算服务
 */
export class UpcomingReminderCalculationService {
  /**
   * 计算即将到来的提醒列表
   *
   * @param reminders 启用的提醒模板列表
   * @param options 计算选项
   * @returns 即将到来的提醒 DTO 数组（已排序）
   */
  static calculateUpcomingReminders(
    reminders: ReminderTemplateServerDTO[],
    options: {
      days?: number; // 向后查看天数，默认 1（今天内）
      limit?: number; // 返回的最大条数，默认 50
      afterTime?: number; // 从某个时间之后开始，默认当前时间
      timezone?: string | null; // 时区
    } = {},
  ): UpcomingReminderDTO[] {
    const {
      days = 1, // 默认今天内
      limit = 50,
      afterTime = Date.now(),
      timezone = null,
    } = options;

    if (timezone) {
      this.validateTimezone(timezone);
    }

    debugUpcomingReminderCalculation('📊 [UpcomingReminderCalculation] 开始计算', {
      remindersCount: reminders.length,
      days,
      limit,
      afterTime: new Date(afterTime).toISOString(),
      endTime: new Date(afterTime + days * 24 * 60 * 60 * 1000).toISOString(),
      timezone,
    });

    // 计算查询范围
    const endTime = afterTime + days * 24 * 60 * 60 * 1000;

    const upcomingReminders: UpcomingReminderDTO[] = [];

    // 为每个提醒计算接下来的触发时间
    for (const reminder of reminders) {
      debugUpcomingReminderCalculation(
        `📝 [UpcomingReminderCalculation] 处理提醒: ${reminder.name}`,
        {
          id: reminder.id,
          type: reminder.type,
          triggerType: reminder.trigger.type,
          selfEnabled: reminder.selfEnabled,
          status: reminder.status,
          nextTriggerAt: reminder.nextTriggerAt
            ? new Date(reminder.nextTriggerAt).toISOString()
            : null,
          activeTime: {
            activatedAt: new Date(reminder.activeTime.activatedAt).toISOString(),
          },
        },
      );

      // 检查该提醒是否已经有计算的 nextTriggerAt 且在范围内
      if (
        reminder.nextTriggerAt &&
        reminder.nextTriggerAt >= afterTime &&
        reminder.nextTriggerAt <= endTime
      ) {
        debugUpcomingReminderCalculation(
          `✅ [UpcomingReminderCalculation] 使用已有的 nextTriggerAt: ${reminder.name}`,
          {
            nextTriggerAt: new Date(reminder.nextTriggerAt).toISOString(),
          },
        );
        const dto = this.convertToUpcomingDTO(reminder, afterTime, timezone);
        if (dto) {
          upcomingReminders.push(dto);
        }
      } else {
        // nextTriggerAt 不存在、已过期、或超出范围 -> 重新计算
        const reason = !reminder.nextTriggerAt
          ? '没有 nextTriggerAt'
          : reminder.nextTriggerAt < afterTime
            ? 'nextTriggerAt 已过期'
            : 'nextTriggerAt 超出范围';

        debugUpcomingReminderCalculation(
          `🔍 [UpcomingReminderCalculation] 重新计算触发时间: ${reminder.name}`,
          {
            reason,
            oldNextTriggerAt: reminder.nextTriggerAt
              ? new Date(reminder.nextTriggerAt).toISOString()
              : null,
          },
        );

        const nextTrigger = this.calculateNextTriggerTime(reminder, afterTime);
        debugUpcomingReminderCalculation(
          `🔍 [UpcomingReminderCalculation] 计算结果: ${reminder.name}`,
          {
            nextTrigger: nextTrigger ? new Date(nextTrigger).toISOString() : null,
            inRange: nextTrigger ? nextTrigger >= afterTime && nextTrigger <= endTime : false,
          },
        );

        if (nextTrigger && nextTrigger >= afterTime && nextTrigger <= endTime) {
          const dto = this.convertToUpcomingDTO(
            { ...reminder, nextTriggerAt: nextTrigger },
            afterTime,
            timezone,
          );
          if (dto) {
            upcomingReminders.push(dto);
          }
        } else if (nextTrigger) {
          debugUpcomingReminderCalculation(
            `⚠️  [UpcomingReminderCalculation] 计算的 nextTrigger 也超出范围: ${reminder.name}`,
            {
              nextTrigger: new Date(nextTrigger).toISOString(),
              afterTime: new Date(afterTime).toISOString(),
              endTime: new Date(endTime).toISOString(),
            },
          );
        }
      }
    }

    // 按触发时间排序
    upcomingReminders.sort((a, b) => a.nextTriggerAt - b.nextTriggerAt);

    // 限制返回的数量
    return upcomingReminders.slice(0, limit);
  }

  /**
   * 计算单个提醒的下一次触发时间
   *
   * @param reminder 提醒模板
   * @param afterTime 从这个时间之后开始查找，默认当前时间
   * @returns 下一次触发的时间戳（epoch ms），如果不需要触发则返回 null
   */
  static calculateNextTriggerTime(
    reminder: ReminderTemplateServerDTO,
    afterTime: number = Date.now(),
  ): number | null {
    try {
      // 检查提醒是否已启用且激活
      if (!reminder.selfEnabled || reminder.status !== ReminderStatus.Active) {
        return null;
      }

      // 检查提醒是否在活跃期内
      const activeTime = reminder.activeTime;
      if (afterTime < activeTime.activatedAt) {
        // 还未到激活时间
        return activeTime.activatedAt;
      }
      // 重构后：移除 endDate 检查，生效控制由 status 字段负责

      // 根据提醒类型计算
      if (reminder.type === ReminderType.OneTime) {
        return this.calculateOneTimeTrigger(reminder, afterTime);
      } else if (reminder.type === ReminderType.Recurring) {
        return this.calculateRecurringTrigger(reminder, afterTime);
      }

      return null;
    } catch (error) {
      if (error instanceof InvalidTimezoneError) {
        throw error;
      }
      console.error(`[UpcomingReminderCalculationService] 计算提醒 ${reminder.id} 失败:`, error);
      return null;
    }
  }

  /**
   * 校验 timezone 是否为有效的 IANA 时区或 UTC/null。
   * 如果 timezone 非空且无效，抛出 Error (fail-fast)。
   */
  public static validateTimezone(timezone?: string | null): void {
    if (!timezone) {
      return;
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new InvalidTimezoneError(timezone);
    }
  }

  private static getZonedEpochMs(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    timezone?: string | null,
  ): number {
    if (!timezone) {
      return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
    }
    this.validateTimezone(timezone);
    if (timezone === 'UTC') {
      return Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    }

    let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    for (let i = 0; i < 3; i++) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(new Date(utcGuess));
      const bag: Record<string, number> = {};
      for (const p of parts) {
        if (p.type !== 'literal') {
          bag[p.type] = parseInt(p.value, 10);
        }
      }
      const h = (bag.hour ?? 0) % 24;
      const asUtc = Date.UTC(bag.year, (bag.month ?? 1) - 1, bag.day ?? 1, h, bag.minute ?? 0, 0, 0);
      const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
      const delta = desired - asUtc;
      if (delta === 0) break;
      utcGuess += delta;
    }
    return utcGuess;
  }

  /**
   * 计算一次性提醒的触发时间
   */
  private static calculateOneTimeTrigger(
    reminder: ReminderTemplateServerDTO,
    afterTime: number,
  ): number | null {
    const trigger = reminder.trigger as TriggerConfigDTO;

    if (trigger.type === TriggerType.FixedTime && trigger.fixedTime) {
      const [hourStr, minuteStr] = trigger.fixedTime.time.split(':');
      const targetHour = parseInt(hourStr, 10);
      const targetMinute = parseInt(minuteStr, 10);
      const tz = trigger.fixedTime.timezone ?? 'UTC';

      this.validateTimezone(tz);

      let y: number, m: number, d: number;
      if (tz !== 'UTC') {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hourCycle: 'h23',
        });
        const parts = formatter.formatToParts(new Date(reminder.activeTime.activatedAt));
        const bag: Record<string, number> = {};
        for (const p of parts) {
          if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
        }
        y = bag.year;
        m = bag.month;
        d = bag.day;
      } else {
        const dateObj = new Date(reminder.activeTime.activatedAt);
        y = dateObj.getUTCFullYear();
        m = dateObj.getUTCMonth() + 1;
        d = dateObj.getUTCDate();
      }

      const triggerTime = this.getZonedEpochMs(y, m, d, targetHour, targetMinute, tz);

      if (triggerTime >= afterTime) {
        return triggerTime;
      }
    }

    return null;
  }

  /**
   * 计算循环提醒的触发时间
   */
  private static calculateRecurringTrigger(
    reminder: ReminderTemplateServerDTO,
    afterTime: number,
  ): number | null {
    const trigger = reminder.trigger as TriggerConfigDTO;

    if (trigger.type === TriggerType.FixedTime && trigger.fixedTime) {
      return this.calculateNextFixedTimeTrigger(reminder, trigger.fixedTime, afterTime);
    } else if (trigger.type === TriggerType.Interval && trigger.interval) {
      return this.calculateNextIntervalTrigger(reminder, trigger.interval, afterTime);
    }

    return null;
  }

  /**
   * 计算下一次固定时间触发
   */
  private static calculateNextFixedTimeTrigger(
    reminder: ReminderTemplateServerDTO,
    fixedTime: FixedTimeTrigger,
    afterTime: number,
  ): number | null {
    const [hourStr, minuteStr] = fixedTime.time.split(':');
    const targetHour = parseInt(hourStr, 10);
    const targetMinute = parseInt(minuteStr, 10);
    const tz = fixedTime.timezone ?? 'UTC';

    this.validateTimezone(tz);

    let startYear: number;
    let startMonth: number;
    let startDay: number;

    if (tz !== 'UTC') {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(new Date(afterTime));
      const bag: Record<string, number> = {};
      for (const p of parts) {
        if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
      }
      startYear = bag.year;
      startMonth = bag.month;
      startDay = bag.day;
    } else {
      const d = new Date(afterTime);
      startYear = d.getUTCFullYear();
      startMonth = d.getUTCMonth() + 1;
      startDay = d.getUTCDate();
    }

    const baseUtc = Date.UTC(startYear, startMonth - 1, startDay);

    for (let daysOffset = 0; daysOffset < 365; daysOffset++) {
      const curDate = new Date(baseUtc + daysOffset * 86400000);
      const y = curDate.getUTCFullYear();
      const m = curDate.getUTCMonth() + 1;
      const d = curDate.getUTCDate();

      const triggerTime = this.getZonedEpochMs(y, m, d, targetHour, targetMinute, tz);

      if (triggerTime >= afterTime) {
        return triggerTime;
      }
    }

    return null;
  }

  /**
   * 计算下一次间隔触发
   */
  private static calculateNextIntervalTrigger(
    reminder: ReminderTemplateServerDTO,
    interval: IntervalTrigger,
    afterTime: number,
  ): number | null {
    const intervalMs = interval.minutes * 60 * 1000;
    const startTime = reminder.activeTime.activatedAt;

    debugUpcomingReminderCalculation(`🔢 [calculateNextIntervalTrigger] 计算间隔触发`, {
      name: reminder.name,
      intervalMinutes: interval.minutes,
      intervalMs,
      startTime: new Date(startTime).toISOString(),
      afterTime: new Date(afterTime).toISOString(),
    });

    // 从激活时间开始，每隔 N 分钟触发一次
    const elapsed = afterTime - startTime;
    const nextIntervalCount = Math.ceil(elapsed / intervalMs);
    const nextTriggerTime = startTime + nextIntervalCount * intervalMs;

    debugUpcomingReminderCalculation(`🔢 [calculateNextIntervalTrigger] 计算详情`, {
      name: reminder.name,
      elapsed: `${elapsed}ms (${Math.floor(elapsed / 1000 / 60)}分钟)`,
      nextIntervalCount,
      nextTriggerTime: new Date(nextTriggerTime).toISOString(),
      nextTriggerTimeMs: nextTriggerTime,
    });

    // 重构后：移除 endDate 检查，生效控制由 status 字段负责
    debugUpcomingReminderCalculation(
      `✅ [calculateNextIntervalTrigger] 返回下次触发时间: ${reminder.name}`,
      {
        nextTriggerTime: new Date(nextTriggerTime).toISOString(),
      },
    );
    return nextTriggerTime;
  }

  /**
   * 将 ReminderTemplate 转换为前端友好的 UpcomingReminder DTO
   */
  private static convertToUpcomingDTO(
    reminder: ReminderTemplateServerDTO,
    baseTime: number = Date.now(),
    effectiveTimezone?: string | null,
  ): UpcomingReminderDTO | null {
    if (!reminder.nextTriggerAt) {
      return null;
    }

    const nextTriggerAt = reminder.nextTriggerAt;
    const daysUntilTrigger = Math.ceil((nextTriggerAt - baseTime) / (24 * 60 * 60 * 1000));

    const tz =
      reminder.trigger.type === TriggerType.FixedTime
        ? (reminder.trigger.fixedTime?.timezone ?? 'UTC')
        : (effectiveTimezone ?? 'UTC');

    return {
      templateId: reminder.id,
      title: reminder.name,
      description: reminder.description ?? undefined,
      type: reminder.type,
      triggerType: reminder.trigger.type,
      importanceLevel: reminder.importanceLevel,
      nextTriggerAt,
      nextTriggerDisplay: this.formatDateTime(nextTriggerAt, tz),
      daysUntilTrigger,
      icon: reminder.icon || 'mdi-bell',
      color: reminder.color || '#1976D2',
      notificationChannels: reminder.notificationConfig?.channels || [],
    };
  }

  /**
   * 格式化时间戳为可读字符串（按指定 IANA 时区格式化，禁止依赖宿主进程 TZ）
   */
  private static formatDateTime(timestamp: number, timezone?: string | null): string {
    const tz = timezone || 'UTC';
    this.validateTimezone(tz);

    if (tz === 'UTC') {
      const d = new Date(timestamp);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const minutes = String(d.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(timestamp));
    const bag: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
    }
    const yearStr = String(bag.year);
    const monthStr = String(bag.month).padStart(2, '0');
    const dayStr = String(bag.day).padStart(2, '0');
    let hourNum = bag.hour;
    if (hourNum === 24) hourNum = 0;
    const hourStr = String(hourNum).padStart(2, '0');
    const minuteStr = String(bag.minute).padStart(2, '0');

    return `${yearStr}-${monthStr}-${dayStr} ${hourStr}:${minuteStr}`;
  }

  /**
   * 计算今日内所有提醒的所有触发时间点（作息时间表）
   * 返回一个完整的今日时间表，包含所有提醒的触发时间
   * @param reminders 启用的提醒模板列表
   * @param options 计算选项
   * @returns 今日内所有触发时间点的完整列表（按时间排序）
   */
  static calculateTodaySchedule(
    reminders: ReminderTemplateServerDTO[],
    options: {
      maxItemsPerReminder?: number; // 每个提醒最多显示多少个触发点，默认 20
      includeExpired?: boolean; // 是否包含已过期的时间点，默认 false
      timezone?: string | null; // 时区，默认 null
      now?: number; // 基准时间，默认 Date.now()
    } = {},
  ): UpcomingReminderDTO[] {
    const { maxItemsPerReminder = 20, includeExpired = false, timezone = null, now = Date.now() } = options;

    if (timezone) {
      this.validateTimezone(timezone);
    }

    // 优先使用 options.timezone；若无显式 options.timezone，则默认 UTC（绝不改用 host 进程 TZ 或隐式首模板时区）
    const effectiveTz = timezone && timezone.trim().length > 0 ? timezone : 'UTC';

    // 获取今天的开始和结束时间（按指定时区或模板时区计算）
    const todayStart = this.getTodayStart(now, effectiveTz);
    const todayEnd = this.getTodayEnd(now, effectiveTz);

    debugUpcomingReminderCalculation('📅 [calculateTodaySchedule] 计算今日作息表', {
      todayStart: new Date(todayStart).toISOString(),
      todayEnd: new Date(todayEnd).toISOString(),
      now: new Date(now).toISOString(),
      remindersCount: reminders.length,
      includeExpired,
      timezone: effectiveTz,
    });

    const allTriggerTimes: UpcomingReminderDTO[] = [];

    // 为每个提醒计算今天的所有触发时间
    for (const reminder of reminders) {
      // 检查提醒是否启用且在活跃期内
      if (!reminder.selfEnabled || reminder.status !== ReminderStatus.Active) {
        continue;
      }

      // 检查提醒是否在活跃期内（今天）
      if (reminder.activeTime.activatedAt > todayEnd) {
        debugUpcomingReminderCalculation(
          `⏭️  [calculateTodaySchedule] 提醒还未激活: ${reminder.name}`,
          {
            activatedAt: new Date(reminder.activeTime.activatedAt).toISOString(),
          },
        );
        continue;
      }
      // 重构后：移除 endDate 检查，生效控制由 status 字段负责

      // 计算该提醒在今天的所有触发时间
      const todayTriggerTimes = this.calculateReminderTriggerTimesToday(
        reminder,
        todayStart,
        todayEnd,
        maxItemsPerReminder,
        effectiveTz,
      );

      debugUpcomingReminderCalculation(
        `📍 [calculateTodaySchedule] ${reminder.name} 在今天的触发次数: ${todayTriggerTimes.length}`,
        {
          times: todayTriggerTimes.map((dto) => dto.nextTriggerDisplay),
        },
      );

      allTriggerTimes.push(...todayTriggerTimes);
    }

    debugUpcomingReminderCalculation(
      `📊 [calculateTodaySchedule] 总计算出 ${allTriggerTimes.length} 个时间点`,
    );

    // 按时间排序
    allTriggerTimes.sort((a, b) => a.nextTriggerAt - b.nextTriggerAt);

    // 如果不包含过期时间点，进行过滤
    if (!includeExpired) {
      const filtered = allTriggerTimes.filter((item) => item.nextTriggerAt >= now);
      debugUpcomingReminderCalculation(`🔄 [calculateTodaySchedule] 过滤过期时间点`, {
        总数: allTriggerTimes.length,
        过滤后: filtered.length,
      });
      return filtered;
    }

    return allTriggerTimes;
  }

  /**
   * 计算单个提醒在今天的所有触发时间
   */
  private static calculateReminderTriggerTimesToday(
    reminder: ReminderTemplateServerDTO,
    todayStart: number,
    todayEnd: number,
    maxItems: number,
    effectiveTimezone?: string | null,
  ): UpcomingReminderDTO[] {
    const result: UpcomingReminderDTO[] = [];
    const trigger = reminder.trigger as TriggerConfigDTO;

    if (trigger.type === TriggerType.FixedTime && trigger.fixedTime) {
      // 固定时间触发：在今天的特定时间触发
      const triggerTimes = this.generateFixedTimeTriggersForToday(
        reminder,
        trigger.fixedTime,
        todayStart,
        todayEnd,
      );
      result.push(...triggerTimes.slice(0, maxItems));
    } else if (trigger.type === TriggerType.Interval && trigger.interval) {
      // 间隔触发：在今天的多个时间点触发
      const triggerTimes = this.generateIntervalTriggersForToday(
        reminder,
        trigger.interval,
        todayStart,
        todayEnd,
        maxItems,
        effectiveTimezone,
      );
      result.push(...triggerTimes);
    }

    return result;
  }

  /**
   * 生成固定时间在今天的触发时间
   */
  private static generateFixedTimeTriggersForToday(
    reminder: ReminderTemplateServerDTO,
    fixedTime: FixedTimeTrigger,
    todayStart: number,
    todayEnd: number,
  ): UpcomingReminderDTO[] {
    const result: UpcomingReminderDTO[] = [];

    // null 时区 = 显式默认 'UTC'，不改用宿主/环境/其他模板时区
    const tz = fixedTime.timezone ?? 'UTC';
    this.validateTimezone(tz);

    const [hourStr, minuteStr] = fixedTime.time.split(':');
    const targetHour = parseInt(hourStr, 10);
    const targetMinute = parseInt(minuteStr, 10);

    const getParts = (ts: number): { year: number; month: number; day: number } => {
      if (tz === 'UTC') {
        const d = new Date(ts);
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      } else {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hourCycle: 'h23',
        });
        const parts = formatter.formatToParts(new Date(ts));
        const bag: Record<string, number> = {};
        for (const p of parts) {
          if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
        }
        return { year: bag.year, month: bag.month, day: bag.day };
      }
    };

    const startParts = getParts(todayStart);
    const endParts = getParts(todayEnd);

    const datesToCheck = [startParts];
    if (
      endParts.year !== startParts.year ||
      endParts.month !== startParts.month ||
      endParts.day !== startParts.day
    ) {
      datesToCheck.push(endParts);
    }

    for (const { year, month, day } of datesToCheck) {
      let triggerTime: number;
      if (tz === 'UTC') {
        triggerTime = Date.UTC(year, month - 1, day, targetHour, targetMinute, 0, 0);
      } else {
        triggerTime = this.getZonedEpochMs(year, month, day, targetHour, targetMinute, tz);
      }

      if (triggerTime >= todayStart && triggerTime <= todayEnd) {
        const dto = this.convertToUpcomingDTO(
          { ...reminder, nextTriggerAt: triggerTime },
          Date.now(),
          tz,
        );
        if (dto && !result.some((item) => item.nextTriggerAt === dto.nextTriggerAt)) {
          result.push(dto);
        }
      }
    }

    return result;
  }

  /**
   * 生成间隔触发在今天的所有时间点
   */
  private static generateIntervalTriggersForToday(
    reminder: ReminderTemplateServerDTO,
    interval: IntervalTrigger,
    todayStart: number,
    todayEnd: number,
    maxItems: number,
    effectiveTimezone?: string | null,
  ): UpcomingReminderDTO[] {
    const result: UpcomingReminderDTO[] = [];
    const intervalMs = interval.minutes * 60 * 1000;
    const reminderStartTime = reminder.activeTime.activatedAt;

    debugUpcomingReminderCalculation(`⏰ [generateIntervalTriggersForToday] ${reminder.name}`, {
      intervalMinutes: interval.minutes,
      reminderStartTime: new Date(reminderStartTime).toISOString(),
      todayStart: new Date(todayStart).toISOString(),
      todayEnd: new Date(todayEnd).toISOString(),
    });

    // 计算从提醒开始时间到今天开始的间隔数
    const elapsedSinceReminder = todayStart - reminderStartTime;
    const firstIntervalCount = Math.max(0, Math.ceil(elapsedSinceReminder / intervalMs));

    // 生成今天所有的触发时间
    let currentIntervalCount = firstIntervalCount;
    while (result.length < maxItems) {
      const triggerTime = reminderStartTime + currentIntervalCount * intervalMs;

      // 如果超出今天范围，停止
      if (triggerTime > todayEnd) {
        break;
      }

      // 如果在今天范围内，添加到结果
      if (triggerTime >= todayStart && triggerTime <= todayEnd) {
        const dto = this.convertToUpcomingDTO(
          { ...reminder, nextTriggerAt: triggerTime },
          Date.now(),
          effectiveTimezone,
        );
        if (dto) {
          result.push(dto);
        }
      }

      currentIntervalCount++;
    }

    debugUpcomingReminderCalculation(
      `✅ [generateIntervalTriggersForToday] ${reminder.name} 生成 ${result.length} 个触发点`,
      {
        times: result.map((r) => r.nextTriggerDisplay),
      },
    );
    return result;
  }

  /**
   * 获取今天的开始时间（00:00:00，指定时区或默认 UTC）
   */
  public static getTodayStart(timestamp: number = Date.now(), timezone?: string | null): number {
    const tz = timezone || 'UTC';
    this.validateTimezone(tz);
    if (tz === 'UTC') {
      const d = new Date(timestamp);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(timestamp));
    const bag: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
    }
    return this.getZonedEpochMs(bag.year, bag.month, bag.day, 0, 0, tz);
  }

  /**
   * 获取今天的结束时间（23:59:59.999，指定时区或默认 UTC）
   */
  public static getTodayEnd(timestamp: number = Date.now(), timezone?: string | null): number {
    const tz = timezone || 'UTC';
    this.validateTimezone(tz);
    if (tz === 'UTC') {
      const d = new Date(timestamp);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(timestamp));
    const bag: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
    }
    return this.getZonedEpochMs(bag.year, bag.month, bag.day, 23, 59, tz) + 59999;
  }
}
