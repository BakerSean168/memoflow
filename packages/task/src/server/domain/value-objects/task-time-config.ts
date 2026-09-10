/**
 * TaskTimeConfig 值对象
 *
 * 【规范说明：Class 类型值对象 - 参考 domain-class-value-object-spec.md】
 *
 * 任务时间配置：时间类型、开始日期、时间点/时间范围
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  TaskTimeConfig as ITaskTimeConfig,
  TaskTimeConfigDTO,
  TaskTimeType,
} from '@memoflow/contracts/task';
import type { Instant } from '@memoflow/contracts/primitives';

/**
 * TaskTimeConfig 值对象实现
 *
 * 包含：
 * - timeType: 时间类型（AllDay, TimePoint, TimeRange）
 * - startDate: 开始日期（存储为时间戳）
 * - timePoint: 具体时间点（分钟数，如 540 表示 9:00）
 * - timeRange: 时间范围（可选，{ start, end } 分钟数）
 */
export class TaskTimeConfig extends ValueObject<TaskTimeConfigDTO> implements ITaskTimeConfig {
  private constructor(props: TaskTimeConfigDTO) {
    super(props);
  }

  // ================= 工厂方法 1: 标准创建 =================
  /**
   * 创建新的值对象（包含校验）
   */
  public static create(props: TaskTimeConfigDTO): TaskTimeConfig {
    this.validate(props);
    return new TaskTimeConfig(props);
  }

  // ================= 工厂方法 2: 创建全天任务 =================
  /**
   * 创建全天任务
   */
  public static createAllDay(startDate: Instant | Date): TaskTimeConfig {
    const instant = startDate instanceof Date ? startDate.getTime() : startDate;
    return new TaskTimeConfig({
      timeType: 'AllDay',
      startDate: instant,
      timePoint: null,
      timeRange: null,
    });
  }

  // ================= 工厂方法 3: 创建时间点任务 =================
  /**
   * 创建时间点任务
   * @param startDate 日期
   * @param timePoint 时间点（分钟数，如 540 表示 9:00）
   */
  public static createTimePoint(startDate: Instant | Date, timePoint: number): TaskTimeConfig {
    const instant = startDate instanceof Date ? startDate.getTime() : startDate;
    return new TaskTimeConfig({
      timeType: 'TimePoint',
      startDate: instant,
      timePoint,
      timeRange: null,
    });
  }

  // ================= 工厂方法 4: 创建时间段任务 =================
  /**
   * 创建时间段任务
   * @param startDate 日期
   * @param start 开始时间（分钟数）
   * @param end 结束时间（分钟数）
   */
  public static createTimeRange(
    startDate: Instant | Date,
    start: number,
    end: number,
  ): TaskTimeConfig {
    const instant = startDate instanceof Date ? startDate.getTime() : startDate;
    return new TaskTimeConfig({
      timeType: 'TimeRange',
      startDate: instant,
      timePoint: null,
      timeRange: { start, end },
    });
  }

  // ================= 工厂方法 5: 从 DTO 恢复 =================
  /**
   * 从 DTO 恢复值对象
   */
  public static fromDTO(dto: TaskTimeConfigDTO): TaskTimeConfig {
    return TaskTimeConfig.create(dto);
  }

  // ================= 内部校验逻辑 =================
  /**
   * 集中校验逻辑
   */
  private static validate(props: TaskTimeConfigDTO): void {
    // 时间点任务必须有时间点
    if (props.timeType === 'TimePoint' && props.timePoint === null) {
      throw new Error('TimePoint task requires timePoint');
    }

    // 时间段任务必须有时间范围
    if (props.timeType === 'TimeRange' && !props.timeRange) {
      throw new Error('TimeRange task requires timeRange');
    }

    // 时间点范围校验：0-1439 分钟
    if (props.timePoint !== null && (props.timePoint < 0 || props.timePoint > 1439)) {
      throw new Error('Time point must be between 0-1439 minutes');
    }

    // 时间范围校验
    if (props.timeRange) {
      if (props.timeRange.start < 0 || props.timeRange.start > 1439) {
        throw new Error('Time range start must be between 0-1439 minutes');
      }
      if (props.timeRange.end < 0 || props.timeRange.end > 1439) {
        throw new Error('Time range end must be between 0-1439 minutes');
      }
      if (props.timeRange.start >= props.timeRange.end) {
        throw new Error('Time range start must be before end');
      }
    }
  }

  // ================= Getters（只读暴露）=================

  public get timeType(): TaskTimeType {
    return this.props.timeType;
  }

  public get startDate(): Instant | null {
    return this.props.startDate;
  }

  public get timePoint(): number | null {
    return this.props.timePoint;
  }

  public get timeRange(): { start: number; end: number } | null | undefined {
    return this.props.timeRange ? { ...this.props.timeRange } : null;
  }

  // ================= 行为方法（不可变变更）=================

  /**
   * 设置开始日期
   */
  public setStartDate(startDate: Instant | Date | null): TaskTimeConfig {
    const instant =
      startDate == null ? null : startDate instanceof Date ? startDate.getTime() : startDate;
    const newProps = {
      ...this.props,
      startDate: instant,
    };
    TaskTimeConfig.validate(newProps);
    return new TaskTimeConfig(newProps);
  }

  /**
   * 设置时间点
   */
  public setTimePoint(timePoint: number | null): TaskTimeConfig {
    const newProps = { ...this.props, timePoint };
    TaskTimeConfig.validate(newProps);
    return new TaskTimeConfig(newProps);
  }

  // ================= 计算属性（Rich Logic）=================

  /**
   * 是否为全天任务
   */
  public get isAllDay(): boolean {
    return this.props.timeType === 'AllDay';
  }

  /**
   * 是否为时间点任务
   */
  public get isTimePoint(): boolean {
    return this.props.timeType === 'TimePoint';
  }

  /**
   * 是否为时间段任务
   */
  public get isTimeRange(): boolean {
    return this.props.timeType === 'TimeRange';
  }

  /**
   * 是否有日期
   */
  public get hasDate(): boolean {
    return this.props.startDate !== null;
  }

  /**
   * 获取时间点的格式化字符串（如 "09:00"）
   */
  public getTimePointFormatted(): string | null {
    if (this.props.timePoint === null) return null;
    const hours = Math.floor(this.props.timePoint / 60);
    const minutes = this.props.timePoint % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * 获取时间范围的格式化字符串（如 "09:00 - 10:30"）
   */
  public getTimeRangeFormatted(): string | null {
    if (!this.props.timeRange) return null;
    const formatTime = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    return `${formatTime(this.props.timeRange.start)} - ${formatTime(this.props.timeRange.end)}`;
  }

  /**
   * 获取时间段时长（分钟）
   */
  public getDurationMinutes(): number | null {
    if (!this.props.timeRange) return null;
    return this.props.timeRange.end - this.props.timeRange.start;
  }

  // ================= 序列化方法 =================

  /**
   * 转换为 DTO（用于 API 传输或前端展示）
   */
  public toDTO(): TaskTimeConfigDTO {
    return {
      timeType: this.props.timeType,
      startDate: this.props.startDate,
      timePoint: this.props.timePoint,
      timeRange: this.props.timeRange ? { ...this.props.timeRange } : null,
    };
  }
}
