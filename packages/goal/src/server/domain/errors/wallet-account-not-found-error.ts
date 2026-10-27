/**
 * Wallet account not found (goal domain layer).
 *
 * Typed provider-boundary error thrown by wallet repository implementations when
 * `recordTransaction` targets a missing account. Defined in the domain layer so
 * both infrastructure (which throws it) and application (which branches on it
 * with `instanceof`) can depend on it. The message text is preserved for
 * observability but control flow must use `instanceof`, never message text.
 */
import { ResultErrorException } from '@memoflow/transport-contracts/result';

export class WalletAccountNotFoundError extends ResultErrorException {
  constructor() {
    super('ACCOUNT_NOT_FOUND', 'ACCOUNT_NOT_FOUND');
    this.name = 'WalletAccountNotFoundError';
  }
}
