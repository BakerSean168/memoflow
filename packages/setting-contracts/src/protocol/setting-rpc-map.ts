import type {
  ExportSettingsReq,
  ExportSettingsRes,
  ImportSettingsReq,
  ImportSettingsRes,
  PatchPreferenceNamespaceBody,
  ResetPreferenceNamespaceBody,
  ResetUserPreferencesBody,
  ResetUserPreferencesResponse,
} from '../api';
import type {
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespaceResponse,
  UserPreferenceProfile,
} from '../preferences';

export type SettingRpcMap = {
  'setting:export': [ExportSettingsReq, ExportSettingsRes];
  'setting:import': [ImportSettingsReq, ImportSettingsRes];
  'setting:preferences:profile': [void, UserPreferenceProfile];
  'setting:preference:get': [PreferenceNamespace, PreferenceNamespaceResponse];
  'setting:preference:patch': [
    { namespace: PreferenceNamespace; body: PatchPreferenceNamespaceBody },
    PreferenceMutationReceipt,
  ];
  'setting:preference:reset': [
    { namespace: PreferenceNamespace; body: ResetPreferenceNamespaceBody },
    PreferenceMutationReceipt,
  ];
  'setting:preferences:reset': [ResetUserPreferencesBody, ResetUserPreferencesResponse];
};
