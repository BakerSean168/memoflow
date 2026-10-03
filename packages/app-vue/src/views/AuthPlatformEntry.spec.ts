import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import enAuth from '../locales/en-US/auth';
import zhAuth from '../locales/zh-CN/auth';
import AuthPlatformEntry from './AuthPlatformEntry.vue';

describe('AuthPlatformEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['en-US', enAuth],
    ['zh-CN', zhAuth],
  ] as const)('renders localized semantic loading status in %s', (locale, auth) => {
    const replace = vi.fn();
    vi.stubGlobal('location', { pathname: '/auth', search: '', hash: '#login', replace });
    const wrapper = mount(AuthPlatformEntry, {
      global: {
        plugins: [createI18n({ legacy: false, locale, messages: { [locale]: { auth } } })],
      },
    });
    const status = wrapper.get('[data-testid="auth-platform-entry"]');
    expect(status.text()).toBe(auth.page.redirecting);
    expect(status.attributes('role')).toBe('status');
    expect(status.attributes('aria-busy')).toBe('true');
    expect(status.attributes('data-state-family')).toBe('workspace');
    expect(status.classes()).toContain('bg-background');
    expect(status.classes()).not.toContain('text-white/60');
    expect(replace).toHaveBeenCalledExactlyOnceWith('/auth#login');
    wrapper.unmount();
  });

  it('full-page replaces the current /auth URL so AuthApp owns the surface', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/auth',
      search: '?redirect=%2Frepository',
      hash: '',
      replace,
    });

    const wrapper = mount(AuthPlatformEntry, {
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': { auth: enAuth } } }),
        ],
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="auth-platform-entry"]').exists()).toBe(true);
    expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Frepository');

    wrapper.unmount();
  });
});
