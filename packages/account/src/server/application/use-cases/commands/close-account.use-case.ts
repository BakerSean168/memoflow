/**
 * Close Account Use Case
 * Uses AccountClosureCoordinator saga for identity and session revocation orchestration.
 */

import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { CloseAccountReq } from '@memoflow/account-contracts';
import type {
  AccountClosureCoordinator,
  AccountClosureReceipt,
} from '../../services/account-closure-coordinator';
import { AccountClosureFailureError } from '../../services/account-closure-failure';

export type CloseAccountCommand = CloseAccountReq & {
  idempotencyKey?: string;
};

export class CloseAccountUseCase {
  constructor(private readonly coordinator: AccountClosureCoordinator) {}

  async execute(
    request: CloseAccountCommand,
    cx: ExecutionContext,
  ): Promise<Result<AccountClosureReceipt>> {
    // Stable default idempotency key scoped to identity without user free-form text
    const idempotencyKey = request.idempotencyKey || `close:${cx.identityId}`;

    try {
      const receipt = await this.coordinator.execute(cx.identityId, idempotencyKey, {
        reason: request.reason,
        feedback: request.feedback,
      });

      if (receipt.status === 'failed') {
        return receipt.failureCode === 'ACCOUNT_NOT_FOUND'
          ? error('NOT_FOUND', 'Account not found')
          : error('INTERNAL_ERROR', 'Account closure operation failed');
      }

      return ok(receipt);
    } catch (err: unknown) {
      if (err instanceof AccountClosureFailureError && err.code === 'ACCOUNT_NOT_FOUND') {
        return error('NOT_FOUND', 'Account not found');
      }
      return error('INTERNAL_ERROR', 'Account closure operation failed');
    }
  }
}
