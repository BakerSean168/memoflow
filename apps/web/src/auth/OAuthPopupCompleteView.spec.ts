import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import OAuthPopupCompleteView from './OAuthPopupCompleteView.vue';
import { createAuthI18n } from './i18n';
import { AUTH_WEB_SERVICE_KEY } from './service';

const service = {
  getSession: vi.fn(),
};

describe('OAuthPopupCompleteView', () => {
  const postMessage = vi.fn();
  const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/auth/popup-complete?provider=github&requestId=request-1');
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: {
        closed: false,
        postMessage,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: null,
    });
  });

  it('verifies the shared session, notifies the same-origin opener, and closes itself', async () => {
    service.getSession.mockResolvedValue(
      ok({
        account: { id: 'account-1', email: 'person@example.com' },
        session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      }),
    );

    const wrapper = mount(OAuthPopupCompleteView, {
      global: {
        plugins: [createAuthI18n('zh-CN')],
        provide: {
          [AUTH_WEB_SERVICE_KEY as symbol]: service,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="oauth-popup-complete"]').exists()).toBe(true);
    expect(service.getSession).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'memoflow:oauth-popup-complete',
        provider: 'github',
        requestId: 'request-1',
      },
      window.location.origin,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not notify or close for an invalid completion request', async () => {
    window.history.replaceState({}, '', '/auth/popup-complete?provider=github');
    const wrapper = mount(OAuthPopupCompleteView, {
      global: {
        plugins: [createAuthI18n('zh-CN')],
        provide: {
          [AUTH_WEB_SERVICE_KEY as symbol]: service,
        },
      },
    });
    await flushPromises();

    expect(service.getSession).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('无法完成 GitHub 登录');
  });
});
