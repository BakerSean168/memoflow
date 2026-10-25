import {
  TaskTimeType as TaskTimeTypeContract,
  type TaskTimeType as ITaskTimeType,
} from '@memoflow/contracts/task';

/**
 * 📝 任务时间类型 - 任务的时间类型
 *
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type TaskTimeType = ITaskTimeType & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: ITaskTimeType[] = Object.values(TaskTimeTypeContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const TaskTimeType = {
  // ================= 常量定义 =================

  AllDay: 'AllDay' as TaskTimeType,
  TimePoint: 'TimePoint' as TaskTimeType,
  TimeRange: 'TimeRange' as TaskTimeType,

  // ================= 工厂方法 =================

  of(value: string): TaskTimeType {
    if (!this.isValid(value)) {
      throw new Error(`Invalid TaskTimeType: ${value}`);
    }
    return value as TaskTimeType;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is TaskTimeType {
    return VALUES.includes(value as ITaskTimeType);
  },

  // ================= 遍历方法 =================

  getAll(): TaskTimeType[] {
    return VALUES as TaskTimeType[];
  },

  // ================= 工具方法 =================

  /**
   * 判断是否为全天任务
   */
  isAllDay(value: TaskTimeType): boolean {
    return value === 'AllDay';
  },

  /**
   * 判断是否为时间点任务
   */
  isTimePoint(value: TaskTimeType): boolean {
    return value === 'TimePoint';
  },

  /**
   * 判断是否为时间段任务
   */
  isTimeRange(value: TaskTimeType): boolean {
    return value === 'TimeRange';
  },

  /**
   * 判断是否为有具体时间的任务（非全天）
   */
  hasSpecificTime(value: TaskTimeType): boolean {
    return value === 'TimePoint' || value === 'TimeRange';
  },

  /**
   * 判断是否为有时间范围的任务
   */
  hasTimeRange(value: TaskTimeType): boolean {
    return value === 'TimeRange';
  },
};
