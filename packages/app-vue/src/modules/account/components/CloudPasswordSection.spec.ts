import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { CloudAuthClientPort } from '@memoflow/contracts';
import { AUTH_SERVICE_KEY } from '../../../di/keys';
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
      account: {
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
    ...overrides,
  };
}

function seedAuthenticatedAccount(pinia = createPinia()) {
  const store = useAuthenticationStore(pinia);
  store.handleCloudAuthResponse({
    account: { id: 'cloud-user-1', email: 'person@example.com', name: 'Person', emailVerified: true },
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
      },
      stubs: {
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
        RotateCcw: true,
        X: true,
      },
    },
  });
  return wrapper;
}

async function fillChangePassword(wrapper: ReturnType<typeof mountSection>) {
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

  it('keeps password actions enabled while the password service is idle', () => {
    const pinia = createPinia();
    seedAuthenticatedAccount(pinia);
    const wrapper = mountSection(createService(), pinia);

    expect(
      (wrapper.get('[data-testid="cloud-password-change-button"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (wrapper.get('[data-testid="cloud-password-forgot-button"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
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
    expect(wrapper.find('[data-testid="password-mutation-error-retry"]').exists()).toBe(true);
    expect(service.changePassword).toHaveBeenCalledTimes(1);
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
      changePassword: vi.fn().mockResolvedValue(
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
    expect(service.changePassword).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="password-mutation-error"]').exists()).toBe(false);
    expect(localStorage.getItem('memoflow:auth:password-mutation-error')).toBeNull();
  });
});
