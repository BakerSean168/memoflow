import type { IdentityId } from '../../../../primitives';
import type { AIProviderConnectionServerDTO } from '../../aggregates/ai-provider-config-server';

export interface AIProviderConfigModelsUpdatedEvent {
  identityId: IdentityId;
  providerConnection: AIProviderConnectionServerDTO;
  modelCount: number;
}
