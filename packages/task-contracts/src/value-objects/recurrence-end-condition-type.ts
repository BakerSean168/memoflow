/**
 * 重复规则结束条件类型
 */
export const RecurrenceEndConditionType = {
  Never: 'Never', // 永不结束
  EndDate: 'EndDate', // 指定日期结束
  Occurrences: 'Occurrences', // 指定次数结束
} as const;

export type RecurrenceEndConditionType =
  (typeof RecurrenceEndConditionType)[keyof typeof RecurrenceEndConditionType];
