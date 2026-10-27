/**
 * @memoflow/account-contracts
 * 账户模块 - 契约层（真身自 @memoflow/contracts/modules/account 迁入，Issue #630 §4.8）
 *
 * Residual 661: empty dual entities/dtos barrel re-exports retired.
 * AccountClient/Server DTOs live under aggregates; API under api/.
 */

// ============ Ports ============
export * from './account-active-checker';

// ============ Aggregates ============
export * from './aggregates';

// ============ Value Objects ============
export * from './value-objects';

// ============ Domain Events ============
export * from './domain/events';

// ============ Protocol ============
export * from './protocol';

// ============ API Requests/Responses ============
export * from './api';

// ============ Data Portability V3 ============
export * from './portable-v3';
export * from './business-data-summary';
