import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { ok, fail } from '@memoflow/transport-contracts/result';
import { _getConfirmState, _resolveConfirm } from '@memoflow/ui-vue-shadcn';
import { buildDesktopUserAgent } from '@memoflow/cloud-auth-contracts';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';
import account from '@account-ui-test-host/locales/en-US/account';
import CloudAccountSecuritySection from './CloudAccountSecuritySection.vue';

vi.mock('../composables/useAccountSignOut', () => ({
  useAccountSignOut: () => ({ isDesktopSignOut: { value: false }, executeSignOut: vi.fn() }),
}));
afterEach(() => {
  document.body.innerHTML = '';
});
function fixture(
  sessionsResult: unknown = ok([
    {
      id: 'current',
      current: true,
      userAgent: 'This device',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'other',
      current: false,
      userAgent: 'Other device',
      createdAt: new Date().toISOString(),
    },
  ]),
) {
  const service = {
    requestAccountVerification: vi.fn().mockResolvedValue(
      ok({
        challengeId: '00000000-0000-4000-8000-000000000000',
        retryAfterSeconds: 0,
        expiresInSeconds: 600,
      }),
    ),
    verifyAccountVerification: vi.fn().mockResolvedValue(ok({ verificationToken: 'v'.repeat(43) })),
    verifyAccountPassword: vi.fn().mockResolvedValue(ok(undefined)),
    requestEmailChange: vi.fn().mockResolvedValue(ok(undefined)),
    listAccountSessions: vi.fn().mockResolvedValue(sessionsResult),
    revokeAccountSession: vi.fn().mockResolvedValue(ok(undefined)),
    deleteAccountPermanently: vi.fn().mockResolvedValue(ok(undefined)),
  };
  const wrapper = mount(CloudAccountSecuritySection, {
    props: { email: 'person@example.com' },
    attachTo: document.body,
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { account, common: { refresh: 'Refresh', cancel: 'Cancel' } } },
        }),
      ],
      provide: { [CLOUD_ACCOUNT_SECURITY_KEY as symbol]: service },
    },
  });
  return { wrapper, service };
}
async function input(testId: string, value: string) {
  const element = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
}
function submit(testId: string) {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}
async function passEmailVerification(wrapper: ReturnType<typeof fixture>['wrapper']) {
  await wrapper.get('[data-testid="account-change-email"]').trigger('click');
  await flushPromises();
  submit('account-verification-send');
  await flushPromises();
  await input('account-verification-code', '123456');
  submit('account-verification-verify');
  await flushPromises();
}

