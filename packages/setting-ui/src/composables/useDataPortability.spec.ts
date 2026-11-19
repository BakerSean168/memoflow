import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'vue-sonner';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { DATA_PORTABILITY_SERVICE_KEY, DESKTOP_AUTH_API_KEY } from '@setting-ui-test-host/di/keys';
import { createI18nPlugin } from '@setting-ui-test-host/plugins/i18n';
import { useDataPortability } from './useDataPortability';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@memoflow/ui-vue-shadcn', () => ({
  useConfirm: confirmMock,
}));

const messages = {
  common: { cancel: 'Cancel' },
  setting: {
    advanced: {
      exportUnavailable: 'Export unavailable',
      importUnavailable: 'Import unavailable',
      exportCompleted: 'Export completed: {capabilities}',
      importCompleted: 'Import completed: created {created}, updated {updated}',
      importConfirmTitle: 'Import this data backup?',
      importConfirmDescription: 'New entries: {created} · Updated entries: {updated}. Continue?',
      importConfirm: 'Import',
      importWarnings: 'Warnings: {warnings}',
    },
    errors: {
      exportFailed: 'Export failed',
      importFailed: 'Import failed',
    },
  },
};

type Composable = ReturnType<typeof useDataPortability>;

function mountComposable(service: object, desktopApi: { invoke: ReturnType<typeof vi.fn> }) {
  const i18n = createI18nPlugin('en-US', messages);
  let composable!: Composable;
  mount(
    defineComponent({
      setup() {
        composable = useDataPortability();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [i18n],
        provide: {
          [DATA_PORTABILITY_SERVICE_KEY as symbol]: service,
          [DESKTOP_AUTH_API_KEY as symbol]: desktopApi,
        },
      },
    },
  );
  return composable;
}

function createService() {
  return {
    exportPortableDataV3: vi.fn(async () =>
      ok({
        fileName: 'memoflow-data.json',
        content: '{}',
        summary: { capabilityKeys: ['task', 'goal'], warnings: [] },
      }),
    ),
    exportServerHeldDataDisclosure: vi.fn(),
    dryRunPortableDataV3: vi.fn(async () =>
      ok({
        batchId: 'batch-1',
        dryRun: true,
        capabilities: [],
        created: { task: 2 },
        updated: { goal: 1 },
        skipped: {},
        warnings: [],
      }),
    ),
    applyPortableDataV3: vi.fn(async () =>
      ok({ created: { task: 2 }, updated: { goal: 1 }, warnings: [] }),
    ),
  };
}

function createDesktopApi(content = '{"schemaVersion":3}') {
  return {
    invoke: vi.fn(async (channel: string) =>
      channel === SystemChannels.USER_FILES_OPEN_TEXT
        ? ok({ canceled: false, content })
        : ok({ canceled: false, filePath: '/tmp/export.json' }),
    ),
  };
}

describe('useDataPortability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue(true);
  });

  it('previews the dry-run counts and applies only after confirmation', async () => {
    const service = createService();
    const composable = mountComposable(service, createDesktopApi());

    await composable.importAllData();
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledWith({
      title: 'Import this data backup?',
      description: 'New entries: 2 · Updated entries: 1. Continue?',
      confirmText: 'Import',
      cancelText: 'Cancel',
    });
    expect(service.applyPortableDataV3).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Import completed: created 2, updated 1');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not apply the import when the confirmation is cancelled', async () => {
    const service = createService();
    confirmMock.mockResolvedValueOnce(false);
    const composable = mountComposable(service, createDesktopApi());

    await composable.importAllData();
    await flushPromises();

    expect(service.dryRunPortableDataV3).toHaveBeenCalledTimes(1);
    expect(service.applyPortableDataV3).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports export failures as errors and keeps no persistent result state', async () => {
    const service = createService();
    service.exportPortableDataV3.mockResolvedValueOnce(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'unavailable' }),
    );
    const composable = mountComposable(service, createDesktopApi());

    await composable.exportAllData();
    await flushPromises();

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect('lastResult' in composable).toBe(false);
  });
});
