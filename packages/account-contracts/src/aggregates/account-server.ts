/**
 * Account Entity - Server Interface
 * 账户实体 - 服务器接口
 */

import type { IdentityId } from '@memoflow/shared-primitives';
import type { AccountStatus } from '../value-objects/account-status';
import type { AccountProfileDTO } from '../value-objects/account-profile';

import type { TransferDate } from '@memoflow/shared-primitives';

// ============ DTO 定义 ============

/**
 * Account Server DTO
 */
export interface AccountServerDTO {
  id: IdentityId;
  status: AccountStatus;
  profile: AccountProfileDTO;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  closedAt: TransferDate | null;
}
