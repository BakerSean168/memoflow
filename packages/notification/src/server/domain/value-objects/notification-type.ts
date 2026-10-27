import {
  NotificationType as NotificationTypeContract,
  type NotificationType as INotificationType,
} from '@memoflow/notification-contracts';

/**
 * 📝 通知类型 - 通知的分类类型
 *
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type NotificationType = INotificationType & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/transport-contracts).
const VALUES: INotificationType[] = Object.values(NotificationTypeContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 * 没有 this，所有行为方法第一个参数都是该 Type 的实例
 */
export const NotificationType = {
  // ================= 常量定义 =================

  Info: 'Info' as NotificationType,
  Success: 'Success' as NotificationType,
  Warning: 'Warning' as NotificationType,
  Error: 'Error' as NotificationType,
  Reminder: 'Reminder' as NotificationType,
  System: 'System' as NotificationType,
  Social: 'Social' as NotificationType,

  // ================= 工厂方法 =================

  /**
   * 🏭 工厂方法：验证并转换
   * 接受任意 string，返回安全的 NotificationType
   * @throws 当输入值不在合法值列表中时
   */
  of(value: string): NotificationType {
    if (!this.isValid(value)) {
      throw new Error(`Invalid NotificationType: ${value}`);
    }
    return value as NotificationType;
  },

  // ================= 类型守卫 =================

  /**
   * 类型守卫：检查值是否为有效的 NotificationType
   * 用于类型缩小（Type Narrowing）
   */
  isValid(value: string): value is NotificationType {
    return VALUES.includes(value as INotificationType);
  },

  // ================= 遍历方法 =================

  /**
   * 获取所有有效值
   */
  getAll(): NotificationType[] {
    return VALUES as NotificationType[];
  },

  // ================= 工具方法 =================

  /**
   * 判断是否为系统类通知
   */
  isSystemType(value: NotificationType): boolean {
    return value === 'System';
  },

  /**
   * 判断是否为错误类通知
   */
  isError(value: NotificationType): boolean {
    return value === 'Error';
  },
};
