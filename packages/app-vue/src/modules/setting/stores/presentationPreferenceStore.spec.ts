import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import { createTestPinia } from '@memoflow/test-utils';
import { usePresentationPreferenceStore } from './presentation-preference-store';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
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

  it('syncs only from the canonical UserPreferenceProfile', () => {
    const store = usePresentationPreferenceStore();
    store.syncFromUserPreferenceProfile(profile);
    expect(store.locale).toBe('en-US');
    expect(store.theme).toBe('dark');
  });
});
