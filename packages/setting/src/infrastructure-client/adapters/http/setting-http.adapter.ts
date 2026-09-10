/** Setting HTTP Adapter. */
import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient, ISettingApiClient } from '../types';
import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  ResetUserPreferencesResponse,
  UserPreferenceProfile,
  ExportSettingsRes,
  ImportSettingsRes,
  UserSettingClientDTO,
  PreferenceCategory,
} from '@memoflow/contracts/setting';

export class SettingHttpAdapter implements ISettingApiClient {
  private readonly baseUrl = '/settings';

  constructor(private readonly httpClient: IResultHttpClient) {}

  getPreferenceProfile(): Promise<Result<UserPreferenceProfile>> {
    return this.httpClient.get(`${this.baseUrl}/preferences`);
  }

  getPreferenceNamespace(
    namespace: PreferenceNamespace,
  ): Promise<Result<PreferenceNamespaceResponse>> {
    return this.httpClient.get(`${this.baseUrl}/preferences/${namespace}`);
  }

  patchPreferenceNamespace<N extends PreferenceNamespace>(
    namespace: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.httpClient.patch(`${this.baseUrl}/preferences/${namespace}`, {
      patch,
      expectedRevision,
    });
  }

  resetPreferenceNamespace(
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/preferences/${namespace}/reset`, {
      expectedRevision,
    });
  }

  resetUserPreferences(
    expectedRevisions?: Partial<Record<PreferenceNamespace, number>>,
  ): Promise<Result<ResetUserPreferencesResponse>> {
    return this.httpClient.post(`${this.baseUrl}/preferences/reset-all`, { expectedRevisions });
  }

  async getUserSettings(): Promise<Result<UserSettingClientDTO>> {
    return this.httpClient.get(this.baseUrl);
  }

  async getUserSettingDefaults(): Promise<Result<UserSettingClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/defaults`);
  }

  async patchCategory(
    category: PreferenceCategory,
    patch: Record<string, unknown>,
  ): Promise<Result<UserSettingClientDTO>> {
    return this.httpClient.patch(`${this.baseUrl}/${category}`, patch);
  }

  async resetUserSettings(category?: string): Promise<Result<UserSettingClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/reset`, { category });
  }

  async exportSettings(): Promise<Result<ExportSettingsRes>> {
    return this.httpClient.post(`${this.baseUrl}/export`, {});
  }

  async importSettings(data: string): Promise<Result<ImportSettingsRes>> {
    return this.httpClient.post(`${this.baseUrl}/import`, { data });
  }
}
