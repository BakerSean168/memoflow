/**
 * DoNotDisturbConfig 值对象
 * 
 * 勿扰模式配置：启用状态、时间范围、生效日期
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  DoNotDisturbConfig as IDoNotDisturbConfig,
  DoNotDisturbConfigDTO,
} from '@memoflow/contracts/notification';
import {
  addYmdDays,
  asHm,
  asInstant,
  combineYmdHmWithTimeZone,
  instantToHmInTimeZone,
  instantToYmdInTimeZone,
  type TimeContext,
} from '@memoflow/time';

/**
 * DoNotDisturbConfig 值对象实现
 */
export class DoNotDisturbConfig extends ValueObject<DoNotDisturbConfigDTO> implements IDoNotDisturbConfig {

  private constructor(props: DoNotDisturbConfigDTO) {
    super(props);
  }

  // ================= 工厂方法 =================
  
  public static create(props: DoNotDisturbConfigDTO): DoNotDisturbConfig {
    this.validate(props);
    return new DoNotDisturbConfig(props);
  }

  public static createDefault(): DoNotDisturbConfig {
    return new DoNotDisturbConfig({
      enabled: false,
      startTime: '22:00',
      endTime: '08:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // 每天
    });
  }

  public static createNightMode(): DoNotDisturbConfig {
    return new DoNotDisturbConfig({
      enabled: true,
      startTime: '23:00',
      endTime: '07:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
  }

  public static fromDTO(dto: DoNotDisturbConfigDTO): DoNotDisturbConfig {
    return new DoNotDisturbConfig(dto);
  }

  // ================= 校验 =================
  
  private static validate(props: DoNotDisturbConfigDTO): void {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(props.startTime)) {
      throw new Error('Invalid startTime format (expected HH:mm)');
    }
    if (!timeRegex.test(props.endTime)) {
      throw new Error('Invalid endTime format (expected HH:mm)');
    }
    if (!Array.isArray(props.daysOfWeek)) {
      throw new Error('daysOfWeek must be an array');
    }
    for (const day of props.daysOfWeek) {
      if (day < 0 || day > 6) {
        throw new Error('daysOfWeek values must be 0-6');
      }
    }
  }

  // ================= Getters =================

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get startTime(): string {
    return this.props.startTime;
  }

  public get endTime(): string {
    return this.props.endTime;
  }

  public get daysOfWeek(): number[] {
    return [...this.props.daysOfWeek];
  }

  // ================= 行为方法 =================

  public setEnabled(enabled: boolean): DoNotDisturbConfig {
    return new DoNotDisturbConfig({ ...this.props, enabled });
  }

  public setTimeRange(startTime: string, endTime: string): DoNotDisturbConfig {
    const newProps = { ...this.props, startTime, endTime };
    DoNotDisturbConfig.validate(newProps);
    return new DoNotDisturbConfig(newProps);
  }

  public setDaysOfWeek(daysOfWeek: number[]): DoNotDisturbConfig {
    const newProps = { ...this.props, daysOfWeek };
    DoNotDisturbConfig.validate(newProps);
    return new DoNotDisturbConfig(newProps);
  }

  // ================= 计算属性 =================

  public get isWeekdaysOnly(): boolean {
    const weekdays = [1, 2, 3, 4, 5];
    return this.props.daysOfWeek.length === 5 &&
      weekdays.every(d => this.props.daysOfWeek.includes(d));
  }

  public get isWeekendsOnly(): boolean {
    const weekends = [0, 6];
    return this.props.daysOfWeek.length === 2 &&
      weekends.every(d => this.props.daysOfWeek.includes(d));
  }

  public get isEveryDay(): boolean {
    return this.props.daysOfWeek.length === 7;
  }

  public isActiveAt(time: Date | number, timeContext: TimeContext): boolean {
    if (!this.props.enabled) return false;

    const instant = asInstant(time instanceof Date ? time.getTime() : time);
    const ymd = instantToYmdInTimeZone(instant, timeContext.timeZone);
    const [year, month, dayOfMonth] = String(ymd).split('-').map(Number);
    const day = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
    if (!this.props.daysOfWeek.includes(day)) return false;

    const [currentH, currentM] = String(
      instantToHmInTimeZone(instant, timeContext.timeZone),
    )
      .split(':')
      .map(Number);
    const currentMinutes = currentH * 60 + currentM;
    const [startH, startM] = this.props.startTime.split(':').map(Number);
    const [endH, endM] = this.props.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  /** Returns the first wall-clock instant at which the current DND window is inactive. */
  public nextInactiveAt(time: Date | number, timeContext: TimeContext): Date | null {
    if (!this.isActiveAt(time, timeContext)) return null;

    const instant = asInstant(time instanceof Date ? time.getTime() : time);
    const currentYmd = instantToYmdInTimeZone(instant, timeContext.timeZone);
    const [currentH, currentM] = String(
      instantToHmInTimeZone(instant, timeContext.timeZone),
    )
      .split(':')
      .map(Number);
    const currentMinutes = currentH * 60 + currentM;
    const [startH, startM] = this.props.startTime.split(':').map(Number);
    const [endH, endM] = this.props.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const endsNextCalendarDay =
      startMinutes >= endMinutes && currentMinutes >= startMinutes;
    const endYmd = endsNextCalendarDay ? addYmdDays(currentYmd, 1) : currentYmd;
    const resolved = combineYmdHmWithTimeZone(
      endYmd,
      asHm(this.props.endTime),
      timeContext.timeZone,
    );
    return resolved == null ? null : new Date(Number(resolved));
  }

  // ================= 序列化 =================

  public toDTO(): DoNotDisturbConfigDTO {
    return {
      enabled: this.props.enabled,
      startTime: this.props.startTime,
      endTime: this.props.endTime,
      daysOfWeek: [...this.props.daysOfWeek],
    };
  }
}
