/**
 * Repository Module - Application Client
 *
 * Knowledge repository + Desktop Local Vault client surface.
 */

export type { IRepositoryApiClient } from './ports/repository-api-client.port';
export type { RepositoryClientPort } from './repository-client.port';

export {
  RepositoryClientService,
  createRepositoryClientService,
} from './repository-client-service';
export { createRepositoryServiceFromHttpClient } from './repository-http-service-factory';
