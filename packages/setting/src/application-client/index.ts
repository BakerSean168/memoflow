/** Canonical Setting application client facade. */
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
import type { ISettingApiClient } from './ports/setting-api-client.port';

export type { ISettingApiClient } from './ports/setting-api-client.port';
export type SettingClientPort = ISettingApiClient;

export class SettingClientService implements ISettingApiClient {
  constructor(private readonly apiClient: ISettingApiClient) {
    this.getPreferenceProfile = this.getPreferenceProfile.bind(this);
    this.getPreferenceNamespace = this.getPreferenceNamespace.bind(this);
    this.patchPreferenceNamespace = this.patchPreferenceNamespace.bind(this);
    this.resetPreferenceNamespace = this.resetPreferenceNamespace.bind(this);
    this.resetUserPreferences = this.resetUserPreferences.bind(this);
    this.exportSettings = this.exportSettings.bind(this);
    this.importSettings = this.importSettings.bind(this);
  }

  getPreferenceProfile(): Promise<Result<UserPreferenceProfile>> {
    return this.apiClient.getPreferenceProfile();
  }
  getPreferenceNamespace(namespace: PreferenceNamespace): Promise<Result<PreferenceNamespaceResponse>> {
    return this.apiClient.getPreferenceNamespace(namespace);
  }
  patchPreferenceNamespace<N extends PreferenceNamespace>(
    namespace: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.apiClient.patchPreferenceNamespace(namespace, patch, expectedRevision);
  }
  resetPreferenceNamespace(
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.apiClient.resetPreferenceNamespace(namespace, expectedRevision);
  }
  resetUserPreferences(
    expectedRevisions?: Partial<Record<PreferenceNamespace, number>>,
  ): Promise<Result<ResetUserPreferencesResponse>> {
    return this.apiClient.resetUserPreferences(expectedRevisions);
  }
  exportSettings(): Promise<Result<ExportSettingsRes>> {
    return this.apiClient.exportSettings();
  }
  importSettings(data: string): Promise<Result<ImportSettingsRes>> {
    return this.apiClient.importSettings(data);
  }
}

export function createSettingClientService(apiClient: ISettingApiClient): SettingClientService {
  return new SettingClientService(apiClient);
}
export { createSettingServiceFromHttpClient } from './setting-http-service-factory';
