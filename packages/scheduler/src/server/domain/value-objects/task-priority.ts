import { TaskPriority as TaskPriorityContract, type TaskPriority as ITaskPriority } from '@memoflow/contracts/schedule';

/**
 * 📝 任务优先级 - 调度任务的优先级
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type TaskPriority = ITaskPriority & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: ITaskPriority[] = Object.values(TaskPriorityContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const TaskPriority = {
  // ================= 常量定义 =================
  
  Low: 'Low' as TaskPriority,
  Normal: 'Normal' as TaskPriority,
  High: 'High' as TaskPriority,
  Urgent: 'Urgent' as TaskPriority,

  // ================= 工厂方法 =================

  of(value: string): TaskPriority {
    if (!this.isValid(value)) {
      throw new Error(`Invalid TaskPriority: ${value}`);
    }
    return value as TaskPriority;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is TaskPriority {
    return VALUES.includes(value as ITaskPriority);
  },

  // ================= 遍历方法 =================

  getAll(): TaskPriority[] {
    return VALUES as TaskPriority[];
  },

  // ================= 工具方法 =================

  /**
   * 获取优先级的数值
   */
  toNumber(value: TaskPriority): number {
    const priorityMap: Record<ITaskPriority, number> = {
      Low: 1,
      Normal: 2,
      High: 3,
      Urgent: 4,
    };
    return priorityMap[value as ITaskPriority];
  },

  /**
   * 判断是否为高优先级
   */
  isHighPriority(value: TaskPriority): boolean {
    return value === 'High' || value === 'Urgent';
  },

  /**
   * 判断是否为紧急优先级
   */
  isUrgent(value: TaskPriority): boolean {
    return value === 'Urgent';
  },
};
