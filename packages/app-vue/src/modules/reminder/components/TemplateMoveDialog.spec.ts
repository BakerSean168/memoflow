/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type {
  ReminderGroupClientDTO,
  ReminderTemplateClientDTO,
} from '@memoflow/contracts/reminder';
import TemplateMoveDialog from './TemplateMoveDialog.vue';
import enReminder from '../../../locales/en-US/reminder';

vi.mock('@memoflow/ui-vue-shadcn', async () => {
  const vue = await import('vue');

  const passthrough = (name: string) =>
    vue.defineComponent({
      name,
      props: ['open', 'disabled', 'variant', 'modelValue'],
      emits: ['update:open', 'click', 'update:modelValue'],
      setup(props, { slots, attrs, emit }) {
        return () =>
          vue.h(
            'div',
            {
              'data-stub': name,
              ...attrs,
              onClick: () => emit('click'),
            },
            slots.default?.(),
          );
      },
    });

  const Checkbox = vue.defineComponent({
    name: 'CheckboxStub',
    props: {
      modelValue: Boolean,
    },
    emits: ['update:modelValue'],
    setup(props, { emit, attrs }) {
      return () =>
        vue.h('button', {
          type: 'button',
          'data-stub': 'Checkbox',
          'data-checked': String(props.modelValue),
          ...attrs,
          onClick: () => emit('update:modelValue', !props.modelValue),
        });
    },
  });

  const Select = vue.defineComponent({
    name: 'SelectStub',
    props: {
      modelValue: String,
      disabled: Boolean,
    },
    emits: ['update:modelValue'],
    setup(props, { slots, emit }) {
      return () =>
        vue.h(
          'div',
          {
            'data-stub': 'Select',
            'data-disabled': String(props.disabled),
          },
          [
            vue.h(
              'button',
              {
                type: 'button',
                'data-select-value': props.modelValue ?? '',
                onClick: () => emit('update:modelValue', 'group-2'),
              },
              'select-group-2',
            ),
            slots.default?.(),
          ],
        );
    },
  });

  return {
    Dialog: passthrough('Dialog'),
    DialogContent: passthrough('DialogContent'),
    DialogDescription: passthrough('DialogDescription'),
    DialogFooter: passthrough('DialogFooter'),
    DialogHeader: passthrough('DialogHeader'),
    DialogTitle: passthrough('DialogTitle'),
    Button: defineComponent({
      name: 'ButtonStub',
      props: {
        disabled: Boolean,
      },
      emits: ['click'],
      setup(props, { slots, emit, attrs }) {
        return () =>
          h(
            'button',
            {
              type: 'button',
              disabled: props.disabled,
              ...attrs,
              onClick: () => emit('click'),
            },
            slots.default?.(),
          );
      },
    }),
    Label: passthrough('Label'),
    Badge: passthrough('Badge'),
    Card: passthrough('Card'),
    Checkbox,
    Alert: passthrough('Alert'),
    AlertDescription: passthrough('AlertDescription'),
    AlertTitle: passthrough('AlertTitle'),
    Select,
    SelectContent: passthrough('SelectContent'),
    SelectItem: passthrough('SelectItem'),
    SelectTrigger: passthrough('SelectTrigger'),
    SelectValue: passthrough('SelectValue'),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      reminder: enReminder,
    },
  },
});

function createTemplate(
  overrides: Partial<ReminderTemplateClientDTO> = {},
): ReminderTemplateClientDTO {
  return {
    id: 'template-1' as ReminderTemplateClientDTO['id'],
    identityId: 'identity-1' as ReminderTemplateClientDTO['identityId'],
    name: '喝水提醒',
    description: null,
    type: 'Recurring',
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
      displayText: 'At 09:00',
    },
    activeTime: { activatedAt: 0, displayText: 'Activated now' },
    activeHours: null,
    notificationConfig: {
      channels: ['Push'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
      channelsText: 'Push',
      hasSoundEnabled: false,
      hasVibrationEnabled: false,
    },
    selfEnabled: true,
    status: 'Active',
    effectiveEnabled: true,
    profileMemberships: [
      {
        profileId: 'group-1' as ReminderTemplateClientDTO['profileMemberships'][number]['profileId'],
        profileName: '健康管理',
        enabled: true,
        profileEnabled: true,
        profileActive: true,
        effectiveEnabled: true,
      },
    ],
    importanceLevel: 'Moderate',
    tags: [],
    color: null,
    icon: null,
    nextTriggerAt: null,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    history: null,
    displayTitle: '喝水提醒',
    typeText: 'Recurring',
    triggerText: 'Every day',
    statusText: 'Active',
    importanceText: 'Moderate',
    nextTriggerText: null,
    isActive: true,
    isPaused: false,
    lastTriggeredText: null,
    lifecycleSource: 'profile',
    effectiveEnabledReason: 'Group controls this reminder.',
    globalReminderEnabled: true,
    ...overrides,
  } as ReminderTemplateClientDTO;
}

