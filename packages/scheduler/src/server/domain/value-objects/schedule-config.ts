/**
 * ScheduleConfig 值对象
 * 
 * 调度配置：Cron表达式、时区、日期范围、执行次数限制
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  IScheduleConfig,
  ScheduleConfigDTO,
  Timezone,
} from '@memoflow/contracts/schedule';
import { CronExpressionParser } from 'cron-parser';

/**
 * ScheduleConfig 值对象实现
 */
export class ScheduleConfig extends ValueObject<ScheduleConfigDTO> implements IScheduleConfig {

  private constructor(props: ScheduleConfigDTO) {
    super(props);
  }

  // ================= 工厂方法 =================
  
  public static create(props: ScheduleConfigDTO): ScheduleConfig {
    this.validate(props);
    return new ScheduleConfig(props);
  }

  public static createDefault(timezone: Timezone = 'Asia/Shanghai'): ScheduleConfig {
    return new ScheduleConfig({
      cronExpression: '0 9 * * *', // 每天9点
      timezone,
      startDate: null,
      endDate: null,
      maxExecutions: null,
    });
  }

  public static fromDTO(dto: ScheduleConfigDTO): ScheduleConfig {
    return new ScheduleConfig(dto);
  }

  // ================= 校验 =================
  
  private static validate(props: ScheduleConfigDTO): void {
    if (!props.timezone || props.timezone.trim().length === 0) {
      throw new Error('Timezone is required');
    }
    if (
      (props.cronExpression === null || props.cronExpression.trim().length === 0) &&
      props.startDate === null
    ) {
      throw new Error('Either cronExpression or startDate is required');
    }
  }

  // ================= Getters =================

  public get cronExpression(): string | null {
    return this.props.cronExpression;
  }

  public get timezone(): Timezone {
    return this.props.timezone;
  }

  public get startDate(): number | null {
    return this.props.startDate !== null ? new Date(this.props.startDate).getTime() : null;
  }

  public get endDate(): number | null {
    return this.props.endDate !== null ? new Date(this.props.endDate).getTime() : null;
  }

  public get maxExecutions(): number | null {
    return this.props.maxExecutions;
  }

  public calculateNextRun(afterTime: number = Date.now()): number | null {
    const earliestTime = this.startDate !== null ? Math.max(afterTime, this.startDate) : afterTime;

    if (this.props.cronExpression) {
      try {
        const interval = CronExpressionParser.parse(this.props.cronExpression, {
          currentDate: new Date(earliestTime),
          tz: this.props.timezone,
        });
        const nextRunAt = interval.next().toDate().getTime();

        if (this.endDate !== null && nextRunAt > this.endDate) {
          return null;
        }

        return nextRunAt;
      } catch (error) {
        console.error(`Failed to parse cron expression "${this.props.cronExpression}":`, error);
        return null;
      }
    }

    if (this.startDate !== null && this.startDate >= afterTime) {
      if (this.endDate !== null && this.startDate > this.endDate) {
        return null;
      }

      return this.startDate;
    }

    return null;
  }

  // ================= 行为方法 =================

  public with(
    updates: Partial<Omit<IScheduleConfig, 'equals' | 'with' | 'calculateNextRun' | 'isExpired' | 'toDTO'>>,
  ): ScheduleConfig {
    // 将 number 时间戳转换为 ISO string
    const convertedUpdates: Partial<ScheduleConfigDTO> = {};
    
    if (updates.cronExpression !== undefined) {
      convertedUpdates.cronExpression = updates.cronExpression;
    }
    if (updates.timezone !== undefined) {
      convertedUpdates.timezone = updates.timezone;
    }
    if (updates.startDate !== undefined) {
      convertedUpdates.startDate = updates.startDate !== null 
        ? new Date(updates.startDate).toISOString() 
        : null;
    }
    if (updates.endDate !== undefined) {
      convertedUpdates.endDate = updates.endDate !== null 
        ? new Date(updates.endDate).toISOString() 
        : null;
    }
    if (updates.maxExecutions !== undefined) {
      convertedUpdates.maxExecutions = updates.maxExecutions;
    }
    
    const newProps = { ...this.props, ...convertedUpdates };
    ScheduleConfig.validate(newProps);
    return new ScheduleConfig(newProps);
  }

  public setCronExpression(cron: string): ScheduleConfig {
    return this.with({ cronExpression: cron });
  }

  public setTimezone(timezone: Timezone): ScheduleConfig {
    return this.with({ timezone });
  }

  public setDateRange(startDate: number | null, endDate: number | null): ScheduleConfig {
    return this.with({ startDate, endDate });
  }

  // ================= 计算属性 =================

  public get hasStartDate(): boolean {
    return this.props.startDate !== null;
  }

  public get hasEndDate(): boolean {
    return this.props.endDate !== null;
  }

  public get hasExecutionLimit(): boolean {
    return this.props.maxExecutions !== null;
  }

  public get isExpired(): boolean {
    if (this.props.endDate === null) return false;
    return new Date(this.props.endDate).getTime() < Date.now();
  }

  // ================= 序列化 =================

  public toDTO(): ScheduleConfigDTO {
    return { ...this.props };
  }
}
