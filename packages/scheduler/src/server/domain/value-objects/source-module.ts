import { SourceModule as SourceModuleContract, type SourceModule as ISourceModule } from '@memoflow/contracts/schedule';

/**
 * 📝 来源模块 - 调度任务的源模块
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type SourceModule = ISourceModule & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: ISourceModule[] = Object.values(SourceModuleContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const SourceModule = {
  // ================= 常量定义 =================
  
  Reminder: 'Reminder' as SourceModule,
  Task: 'Task' as SourceModule,
  Goal: 'Goal' as SourceModule,
  Notification: 'Notification' as SourceModule,
  System: 'System' as SourceModule,
  Custom: 'Custom' as SourceModule,

  // ================= 工厂方法 =================

  of(value: string): SourceModule {
    if (!this.isValid(value)) {
      throw new Error(`Invalid SourceModule: ${value}`);
    }
    return value as SourceModule;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is SourceModule {
    return VALUES.includes(value as ISourceModule);
  },

  // ================= 遍历方法 =================

  getAll(): SourceModule[] {
    return VALUES as SourceModule[];
  },

  // ================= 工具方法 =================

  /**
   * 判断是否为系统任务
   */
  isSystem(value: SourceModule): boolean {
    return value === 'System';
  },

  /**
   * 判断是否为业务模块任务
   */
  isBusiness(value: SourceModule): boolean {
    return value !== 'System' && value !== 'Custom';
  },

  /**
   * 判断是否为自定义任务
   */
  isCustom(value: SourceModule): boolean {
    return value === 'Custom';
  },
};
