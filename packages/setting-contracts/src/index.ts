/**
 * Setting Module Exports
 * 设置模块 - 统一导出
 *
 * Canonical Setting contracts. Legacy UserSetting aggregate/category surfaces
 * are retired. 真身自 @memoflow/contracts/modules/setting 迁入（Issue #630 §4.9）。
 */

// ============ Value Objects ============
export * from './value-objects';

// ============ Domain Events ============
export * from './domain';

// ============ Protocol ============
export * from './protocol';

// ============ API ============
export * from './api';

// ============ Preferences ============
export * from './preferences';
