import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import { createTestPinia } from '@memoflow/test-utils';
import { SETTING_SERVICE_KEY } from '../../../di/keys';
import { getProductTime } from '../../../shared/utils/product-time';
import { usePresentationPreferenceStore } from '../stores/presentation-preference-store';
import { usePresentationBootstrap } from './usePresentationBootstrap';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

function mountComposable(result = ok(profile)) {
  let composable!: ReturnType<typeof usePresentationBootstrap>;
  const pinia = createTestPinia();
  const service = {
    getPreferenceProfile: vi.fn().mockResolvedValue(result),
  };

  mount(
    defineComponent({
      setup() {
        composable = usePresentationBootstrap();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [pinia],
        provide: { [SETTING_SERVICE_KEY as symbol]: service },
      },
    },
  );

  return { composable, service, pinia };
}

describe('usePresentationBootstrap canonical preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'setTimeout',
      vi.fn(() => 1),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('drives shared theme/locale and Product Time from the canonical profile', async () => {
    const { composable, service, pinia } = mountComposable();
    await composable.loadUserPreferences();

    expect(service.getPreferenceProfile).toHaveBeenCalledTimes(1);
    expect(usePresentationPreferenceStore(pinia).theme).toBe('dark');
    expect(usePresentationPreferenceStore(pinia).locale).toBe('en-US');
    expect(getProductTime().context).toMatchObject({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(getProductTime().presentation).toMatchObject({
      locale: 'en-US',
      dateStyle: 'long',
      timeStyle: '12h',
    });
  });

  it('never falls back to legacy settings when the canonical profile fails', async () => {
    const error = fail({ code: 'SERVICE_UNAVAILABLE', message: 'down' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { composable, service } = mountComposable(error);

    await composable.loadUserPreferences();

    expect(service.getPreferenceProfile).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
