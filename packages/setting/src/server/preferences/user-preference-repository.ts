import type { PreferenceNamespace } from '@memoflow/contracts/setting';
import type { UserPreferenceDocument } from './user-preference-document';

export type PreferenceCreateResult =
  | { kind: 'created'; document: UserPreferenceDocument }
  | { kind: 'exists'; document: UserPreferenceDocument };

export type PreferenceCompareAndSwapResult =
  | { kind: 'updated'; document: UserPreferenceDocument }
  | { kind: 'conflict'; latest: UserPreferenceDocument }
  | { kind: 'missing' };

export interface IUserPreferenceRepository {
  find(identityId: string, namespace: PreferenceNamespace): Promise<UserPreferenceDocument | null>;
  list(identityId: string): Promise<readonly UserPreferenceDocument[]>;
  create(document: UserPreferenceDocument): Promise<PreferenceCreateResult>;
  compareAndSwap(
    document: UserPreferenceDocument,
    expectedRevision: number,
  ): Promise<PreferenceCompareAndSwapResult>;
}
