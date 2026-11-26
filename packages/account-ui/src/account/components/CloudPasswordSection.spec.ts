import { defineComponent, h, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { CloudAuthClientPort } from '@memoflow/cloud-auth-contracts';
import { AUTH_SERVICE_KEY } from '@account-ui-test-host/di/keys';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import CloudPasswordSection from './CloudPasswordSection.vue';

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      auth: {
        errors: {
          VALIDATION_ERROR: 'Some submitted fields are invalid.',
          SERVICE_UNAVAILABLE: 'Authentication is temporarily unavailable.',
          UNKNOWN: 'Authentication failed. Try again later.',
        },
        toast: {
          pleaseLogin: 'Connect a cloud account first',
          operationFailed: 'Operation failed',
          changePasswordFailed: 'Failed to change password',
          passwordChanged: 'Password changed',
          reloginWithNew: 'Reauthenticate',
          resetEmailSent: 'Password reset link sent',
          checkResetEmail: 'Check email',
          sendResetEmailFailed: 'Failed to send reset email',
          passwordReset: 'Password reset',
          loginWithNew: 'Sign in',
          resetPasswordFailed: 'Failed to reset password',
        },
      },
      common: { cancel: 'Cancel' },
      account: {
        verification: {
          title: 'Verify your current email',
          description: 'Confirm ownership of {email}.',
          explain: 'We will send a 6-digit code.',
          sendCode: 'Send code',
          sending: 'Sending...',
          codeLabel: 'Verification code',
          codePlaceholder: '6-digit code',
          codeHint: 'Enter the 6-digit code sent to {email}.',
          resend: 'Resend code',
          resendIn: 'Resend in {seconds}s',
          verify: 'Verify',
          verifying: 'Verifying...',
          changeEmail: 'Use another email',
          expired: 'That code expired.',
          sendNewCode: 'Send new code',
        },
        password: {
          title: 'Cloud password',
          description: 'Manage your cloud password.',
          changeTitle: 'Change password',
          currentPassword: 'Current password',
          newPassword: 'New password',
          confirmPassword: 'Confirm new password',
          passwordMismatch: 'Passwords do not match',
          changePassword: 'Change password',
          forgotTitle: 'Trouble signing in?',
          forgotDescription: 'Send a reset email.',
          resetEmail: 'Email',
          sendResetEmail: 'Send reset email',
          retry: 'Try again',
          dismiss: 'Dismiss',
          requestId: 'Request ID',
          requestIdDetails: 'View request ID',
          requestIdPurpose:
            'Give this ID to support so they can trace what went wrong with this attempt.',
          copyRequestId: 'Copy request ID',
          copiedRequestId: 'Copied',
        },
      },
    },
  },
});

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const DialogStub = defineComponent({
  props: ['open'],
  setup(props, { slots }) {
    return () => (props.open ? h('div', slots.default?.()) : null);
  },
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

const InputStub = defineComponent({
  name: 'InputStub',
  inheritAttrs: false,
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

function createService(overrides: Partial<CloudAuthClientPort> = {}) {
  return {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    requestAccountVerification: vi.fn().mockResolvedValue(
      ok({
        challengeId: '00000000-0000-4000-8000-000000000000',
        retryAfterSeconds: 0,
        expiresInSeconds: 600,
      }),
    ),
    verifyAccountVerification: vi.fn().mockResolvedValue(ok({ verificationToken: 'v'.repeat(43) })),
    ...overrides,
  };
}

function seedAuthenticatedAccount(pinia = createPinia()) {
  const store = useAuthenticationStore(pinia);
  store.handleCloudAuthResponse({
    account: {
      id: 'cloud-user-1',
      email: 'person@example.com',
      name: 'Person',
      emailVerified: true,
    },
    session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    requiresEmailVerification: false,
  });
  return store;
}

function mountSection(service: CloudAuthClientPort, pinia = createPinia()) {
  const wrapper = mount(CloudPasswordSection, {
    global: {
      plugins: [pinia, i18n],
      provide: {
        [AUTH_SERVICE_KEY as symbol]: service,
        [CLOUD_ACCOUNT_SECURITY_KEY as symbol]: service,
      },
      stubs: {
        Dialog: DialogStub,
        DialogContent: PassthroughStub,
        DialogTitle: PassthroughStub,
        DialogDescription: PassthroughStub,
        Button: ButtonStub,
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        CardDescription: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        Input: InputStub,
        Label: true,
        Separator: true,
        KeyRound: true,
        Mail: true,
        Copy: true,
        RotateCcw: true,
        X: true,
      },
    },
  });
  return wrapper;
}

async function passEmailVerification(wrapper: ReturnType<typeof mountSection>) {
  await wrapper.get('[data-testid="cloud-password-open"]').trigger('click');
  await wrapper.get('[data-testid="account-verification-send"]').trigger('click');
  await flushPromises();
  await wrapper.get('[data-testid="account-verification-code"]').setValue('123456');
  await submitClosestForm(wrapper, 'account-verification-verify');
}

async function fillChangePassword(wrapper: ReturnType<typeof mountSection>) {
  await passEmailVerification(wrapper);
  await wrapper.get('[data-testid="cloud-password-current"]').setValue('old-pass');
  await wrapper.get('[data-testid="cloud-password-new"]').setValue('new-pass');
  await wrapper.get('[data-testid="cloud-password-confirm"]').setValue('new-pass');
}

async function submitClosestForm(wrapper: ReturnType<typeof mountSection>, testId: string) {
  const form = wrapper.get(`[data-testid="${testId}"]`).element.closest('form');
  expect(form).not.toBeNull();
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flushPromises();
}

describe('CloudPasswordSection (W6 P1-3 auth receipt restore UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.clear();
    } catch {
      // storage unavailable in the test host
    }
  });

  it('clears passwords on cancel and never sends a request when reopening', async () => {
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const service = createService();
    const wrapper = mountSection(service, pinia);
    await fillChangePassword(wrapper);
    await wrapper.get('[data-testid="cloud-password-cancel"]').trigger('click');
    expect(wrapper.find('[data-testid="cloud-password-current"]').exists()).toBe(false);
    expect(service.changePassword).not.toHaveBeenCalled();
    // Reopening always restarts from the mailbox proof instead of a stale grant.
    await wrapper.get('[data-testid="cloud-password-open"]').trigger('click');
    expect(wrapper.find('[data-testid="account-verification-send"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="cloud-password-current"]').exists()).toBe(false);
    expect(service.verifyAccountVerification).toHaveBeenCalledTimes(1);
  });

  it('keeps password actions enabled while the password service is idle', async () => {
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const wrapper = mountSection(createService(), pinia);

    expect(wrapper.find('[data-testid="cloud-password-current"]').exists()).toBe(false);
    await passEmailVerification(wrapper);
    expect(
      (wrapper.get('[data-testid="cloud-password-change-button"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (wrapper.get('[data-testid="cloud-password-forgot-button"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('masks the reset recipient but sends the link to the authenticated email', async () => {
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const service = createService({ forgotPassword: vi.fn().mockResolvedValue(ok(undefined)) });
    const wrapper = mountSection(service, pinia);
    await passEmailVerification(wrapper);
    expect(wrapper.get('[data-testid="cloud-password-reset-recipient"]').text()).toBe(
      'p***@example.com',
    );
    expect(wrapper.text()).not.toContain('person@example.com');
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    await submitClosestForm(wrapper, 'cloud-password-forgot-button');
    expect(service.forgotPassword).toHaveBeenCalledWith('person@example.com');
  });

  it('renders the structured receipt with message, request id and retry action after a failed change-password', async () => {
    const service = createService({
      changePassword: vi.fn().mockResolvedValue(
        fail(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Better Auth is temporarily unavailable',
            context: { requestId: 'req-change-123' },
          },
          { traceId: 'trace-change-123' },
        ),
      ),
    });
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const wrapper = mountSection(service, pinia);

    await fillChangePassword(wrapper);
    await submitClosestForm(wrapper, 'cloud-password-change-button');
    await flushPromises();

    const banner = wrapper.get('[data-testid="password-mutation-error"]');
    expect(banner.text()).toContain('Authentication is temporarily unavailable.');
    expect(wrapper.get('[data-testid="password-mutation-error-request-id"]').text()).toContain(
      'trace-change-123',
    );
    // The request id is a support handle: it stays out of the receipt's main
    // copy and only appears inside the collapsed detail.
    expect(wrapper.get('[data-testid="password-mutation-error-message"]').text()).not.toContain(
      'trace-change-123',
    );
    const requestIdDetails = wrapper.get(
      '[data-testid="password-mutation-error-request-id-details"]',
    );
    expect(requestIdDetails.element.tagName).toBe('DETAILS');
    expect((requestIdDetails.element as HTMLDetailsElement).open).toBe(false);
    expect(requestIdDetails.text()).toContain('View request ID');
    expect(requestIdDetails.text()).toContain('Give this ID to support');
    expect(wrapper.find('[data-testid="password-mutation-error-retry"]').exists()).toBe(true);
    expect(service.changePassword).toHaveBeenCalledTimes(1);
    expect(service.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-pass',
      newPassword: 'new-pass',
      verificationToken: 'v'.repeat(43),
    });
  });

  it('restores the receipt into a remounted component (simulated page reload) and renders it without a fresh action', async () => {
    const service = createService({
      forgotPassword: vi.fn().mockResolvedValue(
        fail(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Better Auth is temporarily unavailable',
            context: { requestId: 'req-forgot-456' },
          },
          { traceId: 'trace-forgot-456' },
        ),
      ),
    });
    const firstPinia = createPinia();
    seedAuthenticatedAccount(firstPinia);
    const first = mountSection(service, firstPinia);
    await passEmailVerification(first);
    await submitClosestForm(first, 'cloud-password-forgot-button');
    await flushPromises();
    expect(service.forgotPassword).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('memoflow:auth:password-mutation-error')).not.toBeNull();
    first.unmount();

    // Reload: a fresh pinia + remounted component boots from durable storage.
    const reloadPinia = createPinia();
    seedAuthenticatedAccount(reloadPinia);
    const reloadedStore = useAuthenticationStore(reloadPinia);
    expect(reloadedStore.passwordMutationError?.code).toBe('SERVICE_UNAVAILABLE');
    const second = mountSection(service, reloadPinia);
    expect(second.get('[data-testid="password-mutation-error-message"]').text()).toBe(
      'Authentication is temporarily unavailable.',
    );
    expect(second.get('[data-testid="password-mutation-error-request-id"]').text()).toContain(
      'trace-forgot-456',
    );
    expect(second.find('[data-testid="password-mutation-error-retry"]').exists()).toBe(true);

    // Retry action re-runs the failed operation from the restored banner.
    await second.get('[data-testid="password-mutation-error-retry"]').trigger('click');
    await flushPromises();
    expect(service.forgotPassword).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it('dismisses the restored receipt from store and localStorage', async () => {
    const service = createService({
      changePassword: vi
        .fn()
        .mockResolvedValue(
          fail({ code: 'SERVICE_UNAVAILABLE', message: 'down', context: { requestId: 'req-1' } }),
        ),
    });
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const wrapper = mountSection(service, pinia);
    await fillChangePassword(wrapper);
    await submitClosestForm(wrapper, 'cloud-password-change-button');
    await flushPromises();
    expect(wrapper.find('[data-testid="password-mutation-error"]').exists()).toBe(true);

    await wrapper.get('[data-testid="password-mutation-error-dismiss"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="password-mutation-error"]').exists()).toBe(false);
    expect(localStorage.getItem('memoflow:auth:password-mutation-error')).toBeNull();
  });

  it('copies the request id from the expandable detail and resets the copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const service = createService({
      changePassword: vi.fn().mockResolvedValue(
        fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'down',
          context: { requestId: 'req-copy-1' },
        }),
      ),
    });
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const wrapper = mountSection(service, pinia);
    await fillChangePassword(wrapper);
    await submitClosestForm(wrapper, 'cloud-password-change-button');
    await flushPromises();

    const copyButton = wrapper.get('[data-testid="password-mutation-error-copy-request-id"]');
    expect(copyButton.text()).toContain('Copy request ID');

    vi.useFakeTimers();
    await copyButton.trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    expect(writeText).toHaveBeenCalledWith('req-copy-1');
    expect(copyButton.text()).toContain('Copied');

    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(copyButton.text()).toContain('Copy request ID');
    vi.useRealTimers();
    wrapper.unmount();
  });

  it('does not render the password section for a guest (no authenticated account)', async () => {
    const service = createService();
    const wrapper = mountSection(service, createPinia());
    expect(wrapper.find('[data-testid="cloud-password-change-button"]').exists()).toBe(false);
  });

  it('clears the receipt after a successful retry', async () => {
    let call = 0;
    const service = createService({
      changePassword: vi.fn().mockImplementation(() => {
        call += 1;
        return call === 1
          ? Promise.resolve(
              fail({ code: 'TIMEOUT', message: 'timed out', context: { requestId: 'req-2' } }),
            )
          : Promise.resolve(ok(undefined));
      }),
    });
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const wrapper = mountSection(service, pinia);
    await fillChangePassword(wrapper);
    await submitClosestForm(wrapper, 'cloud-password-change-button');
    await flushPromises();
    expect(wrapper.find('[data-testid="password-mutation-error"]').exists()).toBe(true);

    await wrapper.get('[data-testid="password-mutation-error-retry"]').trigger('click');
    await flushPromises();
    // Retry restarts from mailbox proof, then re-submits the new password.
    await wrapper.get('[data-testid="account-verification-send"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="account-verification-code"]').setValue('123456');
    await submitClosestForm(wrapper, 'account-verification-verify');
    await wrapper.get('[data-testid="cloud-password-current"]').setValue('old-pass');
    await wrapper.get('[data-testid="cloud-password-new"]').setValue('new-pass');
    await wrapper.get('[data-testid="cloud-password-confirm"]').setValue('new-pass');
    await submitClosestForm(wrapper, 'cloud-password-change-button');
    await flushPromises();
    expect(service.changePassword).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="password-mutation-error"]').exists()).toBe(false);
    expect(localStorage.getItem('memoflow:auth:password-mutation-error')).toBeNull();
  });
});
