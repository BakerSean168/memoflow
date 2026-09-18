import type { IdentityId } from '../../../../primitives';
import type { AIProviderConnectionServerDTO } from '../../aggregates/ai-provider-config-server';

export interface AIProviderConfigSetDefaultEvent {
  identityId: IdentityId;
  providerConnection: AIProviderConnectionServerDTO;
}
