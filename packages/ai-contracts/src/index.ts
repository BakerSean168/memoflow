/**
 * AI Module Exports
 * AI模块 - 统一导出
 */

// ============ Aggregates ============
export * from './aggregates';

// ============ Entities ============
export * from './entities';

// ============ Value Objects ============
export * from './value-objects';

// ============ Domain Events ============
export * from './domain/events';

// ============ Protocol ============
export * from './protocol';

// ============ Configs ============
export * from './configs';

// ============ API ============
export * from './api';

// ============ DTOs ============
export * from './dtos';

// ============ Invocation Context ============
export * from './context';

// ============ Owner-driven Data Portability V3 ============
export * from './portable-v3';
export * from './portable-v3-messages';
// The archive canonicalizer is served from
// `@memoflow/ai-contracts/portable-messages-archive` (node:crypto), not this barrel.

export type {
  AiConversationId,
  AiProviderConfigId,
  AiProviderConnectionId,
  AIProviderCredentialRef,
} from './ids';
