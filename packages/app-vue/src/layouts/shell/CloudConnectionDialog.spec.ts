import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopCloudConnectionAttempt } from '@memoflow/contracts';
import { ok } from '@memoflow/contracts/result';
import { SystemChannels, WindowChannels } from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY, DESKTOP_CLOUD_AUTH_SERVICE_KEY } from '../../di/keys';
import { useAuthenticationStore } from '../../modules/authentication/stores/authentication-store';
import CloudConnectionDialog from './CloudConnectionDialog.vue';

const attempt: DesktopCloudConnectionAttempt = {
  attemptId: 'attempt-1',
  originProfileId: 'profile-1',
  result: null,
  userCode: 'ABCD1234',
  verificationUrl: 'https://app.memo.test/auth/device?user_code=ABCD1234',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'awaiting_authorization',
  error: null,
};

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { close: 'Close', cancel: 'Cancel', retry: 'Retry' },
      shell: {
        cloudConnection: {
          title: 'Connect',
          description: 'Continue in browser',
          ready: 'Ready',
          localProfile: 'Local Profile',
          code: 'Code',
          continue: 'Continue in browser',
          reopen: 'Reopen',
          copy: 'Copy',
          status: {
            requesting_code: 'Requesting',
            awaiting_authorization: 'Waiting',
            connecting_profile: 'Connecting',
            connected: 'Connected',
            denied: 'Denied',
            expired: 'Expired',
            cancelled: 'Cancelled',
            failed: 'Failed',
          },
        },
      },
    },
  },
});

const PassThrough = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, [slots.default?.(), slots.footer?.()]);
  },
});

function mountDialog(current: DesktopCloudConnectionAttempt | null) {
  const service = {
    beginCloudConnection: vi.fn().mockResolvedValue(ok(attempt)),
    getCurrentCloudConnection: vi.fn().mockResolvedValue(ok(current)),
    getCloudConnectionStatus: vi.fn().mockResolvedValue(ok(attempt)),
    cancelCloudConnection: vi.fn().mockResolvedValue(ok(undefined)),
    getSession: vi.fn().mockResolvedValue(ok({ account: null, session: null })),
    signOut: vi.fn(),
  };
  const invoke = vi.fn().mockResolvedValue(ok(undefined));
  const pinia = createPinia();
  const wrapper = mount(CloudConnectionDialog, {
    props: { open: true, profileName: 'Guest 4827' },
    global: {
      plugins: [pinia, i18n],
      provide: {
        [DESKTOP_CLOUD_AUTH_SERVICE_KEY as symbol]: service,
        [DESKTOP_BRIDGE_KEY as symbol]: { invoke },
      },
      stubs: {
        Dialog: PassThrough,
        ProductDialogShell: PassThrough,
        Tooltip: PassThrough,
        TooltipProvider: PassThrough,
        TooltipTrigger: PassThrough,
        TooltipContent: PassThrough,
      },
    },
  });
  return { wrapper, service, invoke, pinia };
}

describe('CloudConnectionDialog', () => {
  afterEach(() => vi.useRealTimers());

  it('restores a pending attempt without creating a second authorization', async () => {
    const { wrapper, service, invoke } = mountDialog(attempt);
    await flushPromises();

    expect(service.getCurrentCloudConnection).toHaveBeenCalledOnce();
    expect(service.beginCloudConnection).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="cloud-connection-status"]').text()).toBe('Waiting');

    await wrapper.get('[data-testid="cloud-connection-reopen"]').trigger('click');
    expect(invoke).toHaveBeenCalledWith(SystemChannels.OPEN_EXTERNAL_URL, {
      url: attempt.verificationUrl,
    });
    wrapper.unmount();
  });

  it('transitions to the independent Profile without hydrating the old renderer', async () => {
    vi.useFakeTimers();
    const { wrapper, service, invoke } = mountDialog(null);
    await flushPromises();
    await wrapper.get('[data-testid="cloud-connection-continue"]').trigger('click');
    await flushPromises();
    service.getCloudConnectionStatus.mockResolvedValue(
      ok({
        ...attempt,
        status: 'connected',
        result: { targetProfileId: 'profile-2', activation: 'pending' },
      }),
    );
    await vi.advanceTimersByTimeAsync(1_200);
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith(WindowChannels.TRANSITION_TO_PROFILE_ACCESS, 'profile-2');
    expect(service.getSession).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('hydrates the cloud session after connection without navigating', async () => {
    vi.useFakeTimers();
    const { wrapper, service, pinia } = mountDialog(null);
    await flushPromises();
    await wrapper.get('[data-testid="cloud-connection-continue"]').trigger('click');
    await flushPromises();
    vi.mocked(service.getCloudConnectionStatus).mockResolvedValue(
      ok({
        ...attempt,
        status: 'connected',
        result: { targetProfileId: 'profile-1', activation: 'active' },
      }),
    );
    vi.mocked(service.getSession).mockResolvedValue(
      ok({
        account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
        session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      }),
    );
    await vi.advanceTimersByTimeAsync(1_200);
    await flushPromises();

    expect(useAuthenticationStore(pinia).isAuthenticated).toBe(true);
    expect(wrapper.get('[data-testid="cloud-connection-status"]').text()).toBe('Connected');
    wrapper.unmount();
  });
});
