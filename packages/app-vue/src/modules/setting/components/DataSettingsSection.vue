<script setup lang="ts">
/** Data owner composition: V3 preferences portability + full Data Portability + Desktop UserFiles. */
import { inject, ref } from 'vue';
import { SystemChannels } from '@memoflow/contracts/electron';
import { isOk, type Result } from '@memoflow/contracts/result';
import { DESKTOP_AUTH_API_KEY } from '../../../di/keys';
import { usePreferencePortability } from '../composables/usePreferencePortability';
import { useDataPortability } from '../composables/useDataPortability';
import UserFilesSettings from './UserFilesSettings.vue';
import SettingAdvancedActions from './SettingAdvancedActions.vue';

const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);
const fileInput = ref<HTMLInputElement | null>(null);
const { exportSettings, importSettings } = usePreferencePortability();
const {
  isAvailable: isDataPortabilityAvailable,
  isServerDisclosureAvailable,
  isExporting: isExportingData,
  isExportingServerDisclosure,
  isImporting: isImportingData,
  lastResult: dataPortabilityResult,
  exportAllData,
  exportServerHeldDataDisclosure,
  importAllData,
} = useDataPortability();

type OpenTextResult = { canceled: boolean; content: string | null };

async function handlePreferenceImport(): Promise<void> {
  if (desktopApi?.invoke) {
    try {
      const response = (await desktopApi.invoke(SystemChannels.USER_FILES_OPEN_TEXT, {
        subdirectory: 'exports',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<OpenTextResult>;
      if (isOk(response) && !response.data.canceled && response.data.content) {
        await importSettings(JSON.parse(response.data.content));
      }
    } catch (error) {
      console.error('Failed to import preference JSON from Desktop file dialog:', error);
    }
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
        subdirectory: 'exports',
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
  reader.onload = async (loadEvent) => {
    try {
      const content = loadEvent.target?.result;
      if (typeof content === 'string') await importSettings(JSON.parse(content));
    } catch (error) {
      console.error('Failed to parse preference JSON:', error);
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
    <UserFilesSettings />
    <SettingAdvancedActions
      :exporting-data="isExportingData"
      :importing-data="isImportingData"
      :data-portability-available="isDataPortabilityAvailable"
      :server-data-disclosure-available="isServerDisclosureAvailable"
      :exporting-server-data-disclosure="isExportingServerDisclosure"
      :data-portability-result="dataPortabilityResult"
      @export-j-s-o-n="handlePreferenceExport"
      @import="handlePreferenceImport"
      @export-all-data="exportAllData"
      @export-server-data-disclosure="exportServerHeldDataDisclosure"
      @import-all-data="importAllData"
    />
  </section>
</template>
