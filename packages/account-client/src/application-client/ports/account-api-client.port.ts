/**
 * Account API Client Port Interface
 */

import type { Result } from '@memoflow/transport-contracts';
import type { AccountView } from '@memoflow/account-contracts';
import type {
  AccountAvatarContent,
  AccountAvatarMeta,
  AccountAvatarUploadResult,
  UpdateAccountReq,
  UploadAccountAvatarReq,
  CloseAccountReq,
  CloseAccountRes,
} from '@memoflow/account-contracts';

export interface IAccountApiClient {
  getMyProfile(): Promise<Result<AccountView>>;
  updateMyProfile(request: UpdateAccountReq): Promise<Result<AccountView>>;
  closeAccount(request: CloseAccountReq): Promise<Result<CloseAccountRes>>;
  /** Issue #859: cloud avatar timestamp for conflict checks. */
  getMyAvatarMeta(): Promise<Result<AccountAvatarMeta>>;
  /** Issue #859: current account avatar as a PNG data URL. */
  downloadMyAvatar(): Promise<Result<AccountAvatarContent>>;
  /** Issue #859: upload the normalized PNG data URL. */
  uploadMyAvatar(request: UploadAccountAvatarReq): Promise<Result<AccountAvatarUploadResult>>;
}
