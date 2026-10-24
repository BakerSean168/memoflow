/**
 * Account Application Client Layer
 *
 * Client-side application services for the Account module.
 * Consumers construct `AccountClientService` with an injected `IAccountApiClient`.
 */

export {
  AccountClientService,
  createAccountClientService,
} from './services/account-client-service';
export type { AccountClientPort } from './services/account-client-service';
export type { IAccountApiClient } from './ports/account-api-client.port';
export { createAccountServiceFromHttpClient } from './account-http-service-factory';
