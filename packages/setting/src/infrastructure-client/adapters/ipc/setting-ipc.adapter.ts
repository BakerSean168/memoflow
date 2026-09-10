/** Setting IPC Adapter. */
import type { Result } from '@memoflow/contracts/result';
import { SettingChannels } from '@memoflow/contracts/electron';
import type { IResultIpcClient, ISettingApiClient } from '../types';
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

export class SettingIpcAdapter implements ISettingApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  getPreferenceProfile(): Promise<Result<UserPreferenceProfile>> {
    return this.ipcClient.invoke(SettingChannels.PREFERENCES_PROFILE_GET);
  }

  getPreferenceNamespace(
    namespace: PreferenceNamespace,
  ): Promise<Result<PreferenceNamespaceResponse>> {
    return this.ipcClient.invoke(SettingChannels.PREFERENCE_GET, namespace);
  }

  patchPreferenceNamespace<N extends PreferenceNamespace>(
    namespace: N,
    patch: PreferenceNamespacePatch<N>,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.ipcClient.invoke(SettingChannels.PREFERENCE_PATCH, {
      namespace,
      body: { patch, expectedRevision },
    });
  }

  resetPreferenceNamespace(
    namespace: PreferenceNamespace,
    expectedRevision?: number,
  ): Promise<Result<PreferenceMutationReceipt>> {
    return this.ipcClient.invoke(SettingChannels.PREFERENCE_RESET, {
      namespace,
      body: { expectedRevision },
    });
  }

  resetUserPreferences(
    expectedRevisions?: Partial<Record<PreferenceNamespace, number>>,
  ): Promise<Result<ResetUserPreferencesResponse>> {
    return this.ipcClient.invoke(SettingChannels.PREFERENCES_RESET, { expectedRevisions });
  }

  async getUserSettings(): Promise<Result<UserSettingClientDTO>> {
    return this.ipcClient.invoke(SettingChannels.GET_ALL);
  }

  async getUserSettingDefaults(): Promise<Result<UserSettingClientDTO>> {
    return this.ipcClient.invoke(SettingChannels.GET_DEFAULTS);
  }

  async patchCategory(
    category: PreferenceCategory,
    patch: Record<string, unknown>,
  ): Promise<Result<UserSettingClientDTO>> {
    return this.ipcClient.invoke(SettingChannels.PATCH, { category, patch });
  }

  async resetUserSettings(category?: string): Promise<Result<UserSettingClientDTO>> {
    return this.ipcClient.invoke(SettingChannels.RESET, { category });
  }

  async exportSettings(): Promise<Result<ExportSettingsRes>> {
    return this.ipcClient.invoke(SettingChannels.EXPORT);
  }

  async importSettings(data: string): Promise<Result<ImportSettingsRes>> {
    return this.ipcClient.invoke(SettingChannels.IMPORT, { data });
  }
}

export function createSettingIpcAdapter(ipcClient: IResultIpcClient): SettingIpcAdapter {
  return new SettingIpcAdapter(ipcClient);
}
