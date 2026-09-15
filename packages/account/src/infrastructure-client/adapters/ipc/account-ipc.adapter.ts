/**
 * Account IPC Adapter
 *
 * IPC implementation of IAccountApiClient for Electron desktop apps.
 * Uses ResultIpcClient — all methods return Result<T> directly.
 */

import type { Result } from '@memoflow/contracts/result';
import { map as mapResult } from '@memoflow/contracts/result';
import { AccountChannels } from '@memoflow/contracts/electron';
import type { IAccountApiClient, IResultIpcClient } from '../types';
import type {
  AccountClientDTO,
  AccountView,
  UpdateAccountReq,
  CloseAccountReq,
  CloseAccountRes,
} from '@memoflow/contracts/account';

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
}

export function createAccountIpcAdapter(ipcClient: IResultIpcClient): IAccountApiClient {
  return new AccountIpcAdapter(ipcClient);
}
