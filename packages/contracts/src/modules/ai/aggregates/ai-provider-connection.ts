/**
 * Canonical ProviderConnection contract.
 *
 * The existing Config DTO filenames remain stable for the current transport
 * surface; this file is the ownership vocabulary used by new code. It
 * intentionally contains only the opaque credentialRef.
 */
export type { AIProviderCredentialRef } from '../../../primitives';
export type {
  AIProviderConnectionClientDTO,
  AIProviderConfigClientDTO,
} from './ai-provider-config-client';
export { AIProviderCredentialRefSchema } from './ai-provider-config-client';
export type {
  AIProviderConnectionServerDTO,
  AIProviderConfigServerDTO,
} from './ai-provider-config-server';

import type { AIProviderConnectionServerDTO } from './ai-provider-config-server';

/** Domain-neutral saved connection shape shared by API and Desktop hosts. */
export type AIProviderConnection = AIProviderConnectionServerDTO;