function createGroup(overrides: Partial<ReminderGroupClientDTO> = {}): ReminderGroupClientDTO {
  return {
    id: 'group-1' as ReminderGroupClientDTO['id'],
    identityId: 'identity-1' as ReminderGroupClientDTO['identityId'],
    name: '健康管理',
    description: '健康相关',
    icon: null,
    enabled: true,
    color: null,
    status: 'Active',
    order: 0,
    stats: {
      totalTemplates: 1,
      activeTemplates: 1,
      pausedTemplates: 0,
      selfEnabledTemplates: 1,
      selfPausedTemplates: 0,
      templateCountText: '1 template',
      activeStatusText: '1 active',
    },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    displayName: '健康管理',
    statusText: 'Enabled',
    templateCountText: '1 template',
    activeStatusText: '1 active',
    ...overrides,
  } as ReminderGroupClientDTO;
}

function mountDialog(props?: {
  template?: ReminderTemplateClientDTO | null;
  groups?: ReminderGroupClientDTO[];
  templates?: ReminderTemplateClientDTO[];
  onMove?: (templateId: string, profileIds: readonly string[]) => Promise<boolean>;
}) {
  return mount(TemplateMoveDialog, {
    props: {
      template: props?.template ?? createTemplate(),
      groups: props?.groups ?? [
        createGroup(),
        createGroup({
          id: 'group-2' as ReminderGroupClientDTO['id'],
          name: '工作提醒',
          enabled: true,
        }),
      ],
      templates: props?.templates ?? [
        createTemplate(),
        createTemplate({
          id: 'template-2' as ReminderTemplateClientDTO['id'],
          name: '散步提醒',
          profileMemberships: [
            {
              profileId: 'group-2' as ReminderTemplateClientDTO['profileMemberships'][number]['profileId'],
              profileName: '工作提醒',
              enabled: true,
              profileEnabled: true,
              profileActive: true,
              effectiveEnabled: true,
            },
          ],
        }),
      ],
      onMove: props?.onMove,
    },
    global: {
      plugins: [i18n],
      stubs: {
        transition: false,
        teleport: false,
        DynamicIconStub: defineComponent({
          name: 'DynamicIconStub',
          setup() {
            return () => h('div', { 'data-stub': 'dynamic-icon' });
          },
        }),
      },
    },
  });
}

describe('TemplateMoveDialog', () => {
  it('removes all Profile memberships and shows the unprofiled preview', async () => {
    const onMove = vi.fn().mockResolvedValue(true);
    const wrapper = mountDialog({ onMove });
    (wrapper.vm as unknown as { open: () => void }).open();
    await nextTick();

    const checkboxes = wrapper.findAll('[data-stub="Checkbox"]');
    expect(checkboxes).toHaveLength(2);
    await checkboxes[0]!.trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain(
      'The Routine will keep its own switch and no longer depend on a Profile gate.',
    );

    const moveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Update membership'));
    expect(moveButton).toBeDefined();
    await moveButton!.trigger('click');

    expect(onMove).toHaveBeenCalledWith('template-1', []);
    expect(wrapper.emitted('closed')).toHaveLength(1);
  });

  it('adds a second Profile without collapsing the existing membership', async () => {
    const onMove = vi.fn().mockResolvedValue(true);
    const wrapper = mountDialog({ onMove });
    (wrapper.vm as unknown as { open: () => void }).open();
    await nextTick();

    const checkboxes = wrapper.findAll('[data-stub="Checkbox"]');
    await checkboxes[1]!.trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain(
      'The Profile gate is open. The Routine still runs only when its own switch and the master gate allow it.',
    );

    const moveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Update membership'));
    expect(moveButton).toBeDefined();
    await moveButton!.trigger('click');

    expect(onMove).toHaveBeenCalledWith('template-1', ['group-1', 'group-2']);
    expect(wrapper.emitted('closed')).toHaveLength(1);
  });

  it('shows a preserved-state preview when only a paused Profile remains selected', async () => {
    const wrapper = mountDialog({
      groups: [
        createGroup(),
        createGroup({
          id: 'group-2' as ReminderGroupClientDTO['id'],
          name: '暂停分组',
          enabled: false,
        }),
      ],
    });

    (wrapper.vm as unknown as { open: () => void }).open();
    await nextTick();

    const checkboxes = wrapper.findAll('[data-stub="Checkbox"]');
    await checkboxes[0]!.trigger('click');
    await checkboxes[1]!.trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain(
      'The Profile gate is closed. The Routine’s own switch is preserved and will be evaluated again when the Profile reactivates.',
    );
  });
});
