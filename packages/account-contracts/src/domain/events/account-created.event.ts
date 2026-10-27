import type { AccountServerDTO } from '../../aggregates';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface AccountCreatedEvent {
  identityId: IdentityId;
  accountId: IdentityId;
  account: AccountServerDTO;
}
