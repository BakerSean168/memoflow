import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail } from '@memoflow/transport-contracts/result';
import type { AccountClientPort } from '@memoflow/account-client';
import {
  ACCOUNT_AVATAR_STORE_KEY,
  ACCOUNT_SERVICE_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
} from '@account-ui-test-host/di/keys';
import AccountProfileEditorDialog from './AccountProfileEditorDialog.vue';
import { useAccountStore } from '../stores/account-store';

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
      common: { close: 'Close' },
      account: {
        profile: { nickname: 'Nickname', bio: 'Bio' },
        placeholder: { nickname: 'Enter nickname', bio: 'About you' },
        avatar: {
          uploading: 'Uploading',
          failed: 'Avatar failed',
          invalidType: 'Invalid type',
          decodeFailed: 'Decode failed',
          encodeFailed: 'Encode failed',
          saved: 'Avatar saved',
        },
        profileEditor: {
          title: 'Edit profile',
          description: 'Update your profile.',
          unsaved: "Don't forget to save your changes!",
          reset: 'Reset',
          save: 'Save',
          saving: 'Saving…',
        },
        toast: {
          profileUpdated: 'Profile updated',
          updateProfileFailed: 'Failed to update profile',
          updateFailed: 'Update failed',
          loadFailed: 'Load failed',
          loadProfileFailed: 'Failed to load profile',
        },
      },
      errors: { SERVER_ERROR: 'Server error' },
    },
  },
});

const Passthrough = defineComponent({
  name: 'PassthroughStub',
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});

/** Renders its slot only while open, like the real controlled Dialog root. */
const DialogStub = defineComponent({
  name: 'DialogStub',
  props: { open: { type: Boolean, default: false } },
  emits: ['update:open'],
  setup(props, { slots }) {
    return () => (props.open ? h('div', { 'data-dialog-root': '' }, slots.default?.()) : null);
  },
});

