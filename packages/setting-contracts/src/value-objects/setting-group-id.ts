/**
 * Setting Group ID Value Object
 * 设置分组 ID 强类型（自 shared-primitives 迁回本域，Issue #630 §2.3）
 */
export type SettingGroupId = string & { readonly __brand: 'SettingGroupId' };
