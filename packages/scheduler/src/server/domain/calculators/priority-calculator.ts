/**
 * Priority Calculator
 *
 * 优先级计算工具
 * 基于重要性（ImportanceLevel）和紧急性（UrgencyLevel）计算优先级权重
 *
 * 适用于：Goal、Task 等需要优先级排序的实体
 */

import { type ImportanceLevel, type UrgencyLevel, PriorityLevel } from '@memoflow/contracts/shared';

/**
 * 重要性权重映射
 */
export const IMPORTANCE_WEIGHTS: Record<ImportanceLevel, number> = {
  Vital: 5,
  Important: 4,
  Moderate: 3,
  Minor: 2,
  Trivial: 1,
};

/**
 * 紧急性权重映射
 */
export const URGENCY_WEIGHTS: Record<UrgencyLevel, number> = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  None: 1,
};

/**
 * 优先级计算选项
 */
export interface PriorityCalculationOptions {
  /** 重要性级别 */
  importance: ImportanceLevel;
  /** 紧急性级别 */
  urgency: UrgencyLevel;
  /** 截止时间（Unix 时间戳，毫秒） */
  dueDate?: number | null;
  /** 当前时间（Unix 时间戳，毫秒），默认为 Date.now() */
  currentTime?: number;
  /** 是否考虑时间因素，默认为 true */
  considerTime?: boolean;
}

/**
 * 优先级计算结果
 */
export interface PriorityCalculationResult {
  /** 基础权重（重要性 + 紧急性） */
  baseWeight: number;
  /** 时间权重（基于截止时间的额外权重） */
  timeWeight: number;
  /** 最终权重（基础权重 + 时间权重） */
  totalWeight: number;
  /** 优先级等级 */
  level: PriorityLevel;
  /** 优先级分数（0-100） */
  score: number;
}

/**
 * 计算优先级权重
 *
 * 计算逻辑：
 * 1. 基础权重 = 重要性权重 + 紧急性权重 (2-10)
 * 2. 时间权重 = 基于截止时间的额外权重 (0-5)
 *    - 已过期：+5
 *    - 距离截止不到1天：+4
 *    - 距离截止不到3天：+3
 *    - 距离截止不到7天：+2
 *    - 距离截止不到30天：+1
 * 3. 最终权重 = 基础权重 + 时间权重
 * 4. 优先级分数 = (最终权重 / 15) * 100
 *
 * @example
 * ```ts
 * const result = calculatePriority({
 *   importance: 'important',
 *   urgency: 'high',
 *   dueDate: Date.now() + 86400000, // 明天
 * });
 * console.log(result.level); // 'High'
 * console.log(result.score); // 86.67
 * ```
 */
export function calculatePriority(options: PriorityCalculationOptions): PriorityCalculationResult {
  const { importance, urgency, dueDate, currentTime = Date.now(), considerTime = true } = options;

  // 1. 计算基础权重
  const importanceWeight = IMPORTANCE_WEIGHTS[importance] || 0;
  const urgencyWeight = URGENCY_WEIGHTS[urgency] || 0;
  const baseWeight = importanceWeight + urgencyWeight;

  // 2. 计算时间权重
  let timeWeight = 0;
  if (considerTime && dueDate) {
    const timeRemaining = dueDate - currentTime;
    const daysRemaining = timeRemaining / (24 * 60 * 60 * 1000);

    if (daysRemaining < 0) {
      // 已过期
      timeWeight = 5;
    } else if (daysRemaining < 1) {
      // 距离截止不到1天
      timeWeight = 4;
    } else if (daysRemaining < 3) {
      // 距离截止不到3天
      timeWeight = 3;
    } else if (daysRemaining < 7) {
      // 距离截止不到7天
      timeWeight = 2;
    } else if (daysRemaining < 30) {
      // 距离截止不到30天
      timeWeight = 1;
    }
  }

  // 3. 计算最终权重
  const totalWeight = baseWeight + timeWeight;

  // 4. 确定优先级等级（5级系统）
  let level: PriorityLevel;
  if (totalWeight >= 14) {
    level = 'Critical';
  } else if (totalWeight >= 11) {
    level = 'High';
  } else if (totalWeight >= 8) {
    level = 'Medium';
  } else if (totalWeight >= 5) {
    level = 'Low';
  } else {
    level = 'None';
  }

  // 5. 计算分数（0-100）
  const score = Math.min(100, Math.round((totalWeight / 15) * 100));

  return {
    baseWeight,
    timeWeight,
    totalWeight,
    level,
    score,
  };
}

/**
 * 获取优先级徽章颜色
 */
export function getPriorityBadgeColor(level: PriorityLevel): string {
  const colorMap: Record<PriorityLevel, string> = {
    Critical: 'red',
    High: 'orange',
    Medium: 'yellow',
    Low: 'blue',
    None: 'gray',
  };
  return colorMap[level];
}

/**
 * 获取优先级文本
 */
export function getPriorityText(level: PriorityLevel): string {
  const textMap: Record<PriorityLevel, string> = {
    Critical: '紧急',
    High: '高优先级',
    Medium: '中优先级',
    Low: '低优先级',
    None: '无优先级',
  };
  return textMap[level];
}

/**
 * Residual 1180 keep-boundary: schedule comparePriority — options pair → totalWeight delta.
 * Computes weight via calculatePriority(importance/urgency/dueDate); not precomputed scores.
 * Soft residual 1180: goal comparePriority is number-score DailyPriority compare (no force-merge).
 *
 * 比较两个实体的优先级
 * 返回：
 * - 负数：a 的优先级高于 b
 * - 0：优先级相同
 * - 正数：b 的优先级高于 a
 */
export function comparePriority(
  a: PriorityCalculationOptions,
  b: PriorityCalculationOptions,
): number {
  const resultA = calculatePriority(a);
  const resultB = calculatePriority(b);
  return resultB.totalWeight - resultA.totalWeight;
}
