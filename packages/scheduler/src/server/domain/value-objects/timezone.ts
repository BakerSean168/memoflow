import { Timezone as TimezoneContract, type Timezone as ITimezone } from '@memoflow/contracts/schedule';

/**
 * 📝 时区 - 常用的时区列表
 * 
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type Timezone = ITimezone & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: ITimezone[] = Object.values(TimezoneContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const Timezone = {
  // ================= 常量定义 =================
  
  UTC: 'UTC' as Timezone,
  Shanghai: 'Asia/Shanghai' as Timezone,
  Tokyo: 'Asia/Tokyo' as Timezone,
  NewYork: 'America/New_York' as Timezone,
  London: 'Europe/London' as Timezone,

  // ================= 工厂方法 =================

  of(value: string): Timezone {
    if (!this.isValid(value)) {
      throw new Error(`Invalid Timezone: ${value}`);
    }
    return value as Timezone;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is Timezone {
    return VALUES.includes(value as ITimezone);
  },

  // ================= 遍历方法 =================

  getAll(): Timezone[] {
    return VALUES as Timezone[];
  },

  // ================= 工具方法 =================

  /**
   * 获取时区的 UTC 偏移量（小时）
   */
  getUtcOffset(value: Timezone): number {
    const offsetMap: Record<ITimezone, number> = {
      'UTC': 0,
      'Asia/Shanghai': 8,
      'Asia/Tokyo': 9,
      'America/New_York': -5,
      'Europe/London': 0,
    };
    return offsetMap[value as ITimezone];
  },

  /**
   * 判断是否为亚洲时区
   */
  isAsia(value: Timezone): boolean {
    return value === 'Asia/Shanghai' || value === 'Asia/Tokyo';
  },

  /**
   * 判断是否为美国时区
   */
  isAmerica(value: Timezone): boolean {
    return value === 'America/New_York';
  },

  /**
   * 判断是否为欧洲时区
   */
  isEurope(value: Timezone): boolean {
    return value === 'Europe/London';
  },
};
