/**
 * useDataPortability — composable for importable data backup/restore and the
 * separate server-held data disclosure.
 *
 * Uses DataPortabilityClientService via DI for the V3 export, dry-run and apply
 * product surface. Handles file save/open via platform-specific IPC.
 */

import { ref, inject } from 'vue';
import { SystemChannels } from '@memoflow/contracts/electron';
import { isOk, type Result } from '@memoflow/contracts/result';
import { DATA_PORTABILITY_SERVICE_KEY, DESKTOP_AUTH_API_KEY } from '../../../di/keys';
import {
  getGlobalResultErrorT,
  translateResultError,
} from '../../../shared/utils/translate-result-error';

export function useDataPortability() {
  const service = inject(DATA_PORTABILITY_SERVICE_KEY, undefined);
  const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);
  const t = getGlobalResultErrorT();

  const isAvailable = ref(service !== undefined);
  const isServerDisclosureAvailable = ref(service !== undefined && desktopApi === undefined);
  const isExporting = ref(false);
  const isExportingServerDisclosure = ref(false);
  const isImporting = ref(false);
  const lastResult = ref<string | null>(null);

  async function saveJsonFile(fileName: string, content: string): Promise<void> {
    if (desktopApi?.invoke) {
      const response = (await desktopApi.invoke(SystemChannels.USER_FILES_SAVE_TEXT, {
        subdirectory: 'exports',
        defaultFileName: fileName,
        content,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<{ canceled: boolean; filePath: string | null }>;
      if (!isOk(response)) {
        throw new Error(
          translateResultError(response.error, t, {
            scope: 'setting',
            fallbackKey: 'setting.errors.exportFailed',
          }),
        );
      }
      return;
    }

    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportAllData(): Promise<void> {
    if (!service) {
      lastResult.value = 'Data export is not available in this runtime';
      return;
    }

    isExporting.value = true;
    lastResult.value = null;
    try {
      const result = await service.exportPortableDataV3({});
      if (!result.ok) {
        lastResult.value = translateResultError(result.error, t, {
          scope: 'setting',
          fallbackKey: 'setting.errors.exportFailed',
        });
        return;
      }

      const { fileName, content, summary } = result.data;
      const warnings =
        summary.warnings.length > 0 ? `\nWarnings: ${summary.warnings.join(', ')}` : '';

      await saveJsonFile(fileName, content);

      lastResult.value = `Exported capabilities: ${summary.capabilityKeys.join(', ')}${warnings}`;
    } catch (err) {
      lastResult.value = `Export error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isExporting.value = false;
    }
  }

  async function exportServerHeldDataDisclosure(): Promise<void> {
    if (!service || desktopApi !== undefined) {
      lastResult.value =
        'Server-held data disclosure is available from the authenticated Web runtime';
      return;
    }

    isExportingServerDisclosure.value = true;
    lastResult.value = null;
    try {
      const result = await service.exportServerHeldDataDisclosure({});
      if (!result.ok) {
        lastResult.value = translateResultError(result.error, t, {
          scope: 'setting',
          fallbackKey: 'setting.errors.exportFailed',
        });
        return;
      }

      const { fileName, content, summary } = result.data;
      await saveJsonFile(fileName, content);
      const counts = Object.entries(summary.entityCounts)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      lastResult.value = `Disclosed ${counts}; cached attachment bytes: ${summary.cachedAttachmentBytes}`;
    } catch (err) {
      lastResult.value = `Disclosure export error: ${
        err instanceof Error ? err.message : String(err)
      }`;
    } finally {
      isExportingServerDisclosure.value = false;
    }
  }

  async function importAllData(): Promise<void> {
    if (!service) {
      lastResult.value = 'Data import is not available in this runtime';
      return;
    }

    isImporting.value = true;
    lastResult.value = null;
    try {
      let content: string | null = null;

      if (desktopApi?.invoke) {
        const response = (await desktopApi.invoke(SystemChannels.USER_FILES_OPEN_TEXT, {
          subdirectory: 'exports',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })) as Result<{ canceled: boolean; content: string | null }>;
        if (!isOk(response) || response.data.canceled || !response.data.content) {
          isImporting.value = false;
          return;
        }
        content = response.data.content;
      } else {
        // Web: use file input
        content = await new Promise<string | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) {
              resolve(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string) ?? null);
            reader.readAsText(file);
          };
          input.click();
        });
      }

      if (!content) {
        isImporting.value = false;
        return;
      }

      const dryRun = await service.dryRunPortableDataV3({ content });
      if (!dryRun.ok) {
        lastResult.value = translateResultError(dryRun.error, t, {
          scope: 'setting',
          fallbackKey: 'setting.errors.importFailed',
        });
        return;
      }

      const result = await service.applyPortableDataV3({ content });
      if (!result.ok) {
        lastResult.value = translateResultError(result.error, t, {
          scope: 'setting',
          fallbackKey: 'setting.errors.importFailed',
        });
        return;
      }

      const { created, updated, warnings } = result.data;
      const createdCounts = Object.entries(created)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      const updatedCounts = Object.entries(updated)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      const parts = [];
      if (createdCounts) parts.push(`Created: ${createdCounts}`);
      if (updatedCounts) parts.push(`Updated: ${updatedCounts}`);
      if (warnings.length > 0) parts.push(`Warnings: ${warnings.join(', ')}`);
      lastResult.value = parts.join(' | ') || 'Import completed (no data)';
    } catch (err) {
      lastResult.value = `Import error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isImporting.value = false;
    }
  }

  return {
    isAvailable,
    isServerDisclosureAvailable,
    isExporting,
    isExportingServerDisclosure,
    isImporting,
    lastResult,
    exportAllData,
    exportServerHeldDataDisclosure,
    importAllData,
  };
}
