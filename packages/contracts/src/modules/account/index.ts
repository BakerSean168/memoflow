/**
 * Account Module Contracts
 * 账户模块 - 契约层
 *
 * Residual 661: empty dual entities/dtos barrel re-exports retired.
 * AccountClient/Server DTOs live under aggregates; API under api/.
 */

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
