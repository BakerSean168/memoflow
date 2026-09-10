/**
 * Setting Application Client Layer
 *
 * Provides the client-side facade over any transport adapter (HTTP / IPC).
 * Consumers should depend on `ISettingApiClient` (the port) and inject a
 * concrete adapter from `infrastructure-client`.
 */

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
  UserSettingClientDTO,
  PreferenceCategory,
} from '@memoflow/contracts/setting';
import type { ISettingApiClient } from './ports/setting-api-client.port';

// Re-export the port so consumers can import from the application layer.
export type { ISettingApiClient } from './ports/setting-api-client.port';

// ─── Client Application Port ────────────────────────────────────────────────

/**
 * Application-facing client port.
 * Identical to ISettingApiClient; V3 import has no legacy merge/overwrite option.
 */
export type SettingClientPort = ISettingApiClient;

// ─── Client Service ──────────────────────────────────────────────────────────

/**
 * Setting Client Service — thin facade that delegates to an `ISettingApiClient`.
 *
 * Returns `Result<T>` (no throwing) so the caller keeps full control.
 */
export class SettingClientService implements ISettingApiClient {
  constructor(private readonly apiClient: ISettingApiClient) {
    this.getPreferenceProfile = this.getPreferenceProfile.bind(this);
    this.getPreferenceNamespace = this.getPreferenceNamespace.bind(this);
    this.patchPreferenceNamespace = this.patchPreferenceNamespace.bind(this);
    this.resetPreferenceNamespace = this.resetPreferenceNamespace.bind(this);
    this.resetUserPreferences = this.resetUserPreferences.bind(this);
    this.getUserSettings = this.getUserSettings.bind(this);
    this.getUserSettingDefaults = this.getUserSettingDefaults.bind(this);
    this.patchCategory = this.patchCategory.bind(this);
    this.resetUserSettings = this.resetUserSettings.bind(this);
    this.exportSettings = this.exportSettings.bind(this);
    this.importSettings = this.importSettings.bind(this);
  }

  getPreferenceProfile(): Promise<Result<UserPreferenceProfile>> {
    return this.apiClient.getPreferenceProfile();
  }

  getPreferenceNamespace(
    namespace: PreferenceNamespace,
  ): Promise<Result<PreferenceNamespaceResponse>> {
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

  getUserSettings(): Promise<Result<UserSettingClientDTO>> {
    return this.apiClient.getUserSettings();
  }

  getUserSettingDefaults(): Promise<Result<UserSettingClientDTO>> {
    return this.apiClient.getUserSettingDefaults();
  }

  patchCategory(
    category: PreferenceCategory,
    patch: Record<string, unknown>,
  ): Promise<Result<UserSettingClientDTO>> {
    return this.apiClient.patchCategory(category, patch);
  }

  resetUserSettings(category?: string): Promise<Result<UserSettingClientDTO>> {
    return this.apiClient.resetUserSettings(category);
  }

  exportSettings(): Promise<Result<ExportSettingsRes>> {
    return this.apiClient.exportSettings();
  }

  importSettings(data: string): Promise<Result<ImportSettingsRes>> {
    return this.apiClient.importSettings(data);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a `SettingClientService` from any transport adapter.
 *
 * ```ts
 * const client = createSettingClientService(new SettingHttpAdapter(httpClient));
 * ```
 */
export function createSettingClientService(apiClient: ISettingApiClient): SettingClientService {
  return new SettingClientService(apiClient);
}

export { createSettingServiceFromHttpClient } from './setting-http-service-factory';
