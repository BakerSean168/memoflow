import { ScheduleTaskStatus as ScheduleTaskStatusContract, type ScheduleTaskStatus as IScheduleTaskStatus } from '@memoflow/contracts/schedule';

/**
 * 📝 调度任务状态 - 调度任务的生命周期状态
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type ScheduleTaskStatus = IScheduleTaskStatus & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IScheduleTaskStatus[] = Object.values(ScheduleTaskStatusContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const ScheduleTaskStatus = {
  // ================= 常量定义 =================
  
  Active: 'Active' as ScheduleTaskStatus,
  Paused: 'Paused' as ScheduleTaskStatus,
  Completed: 'Completed' as ScheduleTaskStatus,
  Cancelled: 'Cancelled' as ScheduleTaskStatus,
  Failed: 'Failed' as ScheduleTaskStatus,

  // ================= 工厂方法 =================

  of(value: string): ScheduleTaskStatus {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ScheduleTaskStatus: ${value}`);
    }
    return value as ScheduleTaskStatus;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is ScheduleTaskStatus {
    return VALUES.includes(value as IScheduleTaskStatus);
  },

  // ================= 遍历方法 =================

  getAll(): ScheduleTaskStatus[] {
    return VALUES as ScheduleTaskStatus[];
  },

  // ================= 工具方法 =================

  /**
   * 判断任务是否活跃
   */
  isActive(value: ScheduleTaskStatus): boolean {
    return value === 'Active';
  },

  /**
   * 判断任务是否暂停
   */
  isPaused(value: ScheduleTaskStatus): boolean {
    return value === 'Paused';
  },

  /**
   * 判断任务是否已完成
   */
  isCompleted(value: ScheduleTaskStatus): boolean {
    return value === 'Completed';
  },

  /**
   * 判断任务是否已终止（完成、取消或失败）
   */
  isTerminated(value: ScheduleTaskStatus): boolean {
    return value === 'Completed' || value === 'Cancelled' || value === 'Failed';
  },

  /**
   * 判断任务是否可执行（活跃）
   */
  isExecutable(value: ScheduleTaskStatus): boolean {
    return value === 'Active';
  },
};
