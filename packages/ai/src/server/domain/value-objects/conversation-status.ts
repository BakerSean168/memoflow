import { ConversationStatus as ConversationStatusContract, type ConversationStatus as IConversationStatus } from '@memoflow/contracts/ai';

/**
 * ConversationStatus 枚举类型
 * 
 * 【规范说明：枚举与常量对象规范】
 * 参考 docs/standards/枚举与常量对象规范(Enum&Constant-Objects).md
 * 
 * 核心原则：
 * 1. 使用 const object as const，不使用 TypeScript enum
 * 2. Key 和 Value 使用 PascalCase
 * 3. 格式：Active: 'Active' 一一对应
 */

/**
 * AI 对话状态 - 对话生命周期状态
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type ConversationStatus = IConversationStatus & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IConversationStatus[] = Object.values(ConversationStatusContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 * 没有 this，所有行为方法第一个参数都是该 Type 的实例
 */
export const ConversationStatus = {
  // ================= 常量定义 =================
  
  Active: 'Active' as ConversationStatus,
  Archived: 'Archived' as ConversationStatus,

  // ================= 工厂方法 =================

  /**
   * 🏭 工厂方法：验证并转换
   * 接受任意 string，返回安全的 ConversationStatus
   * @throws 当输入值不在合法值列表中时
   */
  of(value: string): ConversationStatus {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ConversationStatus: ${value}`);
    }
    return value as ConversationStatus;
  },

  // ================= 类型守卫 =================

  /**
   * 🛡️ 类型守卫：运行时类型检查
   * 用于条件判断时的类型细化
   */
  isValid(value: string): value is ConversationStatus {
    return VALUES.includes(value as IConversationStatus);
  },

  /**
   * 📋 获取所有可用值
   * 用于前端渲染下拉框、状态管理等场景
   */
  getAll(): ConversationStatus[] {
    return VALUES as ConversationStatus[];
  },

  // ================= 行为方法 (State Logic) =================

  /**
   * 是否为活跃状态
   */
  isActive(status: ConversationStatus): boolean {
    return status === this.Active;
  },

  /**
   * 是否为已存档状态
   */
  isArchived(status: ConversationStatus): boolean {
    return status === this.Archived;
  },
};
