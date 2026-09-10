/** Transport-agnostic Setting client API (HTTP / IPC). */
import type { Result } from '@memoflow/contracts/result';
import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  ResetUserPreferencesResponse,
  UserPreferenceProfile,
  UserSettingClientDTO,
  PreferenceCategory,
} from '@memoflow/contracts/setting';

export interface ISettingApiClient {
  // Canonical presentation/regional preferences.
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

  // Legacy giant-tree surface retained until remaining owners migrate.
  getUserSettings(): Promise<Result<UserSettingClientDTO>>;
  getUserSettingDefaults(): Promise<Result<UserSettingClientDTO>>;
  patchCategory(
    category: PreferenceCategory,
    patch: Record<string, unknown>,
  ): Promise<Result<UserSettingClientDTO>>;
  resetUserSettings(category?: string): Promise<Result<UserSettingClientDTO>>;
  exportSettings(): Promise<Result<string>>;
  importSettings(
    data: string,
    options?: { merge?: boolean },
  ): Promise<Result<UserSettingClientDTO>>;
}
