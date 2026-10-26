import type { AccountServerDTO } from '../../aggregates';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface AccountClosedEvent {
  identityId: IdentityId;
  accountId: IdentityId;
  account: AccountServerDTO;
  reason: string;
  closedAt: number;
}
