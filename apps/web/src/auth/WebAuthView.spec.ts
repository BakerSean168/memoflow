import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail } from '@memoflow/contracts/result';
import { AUTH_SERVICE_KEY } from '@memoflow/app-vue/di';
import WebAuthView from './WebAuthView.vue';
import { createAuthI18n } from './i18n';

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const authCapabilityMocks = vi.hoisted(() => ({
  loadWebAuthCapabilities: vi.fn(async () => ({ github: true })),
}));

vi.mock('./capabilities', () => ({
  loadWebAuthCapabilities: authCapabilityMocks.loadWebAuthCapabilities,
}));

const webAuthMocks = vi.hoisted(() => ({
  loginByEmail: vi.fn(async () => true as const),
  registerByEmail: vi.fn(async () => true as const),
  forgotPassword: vi.fn(async () => true),
  resetPassword: vi.fn(async () => true),
  startGithubLogin: vi.fn(async () => true),
  clearError: vi.fn(),
  clearSuccessMessage: vi.fn(),
}));

vi.mock('./useWebAuth', async () => {
  const vue = await import('vue');
  return {
    useWebAuth: () => ({
      loginByEmail: webAuthMocks.loginByEmail,
      registerByEmail: webAuthMocks.registerByEmail,
      forgotPassword: webAuthMocks.forgotPassword,
      resetPassword: webAuthMocks.resetPassword,
      startGithubLogin: webAuthMocks.startGithubLogin,
      clearError: webAuthMocks.clearError,
      clearSuccessMessage: webAuthMocks.clearSuccessMessage,
      // Real refs so template auto-unwrap treats loading as boolean false.
      isLoading: vue.ref(false),
      error: vue.ref(null),
      errorMessage: vue.ref(null),
      successMessage: vue.ref(null),
      pendingVerificationEmail: vue.ref(null),
    }),
  };
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled', 'variant', 'size', 'type'],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: props.type ?? 'button',
          disabled: props.disabled,
        },
        slots.default?.(),
      );
  },
});

