import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { CloudAuthWebClientPort } from '@memoflow/contracts';
const githubPopupMocks = vi.hoisted(() => ({
  startGithubPopupSignIn: vi.fn(async () => ({ kind: 'authenticated' as const })),
}));
vi.mock('./github-popup-sign-in', () => ({
  startGithubPopupSignIn: githubPopupMocks.startGithubPopupSignIn,
}));

import DeviceAuthorizationView from './DeviceAuthorizationView.vue';
import { AUTH_WEB_SERVICE_KEY } from './service';

const ButtonStub = defineComponent({
  props: ['type', 'disabled', 'variant'],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        { ...attrs, type: props.type ?? 'button', disabled: props.disabled },
        slots.default?.(),
      );
  },
});

function createService(): CloudAuthWebClientPort {
  return {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(
      ok({
        account: { id: 'user-1', email: 'user@example.com', name: 'User', emailVerified: true },
        session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      }),
    ),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    beginGithubSignIn: vi.fn(),
    getDeviceAuthorization: vi
      .fn()
      .mockResolvedValue(ok({ userCode: 'ABCD1234', status: 'pending' })),
    approveDeviceAuthorization: vi.fn().mockResolvedValue(ok(undefined)),
    denyDeviceAuthorization: vi.fn().mockResolvedValue(ok(undefined)),
  };
}

function mountView(service: CloudAuthWebClientPort) {
  return mount(DeviceAuthorizationView, {
    global: {
      provide: { [AUTH_WEB_SERVICE_KEY as symbol]: service },
      stubs: {
        Button: ButtonStub,
        Input: true,
        Loader2: true,
      },
    },
  });
}

describe('DeviceAuthorizationView', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/auth/device?user_code=ABCD-1234');
    githubPopupMocks.startGithubPopupSignIn.mockReset();
    githubPopupMocks.startGithubPopupSignIn.mockResolvedValue({ kind: 'authenticated' });
  });

  it('claims the device code with the current Web session and requires explicit approval', async () => {
    const service = createService();
    const wrapper = mountView(service);
    await flushPromises();

    expect(service.getDeviceAuthorization).toHaveBeenCalledWith('ABCD1234');
    expect(wrapper.find('[data-testid="device-auth-approval"]').exists()).toBe(true);
    expect(service.approveDeviceAuthorization).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="device-auth-approve"]').trigger('click');
    await flushPromises();

    expect(service.approveDeviceAuthorization).toHaveBeenCalledWith('ABCD1234');
    expect(wrapper.find('[data-testid="device-auth-approved"]').exists()).toBe(true);
  });

  it('does not claim a code before the browser has an authenticated session', async () => {
    const service = createService();
    vi.mocked(service.getSession).mockResolvedValue(ok({ account: null, session: null }));
    const wrapper = mountView(service);
    await flushPromises();

    expect(wrapper.find('[data-testid="device-auth-sign-in"]').exists()).toBe(true);
    expect(service.getDeviceAuthorization).not.toHaveBeenCalled();
  });

  it('supports explicit denial and renders the terminal state', async () => {
    const service = createService();
    const wrapper = mountView(service);
    await flushPromises();

    await wrapper.get('[data-testid="device-auth-deny"]').trigger('click');
    await flushPromises();

    expect(service.denyDeviceAuthorization).toHaveBeenCalledWith('ABCD1234');
    expect(wrapper.find('[data-testid="device-auth-denied"]').exists()).toBe(true);
  });

  it('renders an already processed code without approving it again', async () => {
    const service = createService();
    vi.mocked(service.getDeviceAuthorization).mockResolvedValue(
      ok({
        userCode: 'ABCD1234',
        status: 'approved',
      }),
    );
    const wrapper = mountView(service);
    await flushPromises();

    expect(wrapper.find('[data-testid="device-auth-approved"]').exists()).toBe(true);
    expect(service.approveDeviceAuthorization).not.toHaveBeenCalled();
  });

  it('distinguishes an expired code from an invalid request', async () => {
    const service = createService();
    vi.mocked(service.getDeviceAuthorization).mockResolvedValue(
      fail({
        code: 'EXPIRED_TOKEN',
        message: 'expired token',
      }),
    );
    const wrapper = mountView(service);
    await flushPromises();

    expect(wrapper.find('[data-testid="device-auth-expired"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('授权码已过期');
    expect(wrapper.text()).not.toContain('授权码无效。');
  });

  it('offers code entry when opened without a user code', async () => {
    window.history.replaceState({}, '', '/auth/device');
    const service = createService();
    const wrapper = mountView(service);
    await flushPromises();

    expect(wrapper.find('form').exists()).toBe(true);
    expect(service.getSession).not.toHaveBeenCalled();
  });

  it('uses the shared GitHub popup flow and keeps the device code on the parent page', async () => {
    const service = createService();
    vi.mocked(service.getSession)
      .mockResolvedValueOnce(ok({ account: null, session: null }))
      .mockResolvedValue(
        ok({
          account: { id: 'user-1', email: 'user@example.com', name: 'User', emailVerified: true },
          session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
        }),
      );
    const wrapper = mountView(service);
    await flushPromises();

    await wrapper.get('[data-testid="device-auth-sign-in"] button').trigger('click');
    await flushPromises();

    expect(githubPopupMocks.startGithubPopupSignIn).toHaveBeenCalledWith(service);
    expect(service.getDeviceAuthorization).toHaveBeenCalledWith('ABCD1234');
    expect(wrapper.find('[data-testid="device-auth-approval"]').exists()).toBe(true);
    expect(window.location.pathname).toBe('/auth/device');
  });

  it('surfaces a popup/provider failure without navigating the device page', async () => {
    const service = createService();
    vi.mocked(service.getSession).mockResolvedValue(ok({ account: null, session: null }));
    githubPopupMocks.startGithubPopupSignIn.mockResolvedValueOnce({
      kind: 'failed',
      error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'GitHub 登录暂不可用' },
    });
    const wrapper = mountView(service);
    await flushPromises();

    await wrapper.get('[data-testid="device-auth-sign-in"] button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('GitHub 登录暂不可用');
    expect(window.location.pathname).toBe('/auth/device');
  });
});
