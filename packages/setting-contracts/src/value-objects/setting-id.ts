/**
 * Setting ID Value Object
 * 设置 ID 强类型（自 shared-primitives 迁回本域，Issue #630 §2.3）
 */
export type SettingId = string & { readonly __brand: 'SettingId' };
