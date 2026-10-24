import {
  ConflictSeverity as ConflictSeverityContract,
  type ConflictSeverity as IConflictSeverity,
} from '@memoflow/contracts/schedule';

/**
 * 📝 冲突严重程度 - 日程冲突的严重程度分类
 *
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type ConflictSeverity = IConflictSeverity & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IConflictSeverity[] = Object.values(ConflictSeverityContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const ConflictSeverity = {
  // ================= 常量定义 =================

  Minor: 'Minor' as ConflictSeverity,
  Moderate: 'Moderate' as ConflictSeverity,
  Severe: 'Severe' as ConflictSeverity,

  // ================= 工厂方法 =================

  of(value: string): ConflictSeverity {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ConflictSeverity: ${value}`);
    }
    return value as ConflictSeverity;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is ConflictSeverity {
    return VALUES.includes(value as IConflictSeverity);
  },

  // ================= 遍历方法 =================

  getAll(): ConflictSeverity[] {
    return VALUES as ConflictSeverity[];
  },

  // ================= 工具方法 =================

  /**
   * 获取严重程度的数值（1-3）
   */
  toNumber(value: ConflictSeverity): number {
    const severityMap: Record<IConflictSeverity, number> = {
      Minor: 1,
      Moderate: 2,
      Severe: 3,
    };
    return severityMap[value as IConflictSeverity];
  },

  /**
   * 判断是否为严重冲突
   */
  isSevere(value: ConflictSeverity): boolean {
    return value === 'Severe';
  },

  /**
   * 判断是否需要立即处理
   */
  needsImmediate(value: ConflictSeverity): boolean {
    return value === 'Severe' || value === 'Moderate';
  },
};