/** Keeps attrs/testid and re-exposes the dismissal events the component listens to. */
const DialogContentStub = defineComponent({
  name: 'DialogContentStub',
  emits: ['escapeKeyDown', 'pointerDownOutside', 'openAutoFocus'],
  setup(_, { slots }) {
    return () => h('section', slots.default?.());
  },
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  inheritAttrs: false,
  props: ['disabled', 'variant', 'size'],
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

const TextareaStub = defineComponent({
  name: 'TextareaStub',
  inheritAttrs: false,
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('textarea', {
        ...attrs,
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      });
  },
});

const AvatarUploaderStub = defineComponent({
  name: 'AccountAvatarUploader',
  props: ['avatarUrl', 'initials', 'disabled', 'sizeClass', 'testId'],
  setup(props) {
    return () =>
      h('div', {
        'data-testid': props.testId,
        'data-avatar-url': props.avatarUrl ?? '',
        'data-initials': props.initials,
      });
  },
});

const storedAccount = {
  id: 'guest_1',
  status: 'Active',
  profile: {
    nickname: 'Guest 4827',
    realName: null,
    avatarUrl: null,
    bio: 'Existing bio',
    gender: 'Unspecified',
    birthday: null,
  },
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  closedAt: null,
};

function accountService(overrides: Partial<Record<'getMyProfile' | 'updateMyProfile', unknown>> = {}) {
  return {
    getMyProfile: vi.fn().mockResolvedValue({
      ok: true,
      data: { account: storedAccount, cloudIdentity: null },
    }),
    updateMyProfile: vi.fn().mockResolvedValue({
      ok: true,
      data: { account: { ...storedAccount, profile: { ...storedAccount.profile, nickname: 'Renamed' } }, cloudIdentity: null },
    }),
    closeAccount: vi.fn(),
    ...overrides,
  } as unknown as AccountClientPort;
}

function mountDialog(
  service: AccountClientPort,
  options: { open?: boolean; avatarUrl?: string | null } = {},
) {
  const open = ref(options.open ?? true);
  const wrapper = mount(AccountProfileEditorDialog, {
    props: {
      open: open.value,
      'onUpdate:open': (value: boolean) => {
        open.value = value;
        void wrapper.setProps({ open: value });
      },
    },
    global: {
      plugins: [i18n],
      provide: {
        [ACCOUNT_SERVICE_KEY as symbol]: service,
        [DESKTOP_ACCESS_SNAPSHOT_KEY as symbol]: ref({
          profile: { profileId: 'profile-1', profileKind: 'local' },
        }),
        [ACCOUNT_AVATAR_STORE_KEY as symbol]: {
          load: vi.fn().mockResolvedValue(options.avatarUrl ?? null),
          save: vi.fn().mockResolvedValue('data:image/png;base64,stored'),
        },
      },
      stubs: {
        Dialog: DialogStub,
        DialogContent: DialogContentStub,
        DialogTitle: Passthrough,
        DialogDescription: Passthrough,
        Button: ButtonStub,
        Input: InputStub,
        Textarea: TextareaStub,
        Label: Passthrough,
        X: true,
        LoaderCircle: true,
        AccountAvatarUploader: AvatarUploaderStub,
      },
    },
  });
  return { wrapper, open };
}

const dialog = (wrapper: ReturnType<typeof mountDialog>['wrapper']) =>
  wrapper.get('[data-testid="profile-editor-dialog"]');
const prompt = (wrapper: ReturnType<typeof mountDialog>['wrapper']) =>
  wrapper.get('[data-testid="profile-editor-prompt"]');

describe('AccountProfileEditorDialog', () => {
  // The shared test Pinia persists for the file; every case starts without an account.
  beforeEach(() => {
    useAccountStore().reset();
  });

  it('opens with inline persisted values and saves through the account service', async () => {
    const service = accountService();
    const { wrapper, open } = mountDialog(service);
    await flushPromises();

    expect(dialog(wrapper).exists()).toBe(true);
    expect(wrapper.get('[data-testid="profile-editor-nickname"]').element).toHaveProperty(
      'value',
      'Guest 4827',
    );
    expect(wrapper.get('[data-testid="profile-editor-bio"]').element).toHaveProperty(
      'value',
      'Existing bio',
    );
    expect(wrapper.find('[data-testid="profile-editor-prompt"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="profile-editor-avatar"]').attributes('data-avatar-url')).toBe(
      '',
    );

    await wrapper.get('[data-testid="profile-editor-nickname"]').setValue('Renamed');
    expect(prompt(wrapper).text()).toContain("Don't forget to save your changes!");

    await wrapper.get('[data-testid="profile-editor-save"]').trigger('click');
    await flushPromises();

    expect(service.updateMyProfile).toHaveBeenCalledWith({ nickname: 'Renamed', bio: 'Existing bio' });
    // Saved: the bar disappears while the dialog stays open.
    expect(wrapper.find('[data-testid="profile-editor-prompt"]').exists()).toBe(false);
    expect(open.value).toBe(true);
    expect(wrapper.get('[data-testid="profile-editor-nickname"]').element).toHaveProperty(
      'value',
      'Renamed',
    );
  });

  it('resets every field to the values captured when the dialog opened', async () => {
    const { wrapper } = mountDialog(accountService());
    await flushPromises();

    await wrapper.get('[data-testid="profile-editor-nickname"]').setValue('Renamed');
    await wrapper.get('[data-testid="profile-editor-bio"]').setValue('New bio');
    expect(wrapper.find('[data-testid="profile-editor-prompt"]').exists()).toBe(true);

    await wrapper.get('[data-testid="profile-editor-reset"]').trigger('click');

    expect(wrapper.get('[data-testid="profile-editor-nickname"]').element).toHaveProperty(
      'value',
      'Guest 4827',
    );
    expect(wrapper.get('[data-testid="profile-editor-bio"]').element).toHaveProperty(
      'value',
      'Existing bio',
    );
    expect(wrapper.find('[data-testid="profile-editor-prompt"]').exists()).toBe(false);
  });

  it('shakes and keeps the dialog open when the close button discards unsaved edits', async () => {
    const { wrapper, open } = mountDialog(accountService());
    await flushPromises();

    await wrapper.get('[data-testid="profile-editor-nickname"]').setValue('Renamed');
    await wrapper.get('[data-testid="profile-editor-close"]').trigger('click');

    expect(open.value).toBe(true);
    expect(dialog(wrapper).attributes('data-guard')).toBe('alert');
    expect(dialog(wrapper).classes()).toContain('profile-editor-shake-a');

    // A second attempt replays the animation through the alternating class.
    await wrapper.get('[data-testid="profile-editor-close"]').trigger('click');
    expect(dialog(wrapper).classes()).toContain('profile-editor-shake-b');
    expect(dialog(wrapper).attributes('data-guard')).toBe('alert');
  });

  it('guards Escape and outside clicks only while the draft is dirty', async () => {
    const { wrapper, open } = mountDialog(accountService());
    await flushPromises();
    const root = () => wrapper.getComponent({ name: 'DialogStub' });
    const content = () => wrapper.getComponent({ name: 'DialogContentStub' });

    // Clean: the root dismissal is accepted and the dialog closes.
    content().vm.$emit('escapeKeyDown', new KeyboardEvent('keydown', { key: 'Escape' }));
    root().vm.$emit('update:open', false);
    await flushPromises();
    expect(open.value).toBe(false);

    // Dirty: both dismissal paths are cancelled and the draft survives.
    await wrapper.setProps({ open: true });
    await flushPromises();
    await wrapper.get('[data-testid="profile-editor-bio"]').setValue('New bio');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    content().vm.$emit('escapeKeyDown', escape);
    expect(escape.defaultPrevented).toBe(true);
    root().vm.$emit('update:open', false);
    await flushPromises();
    expect(wrapper.props('open')).toBe(true);
    expect(dialog(wrapper).attributes('data-guard')).toBe('alert');

    const outside = new Event('pointerdown', { cancelable: true });
    content().vm.$emit('pointerDownOutside', outside);
    expect(outside.defaultPrevented).toBe(true);
    root().vm.$emit('update:open', false);
    await flushPromises();
    expect(wrapper.props('open')).toBe(true);
    expect(dialog(wrapper).attributes('data-guard')).toBe('alert');
    expect(wrapper.get('[data-testid="profile-editor-bio"]').element).toHaveProperty(
      'value',
      'New bio',
    );
  });

  it('keeps the draft and lets the user retry when saving fails', async () => {
    const service = accountService({
      updateMyProfile: vi.fn().mockResolvedValue(fail({ code: 'SERVER_ERROR', message: 'nope' })),
    });
    const { wrapper } = mountDialog(service);
    await flushPromises();

    await wrapper.get('[data-testid="profile-editor-bio"]').setValue('Draft bio');
    await wrapper.get('[data-testid="profile-editor-save"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="profile-editor-bio"]').element).toHaveProperty(
      'value',
      'Draft bio',
    );
    expect(wrapper.find('[data-testid="profile-editor-prompt"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="profile-editor-save"]').attributes('disabled')).toBeUndefined();

    await wrapper.get('[data-testid="profile-editor-save"]').trigger('click');
    await flushPromises();
    expect((service.updateMyProfile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('disables duplicate submits while a save is in flight', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveSave = resolve;
    });
    const service = accountService({ updateMyProfile: vi.fn().mockReturnValue(pending) });
    const { wrapper } = mountDialog(service);
    await flushPromises();

    await wrapper.get('[data-testid="profile-editor-nickname"]').setValue('Renamed');
    const save = wrapper.get('[data-testid="profile-editor-save"]');
    await save.trigger('click');
    await save.trigger('click');
    expect((save.element as HTMLButtonElement).disabled).toBe(true);
    expect((service.updateMyProfile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    resolveSave({
      ok: true,
      data: {
        account: {
          ...storedAccount,
          profile: { ...storedAccount.profile, nickname: 'Renamed' },
        },
        cloudIdentity: null,
      },
    });
    await flushPromises();
    // Saved once: the bar (and its disabled button) is gone.
    expect(wrapper.find('[data-testid="profile-editor-prompt"]').exists()).toBe(false);
  });
});
