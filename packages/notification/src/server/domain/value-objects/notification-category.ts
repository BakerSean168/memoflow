import {
  NotificationCategory as NotificationCategoryContract,
  type NotificationCategory as INotificationCategory,
} from '@memoflow/notification-contracts';

/**
 * 📝 通知分类 - 通知所属的业务分类
 *
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type NotificationCategory = INotificationCategory & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: INotificationCategory[] = Object.values(NotificationCategoryContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const NotificationCategory = {
  // ================= 常量定义 =================

  Task: 'Task' as NotificationCategory,
  Goal: 'Goal' as NotificationCategory,
  Schedule: 'Schedule' as NotificationCategory,
  Reminder: 'Reminder' as NotificationCategory,
  Account: 'Account' as NotificationCategory,
  System: 'System' as NotificationCategory,
  Other: 'Other' as NotificationCategory,

  // ================= 工厂方法 =================

  of(value: string): NotificationCategory {
    if (!this.isValid(value)) {
      throw new Error(`Invalid NotificationCategory: ${value}`);
    }
    return value as NotificationCategory;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is NotificationCategory {
    return VALUES.includes(value as INotificationCategory);
  },

  // ================= 遍历方法 =================

  getAll(): NotificationCategory[] {
    return VALUES as NotificationCategory[];
  },

  // ================= 工具方法 =================

  /**
   * 判断是否为系统类通知
   */
  isSystemCategory(value: NotificationCategory): boolean {
    return value === 'System';
  },

  /**
   * 判断是否为业务相关通知（非系统通知）
   */
  isBusiness(value: NotificationCategory): boolean {
    return value !== 'System' && value !== 'Other';
  },
};
