import { TaskPlanStatus as TaskPlanStatusContract, type TaskPlanStatus as ITaskPlanStatus } from '@memoflow/contracts/task';

/**
 * 📝 任务模板状态 - 任务模板的生命周期状态
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type TaskPlanStatus = ITaskPlanStatus & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: ITaskPlanStatus[] = Object.values(TaskPlanStatusContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const TaskPlanStatus = {
  // ================= 常量定义 =================
  
  Active: 'Active' as TaskPlanStatus,
  Paused: 'Paused' as TaskPlanStatus,
  Closed: 'Closed' as TaskPlanStatus,

  // ================= 工厂方法 =================

  of(value: string): TaskPlanStatus {
    if (!this.isValid(value)) {
      throw new Error(`Invalid TaskPlanStatus: ${value}`);
    }
    return value as TaskPlanStatus;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is TaskPlanStatus {
    return VALUES.includes(value as ITaskPlanStatus);
  },

  // ================= 遍历方法 =================

  getAll(): TaskPlanStatus[] {
    return VALUES as TaskPlanStatus[];
  },

  // ================= 工具方法 =================

  /**
   * 判断模板是否活跃
   */
  isActive(value: TaskPlanStatus): boolean {
    return value === 'Active';
  },

  /**
   * 判断模板是否暂停
   */
  isPaused(value: TaskPlanStatus): boolean {
    return value === 'Paused';
  },

  /** 判断计划是否已关闭。 */
  isClosed(value: TaskPlanStatus): boolean {
    return value === 'Closed';
  },

  /** Active / Paused are open lifecycle states. */
  isAvailable(value: TaskPlanStatus): boolean {
    return value === 'Active' || value === 'Paused';
  },

  /**
   * 判断模板是否可执行（活跃）
   */
  isExecutable(value: TaskPlanStatus): boolean {
    return value === 'Active';
  },
};
