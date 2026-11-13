import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { ProfileAccessChannels } from '@memoflow/desktop-contracts';
import { DESKTOP_BRIDGE_KEY } from '@account-ui-test-host/di/keys';
import AccountAutoEnterSection from './AccountAutoEnterSection.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      account: {
        autoEnter: {
          title: 'Enter automatically at launch',
          description: 'Skip the chooser.',
          label: 'Account to enter',
          off: 'Off',
          unavailable: 'No account remembers its credentials yet.',
          unavailableTarget: 'Credentials no longer available',
          failed: 'Could not save the setting',
        },
      },
    },
  },
});

const PassthroughStub = defineComponent({
  name: 'PassthroughStub',
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});

const SelectStub = defineComponent({
  name: 'Select',
  props: { modelValue: { type: String, default: '' }, disabled: Boolean },
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'auto-enter-select-stub',
          'data-disabled': String(props.disabled),
          'data-value': props.modelValue,
        },
        slots.default?.(),
      );
  },
});

function mountSection(options: {
  desktop?: boolean;
  snapshot?: { profileId: string | null; candidates: unknown[]; suppressed?: boolean };
  invoke?: ReturnType<typeof vi.fn>;
}) {
  const invoke =
    options.invoke ??
    vi.fn(async (channel: string) => {
      if (channel === ProfileAccessChannels.AUTO_ENTER_GET) return ok(options.snapshot);
      return ok(options.snapshot);
    });
  const wrapper = mount(AccountAutoEnterSection, {
    global: {
      plugins: [i18n],
      provide: options.desktop === false ? {} : { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
      stubs: {
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        CardDescription: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        Label: true,
        Select: SelectStub,
        SelectContent: PassthroughStub,
        SelectItem: PassthroughStub,
        SelectTrigger: PassthroughStub,
        SelectValue: true,
        Rocket: true,
      },
    },
  });
  return { wrapper, invoke };
}

describe('AccountAutoEnterSection (#926)', () => {
  it('stays absent on surfaces without a desktop bridge', async () => {
    const { wrapper } = mountSection({ desktop: false });
    await flushPromises();

    expect(wrapper.find('[data-testid="account-auto-enter-section"]').exists()).toBe(false);
  });

  it('disables the setting and states why when no account can enter automatically', async () => {
    const { wrapper } = mountSection({
      snapshot: { profileId: null, candidates: [], suppressed: false },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="account-auto-enter-section"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="account-auto-enter-unavailable"]').text()).toContain(
      'No account remembers its credentials yet.',
    );
    expect(wrapper.findComponent(SelectStub).props('disabled')).toBe(true);
  });

  it('offers the remembered accounts and persists the choice by Profile id', async () => {
    const invoke = vi.fn(async (channel: string, payload?: unknown) => {
      if (channel === ProfileAccessChannels.AUTO_ENTER_SET) return ok(payload);
      return ok({
        profileId: null,
        candidates: [
          { profileId: 'work', displayName: 'Work', profileKind: 'registered' },
          { profileId: 'local-remembered', displayName: 'Local', profileKind: 'local' },
        ],
        suppressed: false,
      });
    });
    const { wrapper } = mountSection({ invoke });
    await flushPromises();

    const select = wrapper.findComponent(SelectStub);
    expect(select.props('disabled')).toBe(false);
    expect(select.props('modelValue')).toBe('__off__');
    expect(wrapper.find('[data-testid="account-auto-enter-unavailable"]').exists()).toBe(false);

    select.vm.$emit('update:modelValue', 'work');
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(ProfileAccessChannels.AUTO_ENTER_SET, {
      profileId: 'work',
    });
  });

  it('shows the stored target as unavailable instead of pretending it is off', async () => {
    const { wrapper } = mountSection({
      snapshot: {
        profileId: 'local-plain',
        candidates: [{ profileId: 'work', displayName: 'Work', profileKind: 'registered' }],
        suppressed: false,
      },
    });
    await flushPromises();

    expect(wrapper.findComponent(SelectStub).props('modelValue')).toBe('local-plain');
    expect(wrapper.text()).toContain('Credentials no longer available');
  });
});
