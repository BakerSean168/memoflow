/**
 * AI Module - Application Server
 *
 * AI 模块应用服务
 */

// Use Cases
export * from './use-cases';
export * from './ports';
export {
  AIConversationPortableCapability,
  createAIConversationPortableCapability,
} from './ai-conversation-portability';
export {
  AIConversationMessagesPortableCapability,
  createAIConversationMessagesPortableCapability,
  deriveImportedMessageId,
  type AiMessageArchive,
  type AiMessageArchiveLoader,
  type AIConversationMessagesPortabilityDependencies,
} from './ai-conversation-messages-portability';
export type {
  AIEvaluationOperationsPort,
  AIKnowledgePort,
  AIProviderManagementPort,
  AssistantConversationPort,
} from './ai.application.capabilities';
