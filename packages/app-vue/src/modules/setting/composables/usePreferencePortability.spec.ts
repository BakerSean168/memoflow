import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { usePreferencePortability } from './usePreferencePortability';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': { common: { operationFailed: 'Operation failed' }, setting: { errors: { exportFailed: 'Export failed', importFailed: 'Import failed' } } } },
});

function mountComposable(service: object) {
  let composable!: ReturnType<typeof usePreferencePortability>;
  mount(defineComponent({ setup() { composable = usePreferencePortability(); return () => h('div'); } }), {
    global: { plugins: [i18n], provide: { [SETTING_SERVICE_KEY as symbol]: service } },
  });
  return composable;
}

describe('usePreferencePortability', () => {
  it('returns the V3 export artifact', async () => {
    const artifact = { data: '{"schemaVersion":3}', fileName: 'memoflow-settings.json' };
    const service = { exportSettings: vi.fn().mockResolvedValue(ok(artifact)), importSettings: vi.fn() };
    const composable = mountComposable(service);
    await expect(composable.exportSettings()).resolves.toEqual(artifact);
    expect(service.exportSettings).toHaveBeenCalledTimes(1);
  });

  it('serializes V3 input exactly once and returns the receipt', async () => {
    const payload = { schemaVersion: 3, exportedAt: '2026-09-10T05:00:00.000Z', preferences: { presentation: { theme: 'dark', language: 'en-US' }, regional: { timeZone: 'Asia/Tokyo', dateStyle: 'long', timeStyle: '12h', weekStartsOn: 0 } } };
    const receipt = { schemaVersion: 3, imported: 2, skipped: 0, warnings: [] };
    const service = { exportSettings: vi.fn(), importSettings: vi.fn().mockResolvedValue(ok(receipt)) };
    const composable = mountComposable(service);
    await expect(composable.importSettings(payload)).resolves.toEqual(receipt);
    expect(service.importSettings).toHaveBeenCalledWith(JSON.stringify(payload));
  });
});
