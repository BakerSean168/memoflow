import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { ok, fail } from '@memoflow/transport-contracts/result';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';
import account from '@account-ui-test-host/locales/en-US/account';
import CloudAccountSecuritySection from './CloudAccountSecuritySection.vue';

vi.mock('../composables/useAccountSignOut', () => ({
  useAccountSignOut: () => ({ isDesktopSignOut: { value: false }, executeSignOut: vi.fn() }),
}));
afterEach(() => {
  document.body.innerHTML = '';
});
function fixture() {
  const service = {
    verifyAccountPassword: vi.fn().mockResolvedValue(ok(undefined)),
    requestEmailChange: vi.fn().mockResolvedValue(ok(undefined)),
    listAccountSessions: vi.fn().mockResolvedValue(
      ok([
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
    ),
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
          messages: { 'en-US': { account, common: { refresh: 'Refresh' } } },
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

describe('CloudAccountSecuritySection', () => {
  it('masks the email, lists devices and revokes only the other session', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    expect(wrapper.text()).toContain('p***@example.com');
    expect(wrapper.text()).not.toContain('person@example.com');
    expect(wrapper.findAll('[data-testid="account-session-revoke"]')).toHaveLength(1);
    await wrapper.get('[data-testid="account-session-revoke"]').trigger('click');
    await flushPromises();
    expect(service.revokeAccountSession).toHaveBeenCalledWith('other');
    wrapper.unmount();
  });
  it('requires password recheck before asking for the new email and displays failures', async () => {
    const { wrapper, service } = fixture();
    service.verifyAccountPassword.mockResolvedValueOnce(
      fail({ code: 'INVALID_PASSWORD', message: 'Wrong password' }),
    );
    await wrapper.get('[data-testid="account-change-email"]').trigger('click');
    await flushPromises();
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
});
