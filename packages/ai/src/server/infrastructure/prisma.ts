import { ConversationEventsPostgres } from './adapters/prisma/conversation-events.postgres';
import { AttentionEventsPostgres } from './adapters/prisma/attention-events.postgres';
/**
 * AI Module — Prisma persistence ingredients for the API lane.
 *
 * AI-VNEXT-07 keeps only product-owned persistence. AgentRun/LangGraph
 * checkpoint stores are retired because Mastra owns runtime execution state.
 */

import type { PrismaClient } from '@memoflow/database';
import { AgentInstancePrismaRepository } from './adapters/prisma/agent-instance.repository';
import type { IAgentInstanceRepository } from '../application/agent-instance/agent-instance.repository';
import type { IAIConversationRepository } from '../domain/repositories/i-ai-conversation-repository';
import type { IAIProviderConfigRepository } from '../domain/repositories/i-ai-provider-config-repository';
import type {
  IAIExecutionRecordPort,
  IConversationAttentionPort,
  IAIUsageReadPort,
  IKnowledgeIndexRepository,
  IAIProviderOnboardingCommitPort,
  IAIProviderOnboardingSessionRepository,
  IAIProviderSecretVault,
} from '../application/ports';
import {
  AIConversationPrismaRepository,
  AIExecutionRecordPrismaAdapter,
  ConversationAttentionPrismaAdapter,
  AIKnowledgeIndexPrismaRepository,
  AIProviderConfigPrismaRepository,
  AIProviderOnboardingCommitPrismaAdapter,
  AIProviderOnboardingSessionPrismaRepository,
  AIProviderSecretPrismaVault,
} from './adapters/prisma';

export interface AIPrismaRepositorySet {
  readonly agentInstanceRepository: IAgentInstanceRepository;
  readonly conversationRepository: IAIConversationRepository;
  readonly providerConfigRepository: IAIProviderConfigRepository;
  readonly knowledgeIndexRepository: IKnowledgeIndexRepository;
  readonly executionRecordPort: IAIExecutionRecordPort & IAIUsageReadPort;
  readonly conversationAttentionPort: IConversationAttentionPort;
  readonly providerOnboardingSessionRepository: IAIProviderOnboardingSessionRepository;
  readonly providerOnboardingCommitPort: IAIProviderOnboardingCommitPort;
  readonly providerSecretVault: IAIProviderSecretVault;
}

export function createAIPrismaRepositories(
  db: PrismaClient,
  eventsConfig?: { connectionString: string; businessSchema?: string },
): AIPrismaRepositorySet {
  return {
    agentInstanceRepository: new AgentInstancePrismaRepository(db),
    conversationRepository: new AIConversationPrismaRepository(
      db,
      eventsConfig ? new ConversationEventsPostgres(eventsConfig) : undefined,
    ),
    providerConfigRepository: new AIProviderConfigPrismaRepository(db),
    knowledgeIndexRepository: new AIKnowledgeIndexPrismaRepository(db),
    executionRecordPort: new AIExecutionRecordPrismaAdapter(db),
    conversationAttentionPort: new ConversationAttentionPrismaAdapter(
      db,
      eventsConfig ? new AttentionEventsPostgres(eventsConfig) : undefined,
    ),
    providerOnboardingSessionRepository: new AIProviderOnboardingSessionPrismaRepository(db),
    providerOnboardingCommitPort: new AIProviderOnboardingCommitPrismaAdapter(db),
    providerSecretVault: new AIProviderSecretPrismaVault(db),
  };
}
