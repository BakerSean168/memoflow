import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';
import account from '@account-ui-test-host/locales/en-US/account';
import AccountEmailVerificationDialog from './AccountEmailVerificationDialog.vue';

const PassthroughStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const DialogStub = defineComponent({
  props: ['open'],
  setup(props, { slots }) {
    return () => (props.open ? h('div', { 'data-dialog': '' }, slots.default?.()) : null);
  },
});

const ButtonStub = defineComponent({
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

function challenge(retryAfterSeconds = 0, expiresInSeconds = 600) {
  return {
    challengeId: '00000000-0000-4000-8000-000000000000',
    retryAfterSeconds,
    expiresInSeconds,
  };
}

function mountDialog(
  service: Record<string, unknown>,
  props: { open?: boolean; purpose?: 'change-password' | 'change-email' } = {},
) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        account,
        common: { cancel: 'Cancel' },
      },
    },
  });
  return mount(AccountEmailVerificationDialog, {
    props: {
      open: props.open ?? true,
      purpose: props.purpose ?? 'change-password',
      email: 'person@example.com',
    },
    global: {
      plugins: [i18n],
      provide: { [CLOUD_ACCOUNT_SECURITY_KEY as symbol]: service },
      stubs: {
        Dialog: DialogStub,
        DialogContent: PassthroughStub,
        DialogTitle: PassthroughStub,
        DialogDescription: PassthroughStub,
        Button: ButtonStub,
        Input: InputStub,
        Label: true,
      },
    },
  });
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    requestAccountVerification: vi.fn().mockResolvedValue(ok(challenge())),
    verifyAccountVerification: vi
      .fn()
      .mockResolvedValue(ok({ verificationToken: 'v'.repeat(43) })),
    ...overrides,
  };
}

async function openCodeStep(wrapper: ReturnType<typeof mountDialog>) {
  await wrapper.get('[data-testid="account-verification-send"]').trigger('click');
  await flushPromises();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AccountEmailVerificationDialog', () => {
  it('explains, sends a code, then emits the one-time grant once verified', async () => {
    const api = service();
    const wrapper = mountDialog(api);
    expect(wrapper.text()).toContain('confirm ownership of p***@example.com');
    expect(wrapper.find('[data-testid="account-verification-code"]').exists()).toBe(false);

    await openCodeStep(wrapper);
    expect(api.requestAccountVerification).toHaveBeenCalledWith('change-password');
    expect(wrapper.find('[data-testid="account-verification-code-step"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('p***@example.com');

    await wrapper.get('[data-testid="account-verification-code"]').setValue('123456');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.verifyAccountVerification).toHaveBeenCalledWith({
      purpose: 'change-password',
      challengeId: '00000000-0000-4000-8000-000000000000',
      code: '123456',
    });
    expect(wrapper.emitted('verified')).toEqual([['v'.repeat(43)]]);
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    wrapper.unmount();
  });

  it('shows the server error, clears the code and stays on the input step', async () => {
    const api = service({
      verifyAccountVerification: vi.fn().mockResolvedValue(
        fail({ code: 'ACCOUNT_VERIFICATION_INVALID', message: 'Code is invalid or expired' }),
      ),
    });
    const wrapper = mountDialog(api);
    await openCodeStep(wrapper);
    await wrapper.get('[data-testid="account-verification-code"]').setValue('123456');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-testid="account-verification-error"]').text()).toBe(
      'Code is invalid or expired',
    );
    expect(wrapper.find('[data-testid="account-verification-code-step"]').exists()).toBe(true);
    expect(
      (wrapper.get('[data-testid="account-verification-code"]').element as HTMLInputElement).value,
    ).toBe('');
    expect(wrapper.emitted('verified')).toBeUndefined();
    wrapper.unmount();
  });

  it('disables resend during the cooldown and re-enables it afterwards', async () => {
    vi.useFakeTimers();
    const wrapper = mountDialog(
      service({ requestAccountVerification: vi.fn().mockResolvedValue(ok(challenge(60))) }),
    );
    await wrapper.get('[data-testid="account-verification-send"]').trigger('click');
    await flushPromises();
    const resend = wrapper.get('[data-testid="account-verification-resend"]');
    expect(resend.attributes('disabled')).toBeDefined();
    expect(resend.text()).toContain('60');

    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect(resend.text()).toContain('30');
    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect(resend.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('moves to the expired state when the challenge elapses and offers a new code', async () => {
    vi.useFakeTimers();
    const api = service();
    const wrapper = mountDialog(api);
    await wrapper.get('[data-testid="account-verification-send"]').trigger('click');
    await flushPromises();
    vi.advanceTimersByTime(1_000);
    await flushPromises();
    // expiresInSeconds defaults to 600; age it by one challenge lifetime.
    vi.advanceTimersByTime(600_000);
    await flushPromises();

    expect(wrapper.find('[data-testid="account-verification-expired"]').exists()).toBe(true);
    api.requestAccountVerification.mockResolvedValueOnce(ok(challenge()));
    await wrapper.get('[data-testid="account-verification-resend"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="account-verification-code-step"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('closes without a grant when cancelled', async () => {
    const api = service();
    const wrapper = mountDialog(api);
    await wrapper.get('[data-testid="account-verification-cancel"]').trigger('click');
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    expect(api.requestAccountVerification).not.toHaveBeenCalled();
    expect(wrapper.emitted('verified')).toBeUndefined();
    wrapper.unmount();
  });
});
