/**
 * AI Module — PowerSync persistence ingredients for the Desktop lane.
 *
 * The Desktop host owns runtime composition. This file only selects product
 * persistence adapters; it does not build an Agent runtime or accept legacy
 * AIService/AgentHost capability ports.
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  IAIExecutionRecordPort,
  IAIUsageReadPort,
  IKnowledgeIndexRepository,
  IAIProviderOnboardingCommitPort,
  IAIProviderOnboardingSessionRepository,
  IAIProviderSecretVault,
} from '../application/ports';
import {
  AIExecutionRecordPowerSyncAdapter,
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
  readonly conversationRepository: IAIConversationRepository;
  readonly providerConfigRepository: IAIProviderConfigRepository;
  readonly knowledgeIndexRepository: IKnowledgeIndexRepository;
  readonly executionRecordPort: IAIExecutionRecordPort & IAIUsageReadPort;
  readonly providerOnboardingSessionRepository: IAIProviderOnboardingSessionRepository;
  readonly providerOnboardingCommitPort: IAIProviderOnboardingCommitPort;
  readonly providerSecretVault: IAIProviderSecretVault;
}

export function createAIPowerSyncRepositories(db: IElectronDatabase): AIPowerSyncRepositorySet {
  const providerOnboardingSessionRepository = new PowerSyncAIProviderOnboardingSessionRepository(db);
  const providerSecretVault = new PowerSyncAIProviderSecretVault(db);
  return {
    conversationRepository: new PowerSyncAIConversationRepository(db),
    providerConfigRepository: new PowerSyncAIProviderConfigRepository(db),
    knowledgeIndexRepository: new AIKnowledgeIndexPowerSyncRepository(db),
    executionRecordPort: new AIExecutionRecordPowerSyncAdapter(db),
    providerOnboardingSessionRepository,
    providerOnboardingCommitPort: new PowerSyncAIProviderOnboardingCommitAdapter(db),
    providerSecretVault,
  };
}
