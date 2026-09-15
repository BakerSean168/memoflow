/**
 * Account API Client Port Interface
 */

import type { Result } from '@memoflow/contracts/result';
import type { AccountView } from '@memoflow/contracts/account';
import type {
  UpdateAccountReq,
  CloseAccountReq,
  CloseAccountRes,
} from '@memoflow/contracts/account';

export interface IAccountApiClient {
  getMyProfile(): Promise<Result<AccountView>>;
  updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountView>>;
  closeAccount(request: CloseAccountReq): Promise<Result<CloseAccountRes>>;
}
