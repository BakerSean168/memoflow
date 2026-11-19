<script setup lang="ts">
/** Data owner composition: V3 preferences portability + full Data Portability + Desktop native file dialogs. */
import { inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { isOk, type Result } from '@memoflow/transport-contracts/result';
import { settingUiHost } from '../setting-ui-host';
import { usePreferencePortability } from '../composables/usePreferencePortability';
import { useDataPortability } from '../composables/useDataPortability';
import SettingAdvancedActions from './SettingAdvancedActions.vue';

const { t } = useI18n();
const desktopApi = inject(settingUiHost.DESKTOP_AUTH_API_KEY, undefined);
const fileInput = ref<HTMLInputElement | null>(null);
const { error: preferenceImportError, exportSettings, importSettings } = usePreferencePortability();
const {
  isAvailable: isDataPortabilityAvailable,
  isServerDisclosureAvailable,
  isExporting: isExportingData,
  isExportingServerDisclosure,
  isImporting: isImportingData,
  exportAllData,
  exportServerHeldDataDisclosure,
  importAllData,
} = useDataPortability();

type OpenTextResult = { canceled: boolean; content: string | null };

async function importPreferenceContent(content: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    toast.error(t('setting.advanced.preferenceContentInvalid'));
    return;
  }

  const receipt = await importSettings(parsed);
  if (!receipt) {
    toast.error(preferenceImportError.value ?? t('setting.advanced.preferenceContentInvalid'));
  }
}

async function handlePreferenceImport(): Promise<void> {
  if (desktopApi?.invoke) {
    let response: Result<OpenTextResult>;
    try {
      response = (await desktopApi.invoke(SystemChannels.USER_FILES_OPEN_TEXT, {
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<OpenTextResult>;
    } catch {
      toast.error(t('setting.advanced.preferenceFileUnreadable'));
      return;
    }
    if (!isOk(response)) {
      toast.error(t('setting.advanced.preferenceFileUnreadable'));
      return;
    }
    if (response.data.canceled) return;
    if (!response.data.content) {
      toast.error(t('setting.advanced.preferenceFileUnreadable'));
      return;
    }
    await importPreferenceContent(response.data.content);
    return;
  }
  fileInput.value?.click();
}

async function handlePreferenceExport(): Promise<void> {
  const exported = await exportSettings();
  if (!exported) return;

  if (desktopApi?.invoke) {
    try {
      const response = (await desktopApi.invoke(SystemChannels.USER_FILES_SAVE_TEXT, {
        defaultFileName: exported.fileName,
        content: exported.data,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<{ canceled: boolean; filePath: string | null }>;
      if (isOk(response)) return;
      console.error('Failed to export preference JSON via Desktop file dialog:', response.error);
    } catch (error) {
      console.error('Failed to export preference JSON via Desktop file dialog:', error);
    }
  }

  const blob = new Blob([exported.data], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exported.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => {
    toast.error(t('setting.advanced.preferenceFileUnreadable'));
    input.value = '';
  };
  reader.onload = async (loadEvent) => {
    try {
      const content = loadEvent.target?.result;
      if (typeof content !== 'string') {
        toast.error(t('setting.advanced.preferenceContentInvalid'));
        return;
      }
      await importPreferenceContent(content);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}
</script>

<template>
  <section class="space-y-8" data-testid="data-settings-section">
    <input
      ref="fileInput"
      type="file"
      accept=".json"
      class="hidden"
      aria-hidden="true"
      @change="onFileSelected"
    />
    <SettingAdvancedActions
      :exporting-data="isExportingData"
      :importing-data="isImportingData"
      :data-portability-available="isDataPortabilityAvailable"
      :server-data-disclosure-available="isServerDisclosureAvailable"
      :exporting-server-data-disclosure="isExportingServerDisclosure"
      @export-j-s-o-n="handlePreferenceExport"
      @import="handlePreferenceImport"
      @export-all-data="exportAllData"
      @export-server-data-disclosure="exportServerHeldDataDisclosure"
      @import-all-data="importAllData"
    />
  </section>
</template>
