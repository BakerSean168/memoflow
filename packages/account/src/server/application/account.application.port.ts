import type {
  CloseAccountUseCase,
  GetAccountAvatarUseCase,
  GetAccountProfileUseCase,
  ListAccountsUseCase,
  UpdateAccountAvatarUseCase,
  UpdateAccountProfileUseCase,
} from './use-cases';
import type {
  AccountAvatarContent,
  AccountAvatarMeta,
  AccountAvatarUploadResult,
} from '@memoflow/account-contracts';
import type { OperationTimelineEntry, OperationAuditRecord } from '@memoflow/operations-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';

/**
 * Transport-neutral account application surface.
 */
export type AccountListOptions = Parameters<ListAccountsUseCase['execute']>[0];
export type AccountListResult = Awaited<ReturnType<ListAccountsUseCase['execute']>>;

export interface AccountApplicationPort {
  listAccounts(options?: AccountListOptions): Promise<AccountListResult>;
  getProfile(
    cx: Parameters<GetAccountProfileUseCase['execute']>[0],
  ): Promise<Awaited<ReturnType<GetAccountProfileUseCase['execute']>>>;
  updateProfile(
    data: Parameters<UpdateAccountProfileUseCase['execute']>[0],
    cx: Parameters<UpdateAccountProfileUseCase['execute']>[1],
  ): Promise<Awaited<ReturnType<UpdateAccountProfileUseCase['execute']>>>;
  closeAccount(
    data: Parameters<CloseAccountUseCase['execute']>[0],
    cx: Parameters<CloseAccountUseCase['execute']>[1],
  ): Promise<Awaited<ReturnType<CloseAccountUseCase['execute']>>>;
  /** Issue #859: store the authenticated account's cloud avatar. */
  updateAvatar(
    data: Parameters<UpdateAccountAvatarUseCase['execute']>[0],
    cx: Parameters<UpdateAccountAvatarUseCase['execute']>[1],
  ): Promise<Result<AccountAvatarUploadResult>>;
  /** Issue #859: read the authenticated account's cloud avatar. */
  getAvatar(
    cx: Parameters<GetAccountAvatarUseCase['execute']>[0],
  ): Promise<Result<AccountAvatarContent>>;
  /** Issue #859: read only the avatar timestamp for conflict checks. */
  getAvatarMeta(
    cx: Parameters<GetAccountAvatarUseCase['meta']>[0],
  ): Promise<Result<AccountAvatarMeta>>;
  /** W7: 按 identity 查询 closure operation timeline */
  queryClosureTimeline(cx: ExecutionContext): Promise<Result<OperationTimelineEntry[]>>;
  /** W7: 重放失败的 closure operation 并记录审计 */
  replayClosure(operationId: string, cx: ExecutionContext): Promise<Result<unknown>>;
  /** W7: 查询操作审计记录（actor 最小权限） */
  getOperationAudit(cx: ExecutionContext): Promise<Result<OperationAuditRecord[]>>;
}
