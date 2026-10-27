import type { ServerHeldDataDisclosureDataV1 } from './server-held-data-disclosure.v1.dto';

/**
 * Read-only source for repository-cloud records already held by the server.
 * Implementations must use an explicit allowlist and must not return tokens,
 * encrypted credentials, private keys, or other replayable authorization.
 */
export interface ServerHeldDataDisclosureSource {
  readForIdentity(identityId: string): Promise<ServerHeldDataDisclosureDataV1>;
}
