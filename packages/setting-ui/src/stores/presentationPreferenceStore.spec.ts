import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import type { UserPreferenceProfile } from '@memoflow/setting-contracts';
import { createTestPinia } from '@memoflow/test-utils';
import { usePresentationPreferenceStore } from './presentation-preference-store';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US', accent: 'violet' },
  regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
};

describe('usePresentationPreferenceStore', () => {
  beforeEach(() => {
    createTestPinia();
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
  });

  it('normalizes locale and theme through direct setters', () => {
    const store = usePresentationPreferenceStore();
    store.setLocale('zh-CN');
    store.setTheme('dark');
    expect(store.locale).toBe('zh-CN');
    expect(store.theme).toBe('dark');

    store.setLocale('fr-FR' as never);
    store.setTheme('sepia' as never);
    expect(store.locale).toBe('en-US');
    expect(store.theme).toBe('auto');
  });

  it('defaults the accent to brand gold and rejects unknown values', () => {
    const store = usePresentationPreferenceStore();
    expect(store.accent).toBe('brand-gold');

    store.setAccent('ocean-blue');
    expect(store.accent).toBe('ocean-blue');

    store.setAccent('amber' as never);
    expect(store.accent).toBe('brand-gold');
  });

  it('syncs only from the canonical UserPreferenceProfile', () => {
    const store = usePresentationPreferenceStore();
    store.syncFromUserPreferenceProfile(profile);
    expect(store.locale).toBe('en-US');
    expect(store.theme).toBe('dark');
    expect(store.accent).toBe('violet');
  });

  it('falls back to brand gold when the canonical profile predates accents', () => {
    const store = usePresentationPreferenceStore();
    store.setAccent('rose-red');
    const legacyProfile = {
      ...profile,
      presentation: { theme: 'light', language: 'zh-CN' },
    } as unknown as UserPreferenceProfile;

    store.syncFromUserPreferenceProfile(legacyProfile);

    expect(store.theme).toBe('light');
    expect(store.accent).toBe('brand-gold');
  });

  it('persists locale, theme, and accent under the presentation-preference key', async () => {
    localStorage.clear();
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);

    const store = usePresentationPreferenceStore();
    store.setAccent('violet');
    await nextTick();

    expect(JSON.parse(localStorage.getItem('presentation-preference') ?? '{}')).toEqual({
      locale: 'en-US',
      theme: 'auto',
      accent: 'violet',
    });
  });
});
