import type { IdentityId } from '@memoflow/shared-primitives';

export interface SettingImportedEvent {
  readonly identityId: IdentityId;
  readonly imported: number;
  readonly skipped: number;
}
