/**
 * 冲突严重程度
 * 基于重叠时长定义日程冲突的严重程度
 */
export const ConflictSeverity = {
  Minor: 'Minor', // 轻微冲突 - 重叠时长 < 15 分钟
  Moderate: 'Moderate', // 中度冲突 - 重叠时长 15-60 分钟
  Severe: 'Severe', // 严重冲突 - 重叠时长 > 60 分钟或完全重叠
} as const;

export type ConflictSeverity = (typeof ConflictSeverity)[keyof typeof ConflictSeverity];
