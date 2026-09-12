/**
 * Update Account Profile Use Case
 */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IAccountRepository } from '../../../domain';
import type { AccountClientDTO, UpdateAccountReq } from '@memoflow/contracts/account';
import type { Clock } from '@memoflow/time';

export class UpdateAccountProfileUseCase {
  constructor(
    private readonly accountRepository: IAccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    request: UpdateAccountReq,
    cx: ExecutionContext,
    tx?: unknown,
  ): Promise<Result<AccountClientDTO>> {
    const account = tx
      ? await this.accountRepository.findById(cx.identityId, tx)
      : await this.accountRepository.findById(cx.identityId);
    if (!account) {
      return error('NOT_FOUND', `Account not found: ${cx.identityId}`);
    }

    let profile = account.profile;

    if (request.nickname !== undefined) {
      profile = profile.updateNickname(request.nickname);
    }
    if (request.avatar !== undefined) {
      profile = profile.updateAvatar(request.avatar ?? '');
    }
    if (request.bio !== undefined) {
      profile = profile.updateBio(request.bio ?? '');
    }

    account.updateProfile(profile, this.clock.now());
    if (tx) {
      await this.accountRepository.save(account, tx);
    } else {
      await this.accountRepository.save(account);
    }

    return ok(account.toClientDTO());
  }
}
