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
  IAIUsageReadPort,
  IKnowledgeIndexRepository,
  IAIProviderOnboardingCommitPort,
  IAIProviderOnboardingSessionRepository,
  IAIProviderSecretVault,
} from '../application/ports';
import {
  AIConversationPrismaRepository,
  AIExecutionRecordPrismaAdapter,
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
  readonly providerOnboardingSessionRepository: IAIProviderOnboardingSessionRepository;
  readonly providerOnboardingCommitPort: IAIProviderOnboardingCommitPort;
  readonly providerSecretVault: IAIProviderSecretVault;
}

export function createAIPrismaRepositories(db: PrismaClient): AIPrismaRepositorySet {
  return {
    agentInstanceRepository: new AgentInstancePrismaRepository(db),
    conversationRepository: new AIConversationPrismaRepository(db),
    providerConfigRepository: new AIProviderConfigPrismaRepository(db),
    knowledgeIndexRepository: new AIKnowledgeIndexPrismaRepository(db),
    executionRecordPort: new AIExecutionRecordPrismaAdapter(db),
    providerOnboardingSessionRepository: new AIProviderOnboardingSessionPrismaRepository(db),
    providerOnboardingCommitPort: new AIProviderOnboardingCommitPrismaAdapter(db),
    providerSecretVault: new AIProviderSecretPrismaVault(db),
  };
}