describe('CloudAccountSecuritySection', () => {
  it('masks the email, lists devices and revokes only the other session after confirmation', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    expect(wrapper.text()).toContain('p***@example.com');
    expect(wrapper.text()).not.toContain('person@example.com');
    expect(wrapper.find('[data-testid="account-sessions"]').exists()).toBe(false);
    await wrapper.get('[data-testid="account-devices-open"]').trigger('click');
    expect(wrapper.findAll('[data-testid="account-session-revoke"]')).toHaveLength(1);
    await wrapper.get('[data-testid="account-session-revoke"]').trigger('click');
    await flushPromises();
    expect(_getConfirmState()).toMatchObject({
      open: true,
      title: 'Revoke this session?',
      description:
        'That device will be signed out and will need to sign in again before it can continue.',
      variant: 'destructive',
    });
    expect(service.revokeAccountSession).not.toHaveBeenCalled();
    _resolveConfirm(false);
    await flushPromises();
    expect(service.revokeAccountSession).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="account-session-revoke"]').trigger('click');
    await flushPromises();
    _resolveConfirm(true);
    await flushPromises();
    expect(service.revokeAccountSession).toHaveBeenCalledWith('other');
    wrapper.unmount();
  });
  it('navigates between the account overview and devices without losing the session count', async () => {
    const { wrapper } = fixture();
    await flushPromises();
    expect(wrapper.get('[data-testid="account-devices-open"]').text()).toContain('2 devices');
    await wrapper.get('[data-testid="account-devices-open"]').trigger('click');
    expect(wrapper.find('[data-testid="account-information-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="account-devices-page"]').exists()).toBe(true);
    await wrapper.get('[data-testid="account-devices-back"]').trigger('click');
    expect(wrapper.find('[data-testid="account-devices-page"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="account-information-section"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="account-devices-open"]').text()).toContain('2 devices');
    wrapper.unmount();
  });
  it('requires password recheck before asking for the new email and displays failures', async () => {
    const { wrapper, service } = fixture();
    service.verifyAccountPassword.mockResolvedValueOnce(
      fail({ code: 'INVALID_PASSWORD', message: 'Wrong password' }),
    );
    await passEmailVerification(wrapper);
    expect(service.requestAccountVerification).toHaveBeenCalledWith('change-email');
    expect(document.querySelector('[data-testid="account-email-dialog"]')).not.toBeNull();
    await input('account-email-password', 'wrong-password');
    submit('account-email-submit');
    await flushPromises();
    expect(document.body.textContent).toContain('Wrong password');
    expect(service.requestEmailChange).not.toHaveBeenCalled();
    await input('account-email-password', 'correct-password');
    submit('account-email-submit');
    await flushPromises();
    await input('account-email-new', 'new@example.com');
    submit('account-email-submit');
    await flushPromises();
    expect(service.requestEmailChange).toHaveBeenCalledWith({
      password: 'correct-password',
      newEmail: 'new@example.com',
      verificationToken: 'v'.repeat(43),
    });
    expect(document.querySelector('[data-testid="account-email-sent"]')).not.toBeNull();
    wrapper.unmount();
  });
  it('uses an in-app deletion dialog and requires both password and exact confirmation', async () => {
    const nativeConfirm = vi.fn();
    vi.stubGlobal('confirm', nativeConfirm);
    const { wrapper, service } = fixture();
    await wrapper.get('[data-testid="account-delete-open"]').trigger('click');
    await flushPromises();
    expect(
      document.querySelector('[data-testid="account-delete-submit"]')?.hasAttribute('disabled'),
    ).toBe(true);
    await input('account-delete-password', 'correct-password');
    await input('account-delete-confirmation', 'delete');
    await flushPromises();
    expect(
      document.querySelector('[data-testid="account-delete-submit"]')?.hasAttribute('disabled'),
    ).toBe(true);
    await input('account-delete-confirmation', 'DELETE');
    await flushPromises();
    submit('account-delete-submit');
    await flushPromises();
    expect(service.deleteAccountPermanently).toHaveBeenCalledWith({
      password: 'correct-password',
      confirmation: 'DELETE',
    });
    expect(nativeConfirm).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    wrapper.unmount();
  });
  it('renders friendly device titles instead of the stored User-Agent', async () => {
    const createdAt = new Date().toISOString();
    const { wrapper } = fixture(
      ok([
        {
          id: 'desktop',
          current: true,
          userAgent: buildDesktopUserAgent('0.23.0', 'Windows'),
          createdAt,
        },
        { id: 'legacy', current: false, userAgent: 'node', createdAt },
        {
          id: 'browser',
          current: false,
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
          createdAt,
        },
      ]),
    );
    await flushPromises();
    await wrapper.get('[data-testid="account-devices-open"]').trigger('click');
    expect(
      wrapper.findAll('[data-testid="account-session-device"]').map((node) => node.text()),
    ).toEqual(['MemoFlow Desktop · Windows', 'MemoFlow Desktop', 'Chrome · Windows']);
    expect(wrapper.get('[data-testid="account-sessions"]').text()).not.toContain('node');
    expect(wrapper.get('[data-testid="account-sessions"]').text()).not.toContain('Mozilla/5.0');
    wrapper.unmount();
  });
  it('shows the error and refresh without the empty state when sessions fail to load', async () => {
    const { wrapper } = fixture(
      fail({ code: 'ACCOUNT_SECURITY_FAILED', message: '服务返回异常，请稍后重试' }),
    );
    await flushPromises();
    await wrapper.get('[data-testid="account-devices-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('服务返回异常，请稍后重试');
    expect(document.querySelector('[data-testid="account-sessions-empty"]')).toBeNull();
    expect(document.querySelector('[data-testid="account-sessions"]')).toBeNull();
    expect(wrapper.text()).not.toContain('No sessions.');
    expect(wrapper.text()).toContain('Refresh');
    wrapper.unmount();
  });
  it('shows the empty state without an error when a successful load returns no sessions', async () => {
    const { wrapper } = fixture(ok([]));
    await flushPromises();
    await wrapper.get('[data-testid="account-devices-open"]').trigger('click');
    expect(document.querySelector('[data-testid="account-sessions-empty"]')).not.toBeNull();
    expect(wrapper.text()).toContain('No sessions.');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(document.querySelector('[data-testid="account-sessions"]')).toBeNull();
    wrapper.unmount();
  });
});
