/**
 * Account Client Service
 *
 * Constructor-injected application service for account profile reads/writes.
 * Uses the port interface directly, returning Result<T> types throughout.
 *
 * The port is a DTO pass-through: `AccountClientPort` is an alias of
 * `IAccountApiClient`, so callers receive the transport `AccountView`
 * unchanged. There is no client-side mirror aggregate — the old `Account`
 * class in `src/domain-client` only rebuilt a DTO the server had already
 * produced, so it was deleted rather than moved (same ruling as goal-client
 * G-2 and notification-client).
 *
 * Cloud identity stays a separate projection on `AccountView`; it is never
 * folded into the account snapshot.
 *
 * @module application-client/services/account-client-service
 */

import type { Result } from '@memoflow/transport-contracts';
import { fail } from '@memoflow/transport-contracts';
import type {
  AccountView,
  CloseAccountReq,
  CloseAccountRes,
  UpdateAccountReq,
} from '@memoflow/account-contracts';
import type { IAccountApiClient } from '../ports/account-api-client.port';

// ─── Client Application Port ────────────────────────────────────────────────

/**
 * Application-facing client port.
 *
 * Identical to `IAccountApiClient` for this module (pure DTO pass-through, no
 * client-side read model). Kept as a named alias so DI facades and host
 * surfaces keep their stable `AccountClientPort` spelling.
 */
export type AccountClientPort = IAccountApiClient;

/**
 * Guard a transport that violates the contract with `ok(null)`. The server
 * never sends an empty body for these routes, so a null payload becomes a
 * NOT_FOUND failure instead of reaching the caller as `ok(null)`.
 */
function guardEmptyProfile(result: Result<AccountView>): Result<AccountView> {
  if (result.ok && !result.data) {
    return fail({ code: 'NOT_FOUND', message: 'Account not found' }, result.meta);
  }
  return result;
}

export class AccountClientService implements IAccountApiClient {
  constructor(private readonly apiClient: IAccountApiClient) {
    this.getMyProfile = this.getMyProfile.bind(this);
    this.updateMyProfile = this.updateMyProfile.bind(this);
    this.closeAccount = this.closeAccount.bind(this);
  }

  async getMyProfile(): Promise<Result<AccountView>> {
    return guardEmptyProfile(await this.apiClient.getMyProfile());
  }

  async updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountView>> {
    return guardEmptyProfile(await this.apiClient.updateMyProfile(request));
  }

  async closeAccount(request: CloseAccountReq): Promise<Result<CloseAccountRes>> {
    return this.apiClient.closeAccount(request);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create an `AccountClientService` from any transport adapter. */
export function createAccountClientService(apiClient: IAccountApiClient): AccountClientService {
  return new AccountClientService(apiClient);
}
