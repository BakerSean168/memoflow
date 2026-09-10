import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  PreferenceRevisionConflict,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import type { ResetUserPreferencesResult } from '../preferences';
import type {
  ExportSettings,
  GetDefaultSettings,
  GetUserSetting,
  ImportSettings,
  PatchUserSetting,
  ResetUserSetting,
} from './use-cases';

/** Setting transport-neutral application port. */
export interface SettingApplicationPort {
  // Canonical User Preferences — presentation/regional only.
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

  // Legacy giant-tree surface retained temporarily for non-migrated owners.
  getUserSetting(identityId: string): Promise<Awaited<ReturnType<GetUserSetting['execute']>>>;
  patchUserSetting(
    identityId: string,
    category: Parameters<PatchUserSetting['execute']>[1],
    patch: Parameters<PatchUserSetting['execute']>[2],
  ): Promise<Awaited<ReturnType<PatchUserSetting['execute']>>>;
  resetUserSetting(
    identityId: string,
    category?: Parameters<ResetUserSetting['execute']>[1],
  ): Promise<Awaited<ReturnType<ResetUserSetting['execute']>>>;
  exportSettings(identityId: string): Promise<Awaited<ReturnType<ExportSettings['execute']>>>;
  importSettings(
    identityId: string,
    data: Parameters<ImportSettings['execute']>[1],
    options?: Parameters<ImportSettings['execute']>[2],
  ): Promise<Awaited<ReturnType<ImportSettings['execute']>>>;
  getDefaultSettings(): ReturnType<GetDefaultSettings['execute']>;
}
