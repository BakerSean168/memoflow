import { ExecutionStatus as ExecutionStatusContract, type ExecutionStatus as IExecutionStatus } from '@memoflow/contracts/schedule';

/**
 * 📝 执行状态 - 调度任务执行的状态
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type ExecutionStatus = IExecutionStatus & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IExecutionStatus[] = Object.values(ExecutionStatusContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const ExecutionStatus = {
  // ================= 常量定义 =================
  
  Success: 'Success' as ExecutionStatus,
  Failed: 'Failed' as ExecutionStatus,
  Skipped: 'Skipped' as ExecutionStatus,
  Timeout: 'Timeout' as ExecutionStatus,
  Retrying: 'Retrying' as ExecutionStatus,

  // ================= 工厂方法 =================

  of(value: string): ExecutionStatus {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ExecutionStatus: ${value}`);
    }
    return value as ExecutionStatus;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is ExecutionStatus {
    return VALUES.includes(value as IExecutionStatus);
  },

  // ================= 遍历方法 =================

  getAll(): ExecutionStatus[] {
    return VALUES as ExecutionStatus[];
  },

  // ================= 工具方法 =================

  /**
   * 判断执行是否成功
   */
  isSuccess(value: ExecutionStatus): boolean {
    return value === 'Success';
  },

  /**
   * 判断执行是否失败
   */
  isFailed(value: ExecutionStatus): boolean {
    return value === 'Failed' || value === 'Timeout';
  },

  /**
   * 判断执行是否完成（成功或失败）
   */
  isCompleted(value: ExecutionStatus): boolean {
    return value === 'Success' || value === 'Failed' || value === 'Skipped' || value === 'Timeout';
  },

  /**
   * 判断执行是否仍在进行
   */
  isInProgress(value: ExecutionStatus): boolean {
    return value === 'Retrying';
  },

  /**
   * 判断执行是否超时
   */
  isTimeout(value: ExecutionStatus): boolean {
    return value === 'Timeout';
  },
};
