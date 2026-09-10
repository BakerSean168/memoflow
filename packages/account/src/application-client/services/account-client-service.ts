/**
 * Account Client Service
 *
 * Coordinates API calls and client-side domain model mapping.
 * All methods return Result<T>, with success/failure handled by the Composable layer.
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, map as mapResult } from '@memoflow/contracts/result';
import type { IAccountApiClient } from '../ports/account-api-client.port';
import type {
  UpdateAccountReq,
  CloseAccountReq,
  CloseAccountRes,
  AccountClientDTO,
  AccountView,
  CloudIdentitySummary,
  AccountProfileDTO,
} from '@memoflow/contracts/account';
import { Account } from '../../domain-client';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { AccountProfile, AccountStatus } from '../../server/domain/value-objects';

function accountFromDTO(dto: AccountClientDTO): Account {
  return Account.load({
    id: IdentityId.of(dto.id),
    profile: AccountProfile.create({
      ...dto.profile,
      birthday: dto.profile.birthday as AccountProfileDTO['birthday'],
    }),
    status: AccountStatus.of(dto.status),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    closedAt: dto.closedAt ?? null,
  });
}

export interface AccountClientView {
  readonly account: Account;
  readonly cloudIdentity: CloudIdentitySummary | null;
}

function mapAccountResult(result: Result<AccountView>): Result<AccountClientView> {
  if (result.ok && !result.data) {
    return fail({ code: 'NOT_FOUND', message: 'Account not found' }, result.meta);
  }

  return mapResult(result, (view) => ({
    account: accountFromDTO(view.account),
    cloudIdentity: view.cloudIdentity,
  }));
}

// ─── Client Application Port ────────────────────────────────────────────────

/** High-level client-side operations for the account module. */
export interface AccountClientPort {
  getMyProfile(): Promise<Result<AccountClientView>>;
  updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountClientView>>;
  closeAccount(request: CloseAccountReq): Promise<Result<CloseAccountRes>>;
}

export class AccountClientService implements AccountClientPort {
  constructor(private readonly apiClient: IAccountApiClient) {
    this.getMyProfile = this.getMyProfile.bind(this);
    this.updateMyProfile = this.updateMyProfile.bind(this);
    this.closeAccount = this.closeAccount.bind(this);
  }

  async getMyProfile(): Promise<Result<AccountClientView>> {
    const result = await this.apiClient.getMyProfile();
    return mapAccountResult(result);
  }

  async updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountClientView>> {
    const result = await this.apiClient.updateMyProfile(request);
    return mapAccountResult(result);
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
