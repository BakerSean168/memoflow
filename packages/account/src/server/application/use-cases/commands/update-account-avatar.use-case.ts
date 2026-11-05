/**
 * Update Account Avatar Use Case (Issue #859).
 *
 * The authenticated identity is the only writable target: an optional
 * `targetAccountId` exists so transports can explicitly reject "upload to
 * someone else's account" instead of silently ignoring it.
 */

import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { AccountAvatarUploadResult } from '@memoflow/account-contracts';
import {
  ACCOUNT_AVATAR_DATA_URL_PREFIX,
  ACCOUNT_AVATAR_MAX_BYTES,
} from '@memoflow/account-contracts';
import type { Clock } from '@memoflow/time';
import type { IAccountRepository } from '../../../domain';
import type { IAccountAvatarRepository } from '../../../domain/repositories/i-account-avatar-repository';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface UpdateAccountAvatarInput {
  readonly dataUrl: string;
  /** Optional transport-supplied account id; must equal the authenticated identity. */
  readonly targetAccountId?: string;
}

function decodePng(dataUrl: string): Buffer | null {
  if (!dataUrl.startsWith(ACCOUNT_AVATAR_DATA_URL_PREFIX)) return null;
  const bytes = Buffer.from(dataUrl.slice(ACCOUNT_AVATAR_DATA_URL_PREFIX.length), 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > ACCOUNT_AVATAR_MAX_BYTES) return null;
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  return bytes;
}

export class UpdateAccountAvatarUseCase {
  constructor(
    private readonly accountRepository: IAccountRepository,
    private readonly avatarRepository: IAccountAvatarRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateAccountAvatarInput,
    cx: ExecutionContext,
  ): Promise<Result<AccountAvatarUploadResult>> {
    if (input.targetAccountId !== undefined && input.targetAccountId !== cx.identityId) {
      return fail({
        code: 'FORBIDDEN',
        message: 'Cannot update another account avatar',
      });
    }

    const account = await this.accountRepository.findById(cx.identityId);
    if (!account) {
      return fail({ code: 'NOT_FOUND', message: 'Account not found' });
    }

    const bytes = decodePng(input.dataUrl);
    if (!bytes) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Avatar must be a valid PNG data URL' });
    }

    const updatedAt = this.clock.now();
    await this.avatarRepository.upsert(account.id.toString(), new Uint8Array(bytes), updatedAt);
    account.markAvatarUpdated(updatedAt);
    await this.accountRepository.save(account);

    return ok({ updatedAt });
  }
}
