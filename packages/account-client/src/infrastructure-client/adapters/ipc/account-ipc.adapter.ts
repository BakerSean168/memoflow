/**
 * Account IPC Adapter
 *
 * IPC implementation of IAccountApiClient for Electron desktop apps.
 * Uses ResultIpcClient — all methods return Result<T> directly.
 */

import type { Result } from '@memoflow/transport-contracts';
import { map as mapResult } from '@memoflow/transport-contracts';
import { AccountChannels } from '@memoflow/desktop-contracts';
import type { IAccountApiClient, IResultIpcClient } from '../types';
import type {
  AccountAvatarContent,
  AccountAvatarMeta,
  AccountAvatarUploadResult,
  AccountClientDTO,
  AccountView,
  UpdateAccountReq,
  UploadAccountAvatarReq,
  CloseAccountReq,
  CloseAccountRes,
} from '@memoflow/account-contracts';

export class AccountIpcAdapter implements IAccountApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getMyProfile(): Promise<Result<AccountView>> {
    const result = await this.ipcClient.invoke<AccountClientDTO>(AccountChannels.GET_ME);
    return mapResult(result, (account) => ({ account, cloudIdentity: null }));
  }

  async updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountView>> {
    const result = await this.ipcClient.invoke<AccountClientDTO>(
      AccountChannels.UPDATE_PROFILE,
      request,
    );
    return mapResult(result, (account) => ({ account, cloudIdentity: null }));
  }

  async closeAccount(request: CloseAccountReq): Promise<Result<CloseAccountRes>> {
    return this.ipcClient.invoke(AccountChannels.CLOSE, request);
  }

  async getMyAvatarMeta(): Promise<Result<AccountAvatarMeta>> {
    return this.ipcClient.invoke(AccountChannels.AVATAR_META);
  }

  async downloadMyAvatar(): Promise<Result<AccountAvatarContent>> {
    return this.ipcClient.invoke(AccountChannels.AVATAR_DOWNLOAD);
  }

  async uploadMyAvatar(
    request: UploadAccountAvatarReq,
  ): Promise<Result<AccountAvatarUploadResult>> {
    return this.ipcClient.invoke(AccountChannels.AVATAR_UPLOAD, request);
  }
}

export function createAccountIpcAdapter(ipcClient: IResultIpcClient): IAccountApiClient {
  return new AccountIpcAdapter(ipcClient);
}
