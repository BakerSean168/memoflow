/**
 * Get Account Avatar Use Case (Issue #859).
 *
 * Reads only the authenticated identity's blob. The meta variant lets clients
 * decide whether to download without transferring the image. The content is a
 * PNG data URL so the existing result envelope and HTTP client carry it
 * unchanged; surfaces already render data URLs (#858).
 */

import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import {
  ACCOUNT_AVATAR_DATA_URL_PREFIX,
  type AccountAvatarMeta,
} from '@memoflow/account-contracts';
import type { IAccountAvatarRepository } from '../../../domain/repositories/i-account-avatar-repository';

export interface AccountAvatarContent {
  readonly dataUrl: string;
  readonly updatedAt: number;
}

export class GetAccountAvatarUseCase {
  constructor(private readonly avatarRepository: IAccountAvatarRepository) {}

  async execute(cx: ExecutionContext): Promise<Result<AccountAvatarContent>> {
    const avatar = await this.avatarRepository.find(cx.identityId);
    if (!avatar) {
      return fail({ code: 'NOT_FOUND', message: 'Account has no avatar' });
    }
    return ok({
      dataUrl: `${ACCOUNT_AVATAR_DATA_URL_PREFIX}${Buffer.from(avatar.bytes).toString('base64')}`,
      updatedAt: avatar.updatedAt,
    });
  }

  async meta(cx: ExecutionContext): Promise<Result<AccountAvatarMeta>> {
    const avatar = await this.avatarRepository.find(cx.identityId);
    return ok({ updatedAt: avatar?.updatedAt ?? null });
  }
}
