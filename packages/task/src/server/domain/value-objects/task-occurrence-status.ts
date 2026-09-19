import { TaskOccurrenceStatus as TaskOccurrenceStatusContract, type TaskOccurrenceStatus as ITaskOccurrenceStatus } from '@memoflow/contracts/task';

/**
 * 📝 任务实例状态 - 循环任务实例的生命周期状态
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type TaskOccurrenceStatus = ITaskOccurrenceStatus & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: ITaskOccurrenceStatus[] = Object.values(TaskOccurrenceStatusContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const TaskOccurrenceStatus = {
  // ================= 常量定义 =================
  
  Pending: 'Pending' as TaskOccurrenceStatus,
  InProgress: 'InProgress' as TaskOccurrenceStatus,
  Completed: 'Completed' as TaskOccurrenceStatus,
  Missed: 'Missed' as TaskOccurrenceStatus,
  Skipped: 'Skipped' as TaskOccurrenceStatus,

  // ================= 工厂方法 =================

  of(value: string): TaskOccurrenceStatus {
    if (!this.isValid(value)) {
      throw new Error(`Invalid TaskOccurrenceStatus: ${value}`);
    }
    return value as TaskOccurrenceStatus;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is TaskOccurrenceStatus {
    return VALUES.includes(value as ITaskOccurrenceStatus);
  },

  // ================= 遍历方法 =================

  getAll(): TaskOccurrenceStatus[] {
    return VALUES as TaskOccurrenceStatus[];
  },

  // ================= 工具方法 =================

  /**
   * 判断任务实例是否待处理
   */
  isPending(value: TaskOccurrenceStatus): boolean {
    return value === 'Pending';
  },

  /**
   * 判断任务实例是否进行中
   */
  isInProgress(value: TaskOccurrenceStatus): boolean {
    return value === 'InProgress';
  },

  /**
   * 判断任务实例是否已完成
   */
  isCompleted(value: TaskOccurrenceStatus): boolean {
    return value === 'Completed';
  },

  /**
   * 判断任务实例是否已跳过
   */
  isSkipped(value: TaskOccurrenceStatus): boolean {
    return value === 'Skipped';
  },

  /** 明确记录为 Missed，而不是由时钟自动推导。 */
  isMissed(value: TaskOccurrenceStatus): boolean {
    return value === 'Missed';
  },

  /** 终态事实：完成、明确 Missed 或豁免。 */
  isTerminated(value: TaskOccurrenceStatus): boolean {
    return value === 'Completed' || value === 'Missed' || value === 'Skipped';
  },

  /** 未决状态仍需要处理；overdue 与此状态正交。 */
  needsAction(value: TaskOccurrenceStatus): boolean {
    return value === 'Pending' || value === 'InProgress';
  },
};
