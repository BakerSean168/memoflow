/**
 * Schedule ID Value Object
 * 日程 ID 强类型（自 shared-primitives 迁回本域，Issue #630 §2.3）
 */
export type ScheduleId = string & { readonly __brand: 'ScheduleId' };
