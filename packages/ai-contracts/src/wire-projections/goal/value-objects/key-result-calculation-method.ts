// AI-owned wire projection; validation retained from the owner contract at extraction.
/**
 * 关键结果聚合计算方式
 */
export const KeyResultCalculationMethod = {
  Sum: "Sum", // 求和（默认，适合累计型）
  Average: "Average", // 求平均（适合平均值型）
  Max: "Max", // 求最大值（适合峰值型）
  Min: "Min", // 求最小值（适合低值型）
  Last: "Last", // 取最后一次（适合绝对值型）
} as const;

export type KeyResultCalculationMethod =
  (typeof KeyResultCalculationMethod)[keyof typeof KeyResultCalculationMethod];
