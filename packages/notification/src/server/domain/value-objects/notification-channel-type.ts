import {
  NotificationChannelType as NotificationChannelTypeContract,
  type NotificationChannelType as INotificationChannelType,
} from '@memoflow/notification-contracts';

/**
 * 📝 通知渠道类型 - 通知的投递渠道
 *
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type NotificationChannelType = INotificationChannelType & {
  readonly __brand: unique symbol;
};

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/transport-contracts).
const VALUES: INotificationChannelType[] = Object.values(NotificationChannelTypeContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const NotificationChannelType = {
  // ================= 常量定义 =================

  InApp: 'InApp' as NotificationChannelType,
  Email: 'Email' as NotificationChannelType,
  Push: 'Push' as NotificationChannelType,
  Desktop: 'Desktop' as NotificationChannelType,
  Sms: 'Sms' as NotificationChannelType,
  Webhook: 'Webhook' as NotificationChannelType,

  // ================= 工厂方法 =================

  of(value: string): NotificationChannelType {
    if (!this.isValid(value)) {
      throw new Error(`Invalid NotificationChannelType: ${value}`);
    }
    return value as NotificationChannelType;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is NotificationChannelType {
    return VALUES.includes(value as INotificationChannelType);
  },

  // ================= 遍历方法 =================

  getAll(): NotificationChannelType[] {
    return VALUES as NotificationChannelType[];
  },

  // ================= 工具方法 =================

  /**
   * 判断是否为实时渠道（立即投递）
   */
  isRealtime(value: NotificationChannelType): boolean {
    // Desktop is realtime per architecture decision A: delivered immediately by the
    // desktop durable worker through the Electron transport (native notification).
    return value === 'InApp' || value === 'Push' || value === 'Sms' || value === 'Desktop';
  },

  /**
   * 判断是否为异步渠道
   */
  isAsync(value: NotificationChannelType): boolean {
    return value === 'Email' || value === 'Webhook';
  },
};
