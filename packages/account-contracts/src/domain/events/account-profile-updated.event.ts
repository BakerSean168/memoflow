import type { AccountServerDTO } from '../../aggregates';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface AccountProfileUpdatedEvent {
  identityId: IdentityId;
  accountId: IdentityId;
  account: AccountServerDTO;
  changes: string[];
}
