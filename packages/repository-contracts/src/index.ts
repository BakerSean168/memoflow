/**
 * Repository Module Exports
 * 仓库模块 - 统一导出
 *
 * Knowledge connection / Local Vault / projection contracts only.
 * Empty legacy entities/value-objects/dtos barrels were removed.
 */

// ============ Strong-typed IDs (migrated from shared-primitives, #630 §4.7) ============
export * from './ids';

// ============ Aggregates ============
export * from './aggregates';

// ============ Domain Events ============
export * from './domain';

// ============ Protocol ============
export * from './protocol';

// ============ API ============
export * from './api';
