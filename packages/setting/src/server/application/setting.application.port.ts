import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  PreferenceRevisionConflict,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import type { ResetUserPreferencesResult } from '../preferences';
import type { ExportSettings, ImportSettings } from './use-cases';

/** Canonical Setting transport-neutral application port. */
export interface SettingApplicationPort {
  getPreferenceProfile(identityId: string): Promise<UserPreferenceProfile>;
  getPreferenceNamespace(
    identityId: string,
    namespace: PreferenceNamespace,
  ): Promise<PreferenceNamespaceResponse>;
  patchPreferenceNamespace(
    identityId: string,
    namespace: PreferenceNamespace,
    patch: PreferenceNamespacePatch,
    expectedRevision?: number,
  ): Promise<PreferenceMutationReceipt | PreferenceRevisionConflict>;
  resetPreferenceNamespace(
    identityId: string,
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<PreferenceMutationReceipt | PreferenceRevisionConflict>;
  resetUserPreferences(
    identityId: string,
    expectedRevisions?: Partial<Record<PreferenceNamespace, number>>,
  ): Promise<ResetUserPreferencesResult>;
  exportSettings(identityId: string): Promise<Awaited<ReturnType<ExportSettings['execute']>>>;
  importSettings(
    identityId: string,
    data: Parameters<ImportSettings['execute']>[1],
  ): Promise<Awaited<ReturnType<ImportSettings['execute']>>>;
}
