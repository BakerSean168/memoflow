/**
 * Setting History ID Value Object
 * 设置历史 ID 强类型（自 shared-primitives 迁回本域，Issue #630 §2.3）
 */
export type SettingHistoryId = string & { readonly __brand: 'SettingHistoryId' };