const InputStub = defineComponent({
  name: 'InputStub',
  props: [
    'modelValue',
    'type',
    'placeholder',
    'disabled',
    'id',
    'autocomplete',
    'ariaInvalid',
    'ariaDescribedby',
  ],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        id: props.id,
        type: props.type ?? 'text',
        value: props.modelValue ?? '',
        placeholder: props.placeholder,
        disabled: props.disabled,
        autocomplete: props.autocomplete,
        'aria-invalid': props.ariaInvalid,
        'aria-describedby': props.ariaDescribedby,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

function createService(overrides: Record<string, unknown> = {}) {
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

function mountView(service = createService(), pinia = createPinia()) {
  return mount(WebAuthView, {
    global: {
      plugins: [pinia, createAuthI18n('en-US')],
      provide: {
        [AUTH_SERVICE_KEY as symbol]: service,
      },
      stubs: {
        Button: ButtonStub,
        Input: InputStub,
        Label: defineComponent({
          name: 'LabelStub',
          setup(_, { attrs, slots }) {
            return () => h('label', attrs, slots.default?.());
          },
        }),
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        Loader2: true,
      },
    },
  });
}

describe('WebAuthView three-login surface contract', () => {
  beforeEach(() => {
    authCapabilityMocks.loadWebAuthCapabilities.mockReset();
    authCapabilityMocks.loadWebAuthCapabilities.mockResolvedValue({ github: true });
    webAuthMocks.startGithubLogin.mockReset();
    webAuthMocks.loginByEmail.mockReset();
    webAuthMocks.startGithubLogin.mockResolvedValue(true);
    webAuthMocks.loginByEmail.mockResolvedValue(true as const);
    window.history.replaceState({}, '', '/auth');
    try {
      localStorage.clear();
    } catch {
      // storage unavailable in the test host
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes password login and GitHub OAuth without guest mode', async () => {
    const wrapper = mountView();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-testid="login-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-username-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-password-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-submit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-github-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="guest-mode-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-phone-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="send-sms-code-button"]').exists()).toBe(false);
    expect(wrapper.find('#verify-code').exists()).toBe(false);

    wrapper.unmount();
  });

  it('hides GitHub OAuth when the API reports that the provider is unavailable', async () => {
    authCapabilityMocks.loadWebAuthCapabilities.mockResolvedValueOnce({ github: false });
    const wrapper = mountView();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-testid="login-submit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-github-button"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('keeps cloud-only entries free of guest and verification-code controls', async () => {
    const wrapper = mountView();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-testid="login-submit-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-github-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="guest-mode-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="verify-submit-button"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it.each([
    [false, true],
    ['needs-email-verification', false],
  ])(
    'changes to the verification scene only for the explicit verification outcome',
    async (outcome, staysOnLogin) => {
      webAuthMocks.loginByEmail.mockResolvedValueOnce(outcome as never);
      const wrapper = mountView();
      await wrapper.get('#email').setValue('person@example.com');
      await wrapper.get('#password').setValue('Correct-password-123');

      await wrapper.get('[data-testid="login-form"]').trigger('submit');
      await flushPromises();

      expect(wrapper.find('[data-testid="login-form"]').exists()).toBe(staysOnLogin);
      expect(wrapper.find('[data-testid="verify-email-form"]').exists()).toBe(!staysOnLogin);
      wrapper.unmount();
    },
  );

  it('starts GitHub login only through the dedicated OAuth entry', async () => {
    const wrapper = mountView();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-testid="login-github-button"]').exists()).toBe(true);
    await wrapper.get('[data-testid="login-github-button"]').trigger('click');
    await flushPromises();

    expect(webAuthMocks.startGithubLogin).toHaveBeenCalledWith(
      new URL('/', window.location.origin).toString(),
    );
    expect(webAuthMocks.loginByEmail).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reset-password failure persists a safe receipt (never the token/password) and recovers after unmount/remount with a retry action', async () => {
    const TOKEN = 'reset-token-abc-123';
    const SUBMITTED_PASSWORD = 'NewPass123!';
    window.history.replaceState({}, '', `/auth?scene=reset&token=${TOKEN}`);

    const service = createService({
      resetPassword: vi.fn().mockResolvedValue(
        fail(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: `raw server text ${TOKEN} ${SUBMITTED_PASSWORD}`,
            context: { requestId: 'req-reset-1' },
          },
          { traceId: 'trace-reset-1' },
        ),
      ),
    });

    const firstPinia = createPinia();
    const first = mountView(service, firstPinia);
    await first.get('#new-password').setValue(SUBMITTED_PASSWORD);
    await first.get('#confirm-new-password').setValue(SUBMITTED_PASSWORD);
    const resetForm = first.get('[data-testid="reset-form"]').element as HTMLFormElement;
    resetForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    // The receipt renders the safe allowlisted message + request id + retry.
    expect(first.get('[data-testid="web-auth-password-receipt-message"]').text()).toContain(
      'temporarily unavailable',
    );
    expect(first.get('[data-testid="web-auth-password-receipt-request-id"]').text()).toContain(
      'trace-reset-1',
    );
    expect(first.get('[data-testid="web-auth-password-receipt-retry"]').exists()).toBe(true);
    // The raw server message (which echoes token + password) is never rendered.
    expect(first.get('[data-testid="web-auth-password-receipt-message"]').text()).not.toContain(
      TOKEN,
    );
    expect(first.get('[data-testid="web-auth-password-receipt-message"]').text()).not.toContain(
      SUBMITTED_PASSWORD,
    );

    // The receipt is durable, but never contains the token or the password.
    const persisted = localStorage.getItem('memoflow:auth:password-mutation-error');
    expect(persisted).not.toBeNull();
    expect(persisted).not.toContain(TOKEN);
    expect(persisted).not.toContain(SUBMITTED_PASSWORD);
    expect(JSON.stringify(localStorage)).not.toContain(TOKEN);
    expect(JSON.stringify(localStorage)).not.toContain(SUBMITTED_PASSWORD);
    first.unmount();

    // Reload: a fresh pinia + remounted real page restores the receipt from
    // durable storage and renders it again.
    const secondPinia = createPinia();
    const second = mountView(service, secondPinia);
    await flushPromises();
    expect(second.get('[data-testid="web-auth-password-receipt-message"]').text()).toContain(
      'temporarily unavailable',
    );
    expect(second.get('[data-testid="web-auth-password-receipt-request-id"]').text()).toContain(
      'trace-reset-1',
    );
    expect(second.get('[data-testid="web-auth-password-receipt-retry"]').exists()).toBe(true);
    // The recovery action is executable: a reset-password receipt re-issues a
    // fresh reset link via the forgot flow (the token itself is never reused).
    await second.get('[data-testid="web-auth-password-receipt-retry"]').trigger('click');
    await flushPromises();
    expect(second.get('[data-testid="forgot-form"]').exists()).toBe(true);
    second.unmount();
  });
});
