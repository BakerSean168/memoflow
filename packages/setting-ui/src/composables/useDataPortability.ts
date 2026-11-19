/**
 * useDataPortability — composable for importable data backup/restore and the
 * separate server-held data disclosure.
 *
 * Uses DataPortabilityClientService via DI for the V3 export, dry-run and apply
 * product surface. Handles file save/open via platform-specific IPC.
 */

import { ref, inject } from 'vue';
import { toast } from 'vue-sonner';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { useConfirm } from '@memoflow/ui-vue-shadcn';
import { isOk, type Result } from '@memoflow/transport-contracts/result';
import { settingUiHost } from '../setting-ui-host';

type PortableImportReceipt = {
  created?: Record<string, number>;
  updated?: Record<string, number>;
  warnings?: string[];
};

function sumCounts(counts: Record<string, number> | undefined): number {
  return Object.values(counts ?? {}).reduce((total, count) => total + count, 0);
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

export function useDataPortability() {
  const service = inject(settingUiHost.DATA_PORTABILITY_SERVICE_KEY, undefined);
  const desktopApi = inject(settingUiHost.DESKTOP_AUTH_API_KEY, undefined);
  const t = settingUiHost.getGlobalResultErrorT();

  const isAvailable = ref(service !== undefined);
  const isServerDisclosureAvailable = ref(service !== undefined && desktopApi === undefined);
  const isExporting = ref(false);
  const isExportingServerDisclosure = ref(false);
  const isImporting = ref(false);

  async function saveJsonFile(fileName: string, content: string): Promise<void> {
    if (desktopApi?.invoke) {
      const response = (await desktopApi.invoke(SystemChannels.USER_FILES_SAVE_TEXT, {
        defaultFileName: fileName,
        content,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as Result<{ canceled: boolean; filePath: string | null }>;
      if (!isOk(response)) {
        throw new Error(
          settingUiHost.translateResultError(response.error, t, {
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
      toast.error(t('setting.advanced.exportUnavailable'));
      return;
    }

    isExporting.value = true;
    try {
      const result = await service.exportPortableDataV3({});
      if (!result.ok) {
        toast.error(
          settingUiHost.translateResultError(result.error, t, {
            scope: 'setting',
            fallbackKey: 'setting.errors.exportFailed',
          }),
        );
        return;
      }

      const { fileName, content, summary } = result.data;
      await saveJsonFile(fileName, content);

      const capabilities = summary.capabilityKeys.join(', ');
      const warnings =
        summary.warnings.length > 0
          ? ` ${t('setting.advanced.importWarnings', { warnings: summary.warnings.join(', ') })}`
          : '';
      toast.success(`${t('setting.advanced.exportCompleted', { capabilities })}${warnings}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setting.errors.exportFailed'));
    } finally {
      isExporting.value = false;
    }
  }

  async function exportServerHeldDataDisclosure(): Promise<void> {
    if (!service || desktopApi !== undefined) {
      toast.error(t('setting.advanced.serverDisclosureUnavailable'));
      return;
    }

    isExportingServerDisclosure.value = true;
    try {
      const result = await service.exportServerHeldDataDisclosure({});
      if (!result.ok) {
        toast.error(
          settingUiHost.translateResultError(result.error, t, {
            scope: 'setting',
            fallbackKey: 'setting.errors.exportFailed',
          }),
        );
        return;
      }

      const { fileName, content, summary } = result.data;
      await saveJsonFile(fileName, content);
      toast.success(
        t('setting.advanced.serverDisclosureCompleted', {
          counts: formatCounts(summary.entityCounts),
          bytes: summary.cachedAttachmentBytes,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setting.errors.exportFailed'));
    } finally {
      isExportingServerDisclosure.value = false;
    }
  }

  async function importAllData(): Promise<void> {
    if (!service) {
      toast.error(t('setting.advanced.importUnavailable'));
      return;
    }

    isImporting.value = true;
    try {
      let content: string | null = null;

      if (desktopApi?.invoke) {
        const response = (await desktopApi.invoke(SystemChannels.USER_FILES_OPEN_TEXT, {
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
        toast.error(
          settingUiHost.translateResultError(dryRun.error, t, {
            scope: 'setting',
            fallbackKey: 'setting.errors.importFailed',
          }),
        );
        return;
      }

      const preview = (dryRun.data ?? {}) as PortableImportReceipt;
      isImporting.value = false;
      const confirmed = await useConfirm({
        title: t('setting.advanced.importConfirmTitle'),
        description: t('setting.advanced.importConfirmDescription', {
          created: sumCounts(preview.created),
          updated: sumCounts(preview.updated),
        }),
        confirmText: t('setting.advanced.importConfirm'),
        cancelText: t('common.cancel'),
      });
      if (!confirmed) return;
      isImporting.value = true;

      const result = await service.applyPortableDataV3({ content });
      if (!result.ok) {
        toast.error(
          settingUiHost.translateResultError(result.error, t, {
            scope: 'setting',
            fallbackKey: 'setting.errors.importFailed',
          }),
        );
        return;
      }

      const { created, updated, warnings } = result.data;
      const warningsText =
        warnings.length > 0
          ? ` ${t('setting.advanced.importWarnings', { warnings: warnings.join(', ') })}`
          : '';
      toast.success(
        `${t('setting.advanced.importCompleted', {
          created: sumCounts(created),
          updated: sumCounts(updated),
        })}${warningsText}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('setting.errors.importFailed'));
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
    exportAllData,
    exportServerHeldDataDisclosure,
    importAllData,
  };
}
