/**
 * Account HTTP Adapter
 *
 * HTTP implementation of IAccountApiClient.
 * Uses IResultHttpClient — all methods return Result<T>, never throw.
 */

import type { IAccountApiClient } from '../types';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { Result } from '@memoflow/transport-contracts';
import type {
  AccountAvatarContent,
  AccountAvatarMeta,
  AccountAvatarUploadResult,
  AccountView,
  UpdateAccountReq,
  UploadAccountAvatarReq,
  CloseAccountReq,
  CloseAccountRes,
} from '@memoflow/account-contracts';

export class AccountHttpAdapter implements IAccountApiClient {
  private readonly baseUrl = '/accounts';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async getMyProfile(): Promise<Result<AccountView>> {
    return this.httpClient.get(`${this.baseUrl}/me`);
  }

  async updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountView>> {
    return this.httpClient.put(`${this.baseUrl}/me`, request);
  }

  async closeAccount(request: CloseAccountReq): Promise<Result<CloseAccountRes>> {
    return this.httpClient.post(`${this.baseUrl}/me/close`, request);
  }

  async getMyAvatarMeta(): Promise<Result<AccountAvatarMeta>> {
    return this.httpClient.get(`${this.baseUrl}/me/avatar/meta`);
  }

  async downloadMyAvatar(): Promise<Result<AccountAvatarContent>> {
    return this.httpClient.get(`${this.baseUrl}/me/avatar`);
  }

  async uploadMyAvatar(
    request: UploadAccountAvatarReq,
  ): Promise<Result<AccountAvatarUploadResult>> {
    return this.httpClient.put(`${this.baseUrl}/me/avatar`, request);
  }
}

export function createAccountHttpAdapter(httpClient: IResultHttpClient): IAccountApiClient {
  return new AccountHttpAdapter(httpClient);
}
