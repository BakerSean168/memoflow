import type { IdentityId } from '../../../../primitives';
import type { AIProviderConnectionServerDTO } from '../../aggregates/ai-provider-config-server';

export interface AIProviderConfigCreatedEvent {
  identityId: IdentityId;
  providerConnection: AIProviderConnectionServerDTO;
}
