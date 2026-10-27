/**
 * Setting Entry ID Value Object
 * 设置项 ID 强类型（自 shared-primitives 迁回本域，Issue #630 §2.3）
 */
export type SettingEntryId = string & { readonly __brand: 'SettingEntryId' };
