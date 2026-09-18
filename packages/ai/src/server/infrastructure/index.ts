/**
 * AI Module — Infrastructure Server exports.
 * AI 模块 — 基础设施服务端导出。
 *
 * Re-exports the composition root, adapters, and runtime composition roots.
 * 重新导出组合根、适配器与运行时组合根。
 *
 * AI-VNEXT-07: legacy chat-execution, turn-engine, workflow, proposal-kernel,
 * capability-resolver, model-gateway and assistant-facade exports are removed —
 * Mastra is the only runtime.
 */

// ---------------------------------------------------------------------------
// Composition Root (canonical entry point)
// 组合根（规范入口）
// ---------------------------------------------------------------------------
export {
  createAIModule,
  type AIModuleDependencies,
  type AIModuleInstance,
  type AITransportModuleInstance,
  type AIModuleServices,
  type AIModuleRuntimeContribution,
  type AIRuntimeContributionsInput,
} from './ai.module';
export type {
  AIEvaluationOperationsPort,
  AIKnowledgePort,
  AIProviderManagementPort,
  AssistantConversationPort,
} from '../application';

// ---------------------------------------------------------------------------
// PowerSync convenience factory
// PowerSync 便捷工厂
// ---------------------------------------------------------------------------
export { createAIPowerSyncRepositories, type AIPowerSyncRepositorySet } from './powersync';

// ---------------------------------------------------------------------------
// Prisma convenience factory
// Prisma 便捷工厂
// ---------------------------------------------------------------------------
export { createAIPrismaRepositories, type AIPrismaRepositorySet } from './prisma';

// ---------------------------------------------------------------------------
// One-time vNext migration bridges
// ---------------------------------------------------------------------------
export { ConversationShellSource } from './migrations/conversation-shell.source';

// ---------------------------------------------------------------------------
// Ports (Interfaces)
// ---------------------------------------------------------------------------
export { type IAIConversationRepository } from '../domain';
export { type IAIProviderConfigRepository } from '../domain';

// ---------------------------------------------------------------------------
// Filesystem Adapters
// ---------------------------------------------------------------------------
export {
  AIEvaluationReportFileAdapter,
  type AIEvaluationReportFileAdapterOptions,
} from './adapters/fs';

// ---------------------------------------------------------------------------
// OpenAI-compatible BYOK gateway + chat execution adapter (Mastra-only runtime)
// OpenAI-compatible BYOK gateway + chat execution adapter（Mastra-only runtime）
// ---------------------------------------------------------------------------
export { OpenAICompatibleChatExecutionAdapter } from './adapters/openai-compatible-chat-execution.adapter';
export { OpenAICompatibleGateway } from './gateways/openai-compatible.gateway';
export { OpenAICompatibleModelCatalogGateway } from './gateways/openai-compatible-model-catalog.gateway';
