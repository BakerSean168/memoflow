import { ConversationEventsPowerSync } from './adapters/powersync/conversation-events.powersync';
import { AttentionEventsPowerSync } from './adapters/powersync/attention-events.powersync';
/**
 * AI Module — PowerSync persistence ingredients for the Desktop lane.
 *
 * The Desktop host owns runtime composition. This file only selects product
 * persistence adapters; it does not build an Agent runtime or accept legacy
 * AIService/AgentHost capability ports.
 */

import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { AgentInstancePowerSyncRepository } from './adapters/powersync/agent-instance.repository';
import type { IAgentInstanceRepository } from '../application/agent-instance/agent-instance.repository';
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
  AIExecutionRecordPowerSyncAdapter,
  ConversationAttentionPowerSyncAdapter,
  AIKnowledgeIndexPowerSyncRepository,
  PowerSyncAIConversationRepository,
  PowerSyncAIProviderConfigRepository,
  PowerSyncAIProviderOnboardingCommitAdapter,
  PowerSyncAIProviderOnboardingSessionRepository,
  PowerSyncAIProviderSecretVault,
} from './adapters/powersync';
import type { IAIConversationRepository } from '../domain/repositories/i-ai-conversation-repository';
import type { IAIProviderConfigRepository } from '../domain/repositories/i-ai-provider-config-repository';

export interface AIPowerSyncRepositorySet {
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

export function createAIPowerSyncRepositories(db: IElectronDatabase): AIPowerSyncRepositorySet {
  const providerOnboardingSessionRepository = new PowerSyncAIProviderOnboardingSessionRepository(
    db,
  );
  const providerSecretVault = new PowerSyncAIProviderSecretVault(db);
  return {
    agentInstanceRepository: new AgentInstancePowerSyncRepository(db),
    conversationRepository: new PowerSyncAIConversationRepository(
      db,
      db.watch ? new ConversationEventsPowerSync(db) : undefined,
    ),
    providerConfigRepository: new PowerSyncAIProviderConfigRepository(db),
    knowledgeIndexRepository: new AIKnowledgeIndexPowerSyncRepository(db),
    executionRecordPort: new AIExecutionRecordPowerSyncAdapter(db),
    conversationAttentionPort: new ConversationAttentionPowerSyncAdapter(
      db,
      db.watch ? new AttentionEventsPowerSync(db) : undefined,
    ),
    providerOnboardingSessionRepository,
    providerOnboardingCommitPort: new PowerSyncAIProviderOnboardingCommitAdapter(db),
    providerSecretVault,
  };
}
