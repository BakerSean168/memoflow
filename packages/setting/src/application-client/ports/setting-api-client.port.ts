/** Transport-agnostic canonical Setting client API (HTTP / IPC). */
import type { Result } from '@memoflow/contracts/result';
import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  ResetUserPreferencesResponse,
  UserPreferenceProfile,
  ExportSettingsRes,
  ImportSettingsRes,
} from '@memoflow/contracts/setting';

export interface ISettingApiClient {
  getPreferenceProfile(): Promise<Result<UserPreferenceProfile>>;
  getPreferenceNamespace(
    namespace: PreferenceNamespace,
  ): Promise<Result<PreferenceNamespaceResponse>>;
  patchPreferenceNamespace<N extends PreferenceNamespace>(
    namespace: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>>;
  resetPreferenceNamespace(
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>>;
  resetUserPreferences(
    expectedRevisions?: Partial<Record<PreferenceNamespace, number>>,
  ): Promise<Result<ResetUserPreferencesResponse>>;
  exportSettings(): Promise<Result<ExportSettingsRes>>;
  importSettings(data: string): Promise<Result<ImportSettingsRes>>;
}
