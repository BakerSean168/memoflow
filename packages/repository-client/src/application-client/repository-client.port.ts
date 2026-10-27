/**
 * Repository Client Port — application-facing knowledge repository + Local Vault surface.
 *
 * Identical to IRepositoryApiClient for this module (pure Result pass-through).
 */

import type { IRepositoryApiClient } from './ports/repository-api-client.port';

export type RepositoryClientPort = IRepositoryApiClient;
