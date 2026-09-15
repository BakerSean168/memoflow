/** Canonical Setting HTTP adapter. */
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
} from '@memoflow/contracts/setting';

export class SettingHttpAdapter implements ISettingApiClient {
  private readonly baseUrl = '/settings';
  constructor(private readonly httpClient: IResultHttpClient) {}

  getPreferenceProfile(): Promise<Result<UserPreferenceProfile>> {
    return this.httpClient.get(`${this.baseUrl}/preferences`);
  }
  getPreferenceNamespace(namespace: PreferenceNamespace): Promise<Result<PreferenceNamespaceResponse>> {
    return this.httpClient.get(`${this.baseUrl}/preferences/${namespace}`);
  }
  patchPreferenceNamespace<N extends PreferenceNamespace>(
    namespace: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.httpClient.patch(`${this.baseUrl}/preferences/${namespace}`, { patch, expectedRevision });
  }
  resetPreferenceNamespace(
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/preferences/${namespace}/reset`, { expectedRevision });
  }
  resetUserPreferences(
    expectedRevisions?: Partial<Record<PreferenceNamespace, number>>,
  ): Promise<Result<ResetUserPreferencesResponse>> {
    return this.httpClient.post(`${this.baseUrl}/preferences/reset-all`, { expectedRevisions });
  }
  exportSettings(): Promise<Result<ExportSettingsRes>> {
    return this.httpClient.post(`${this.baseUrl}/export`, {});
  }
  importSettings(data: string): Promise<Result<ImportSettingsRes>> {
    return this.httpClient.post(`${this.baseUrl}/import`, { data });
  }
}
