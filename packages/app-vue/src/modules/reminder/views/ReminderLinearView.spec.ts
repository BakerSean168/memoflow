/** @vitest-environment jsdom */

import { computed, defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ReminderGroupClientDTO,
  ReminderTemplateClientDTO,
  UserReminderPreferencesClientDTO,
} from '@memoflow/contracts/reminder';
import ReminderLinearView from './ReminderLinearView.vue';
import { toast } from 'vue-sonner';
import enReminder from '../../../locales/en-US/reminder';

const templatesRef = ref<ReminderTemplateClientDTO[]>([]);
const groupsRef = ref<ReminderGroupClientDTO[]>([]);
const preferencesRef = ref<UserReminderPreferencesClientDTO | null>(null);

const fetchTemplates = vi.fn().mockResolvedValue(undefined);
const fetchGroups = vi.fn().mockResolvedValue(undefined);
const fetchPreferences = vi.fn().mockResolvedValue(undefined);
const updatePreferences = vi.fn().mockResolvedValue(null);
const replaceTemplateProfiles = vi.fn().mockResolvedValue(null);
const toggleTemplate = vi.fn().mockResolvedValue(null);

vi.mock('../composables/useReminder', () => ({
  useReminder: () => ({
    templates: computed(() => templatesRef.value),
    groups: computed(() => groupsRef.value),
    isLoading: computed(() => false),
    isSaving: computed(() => false),
    error: computed(() => null),
    preferences: computed(() => preferencesRef.value),
    fetchTemplates,
    fetchGroups,
    fetchPreferences,
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    toggleTemplate,
    replaceTemplateProfiles,
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    toggleGroup: vi.fn(),
    updatePreferences,
    reloadReminderScene: vi.fn(),
  }),
}));

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock('@memoflow/ui-vue-shadcn', async () => {
  const vue = await import('vue');

  const passthrough = (name: string) =>
    vue.defineComponent({
      name,
      props: ['modelValue', 'title', 'variant', 'size', 'disabled'],
      emits: ['update:modelValue', 'click'],
      setup(props, { emit, slots, attrs }) {
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

  const Switch = vue.defineComponent({
    name: 'SwitchStub',
    props: {
      modelValue: Boolean,
      disabled: Boolean,
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        vue.h('button', {
          type: 'button',
          'data-stub': 'Switch',
          'data-checked': String(props.modelValue),
          disabled: props.disabled,
          onClick: () => emit('update:modelValue', !props.modelValue),
        });
    },
  });

  return {
    Button: passthrough('Button'),
    Badge: passthrough('Badge'),
    ScrollArea: passthrough('ScrollArea'),
    Input: passthrough('Input'),
    Switch,
    Tooltip: passthrough('Tooltip'),
    TooltipContent: passthrough('TooltipContent'),
    TooltipTrigger: passthrough('TooltipTrigger'),
    useConfirm: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../../../components/shared', async () => {
  const vue = await import('vue');

  return {
    ActionableWrapper: vue.defineComponent({
      name: 'ActionableWrapperStub',
      setup(_, { slots }) {
        return () => vue.h('div', { 'data-stub': 'ActionableWrapper' }, slots.default?.());
      },
    }),
    menuLabel: (key: string) => key,
  };
});

const TemplateDesktopCardStub = defineComponent({
  name: 'TemplateDesktopCardStub',
  setup() {
    return () => h('div', { 'data-stub': 'TemplateDesktopCard' });
  },
});

const TemplateDialogStub = defineComponent({
  name: 'TemplateDialogStub',
  setup() {
    return () => h('div', { 'data-stub': 'TemplateDialog' });
  },
});

const GroupDialogStub = defineComponent({
  name: 'GroupDialogStub',
  setup() {
    return () => h('div', { 'data-stub': 'GroupDialog' });
  },
});

const TemplateMoveDialogStub = defineComponent({
  name: 'TemplateMoveDialogStub',
  setup() {
    return () => h('div', { 'data-stub': 'TemplateMoveDialog' });
  },
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      reminder: enReminder,
      common: {
        delete: 'Delete',
        cancel: 'Cancel',
      },
    },
  },
});

function createTemplate(
  overrides: Partial<ReminderTemplateClientDTO> = {},
): ReminderTemplateClientDTO {
  return {
    id: 'template-1' as ReminderTemplateClientDTO['id'],
    identityId: 'identity-1' as ReminderTemplateClientDTO['identityId'],
    name: 'Morning review',
    description: null,
    type: 'Recurring',
    icon: null,
    color: null,
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
    profileMemberships: [
      {
        profileId: 'group-1' as ReminderTemplateClientDTO['profileMemberships'][number]['profileId'],
        profileName: 'Focus',
        enabled: true,
        profileEnabled: true,
        profileActive: true,
        effectiveEnabled: true,
      },
    ],
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
    },
    selfEnabled: true,
    effectiveEnabled: true,
    lifecycleSource: 'profile',
    effectiveEnabledReason: 'Template controls itself.',
    globalReminderEnabled: true,
    status: 'Active',
    importanceLevel: 'Moderate',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    version: 1,
    history: null,
    displayTitle: 'Morning review',
    typeText: 'Recurring',
    triggerText: 'Every day',
    statusText: 'Active',
    importanceText: 'Moderate',
    nextTriggerText: null,
    isActive: true,
    isPaused: false,
    lastTriggeredText: null,
    nextTriggerAt: null,
    ...overrides,
  } as ReminderTemplateClientDTO;
}

function createGroup(overrides: Partial<ReminderGroupClientDTO> = {}): ReminderGroupClientDTO {
  return {
    id: 'group-1' as ReminderGroupClientDTO['id'],
    identityId: 'identity-1' as ReminderGroupClientDTO['identityId'],
    name: 'Focus',
    description: 'Deep work reminders',
    color: null,
    icon: null,
    enabled: true,
    status: 'Active',
    order: 0,
    stats: {
      totalTemplates: 2,
      activeTemplates: 1,
      pausedTemplates: 1,
      selfEnabledTemplates: 1,
      selfPausedTemplates: 1,
      templateCountText: '2 templates',
      activeStatusText: '1 active',
    },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    displayName: 'Focus',
    statusText: 'Enabled',
    templateCountText: '2 templates',
    activeStatusText: '1 active',
    ...overrides,
  } as ReminderGroupClientDTO;
}

function createPreferences(
  overrides: Partial<UserReminderPreferencesClientDTO> = {},
): UserReminderPreferencesClientDTO {
  return {
    id: 'pref-1' as UserReminderPreferencesClientDTO['id'],
    identityId: 'identity-1' as UserReminderPreferencesClientDTO['identityId'],
    bestTimeSlots: [],
    worstTimeSlots: [],
    globalReminderEnabled: true,
    globalSmartFrequency: false,
    createdAt: 0,
    updatedAt: 0,
    bestTimeSlotsText: '',
    worstTimeSlotsText: '',
    summaryText: 'The Routine master gate is open.',
    ...overrides,
  };
}

function mountView() {
  return mount(ReminderLinearView, {
    global: {
      plugins: [i18n],
      stubs: {
        GridTemplateItem: true,
        ReminderTemplateCard: TemplateDesktopCardStub,
        TemplateDialog: TemplateDialogStub,
        GroupDialog: GroupDialogStub,
        TemplateMoveDialog: TemplateMoveDialogStub,
      },
    },
  });
}

describe('ReminderLinearView', () => {
  afterEach(() => {
    templatesRef.value = [];
    groupsRef.value = [];
    preferencesRef.value = null;
    fetchTemplates.mockClear();
    fetchGroups.mockClear();
    fetchPreferences.mockClear();
    updatePreferences.mockClear();
    replaceTemplateProfiles.mockClear();
    toggleTemplate.mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the global-off banner and grouped lifecycle summaries', async () => {
    groupsRef.value = [createGroup()];
    templatesRef.value = [
      createTemplate({
        id: 'template-global' as ReminderTemplateClientDTO['id'],
        lifecycleSource: 'global',
        effectiveEnabled: false,
        effectiveEnabledReason: 'Global reminder switch is off.',
      }),
      createTemplate({
        id: 'template-group' as ReminderTemplateClientDTO['id'],
        name: 'Afternoon review',
        lifecycleSource: 'profile',
        selfEnabled: true,
        effectiveEnabled: false,
        effectiveEnabledReason: 'Group is paused.',
      }),
    ];
    preferencesRef.value = createPreferences({
      globalReminderEnabled: false,
      summaryText: 'All Routine execution is paused by the master gate.',
    });

    const wrapper = mountView();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.get('[data-testid="routine-configuration-summary"]').text()).toContain(
      'Routine configuration center',
    );
    expect(wrapper.text()).toContain('this page does not run sessions');
    expect(wrapper.text()).toContain('The Routine master gate is closed');
    expect(wrapper.text()).toContain('All Routine execution is paused by the master gate.');
    expect(wrapper.text()).toContain('1 routines paused by the master gate');

    const groupButton = wrapper.get(`[data-testid="reminder-group-${groupsRef.value[0]?.id}"]`);
    expect(groupButton.text()).toContain('Focus');
    expect(groupButton.text()).toContain('1 routines paused by the master gate');

    await groupButton.trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain('This Profile allows its members to be evaluated.');
    expect(wrapper.text()).toContain('2 routines');
    expect(wrapper.text()).toContain('1 running');
  });

  it('shows root move toast and refreshes selected template when move succeeds', async () => {
    const movedTemplate = createTemplate({
      id: 'template-1' as ReminderTemplateClientDTO['id'],
      profileMemberships: [],
      lifecycleSource: 'routine',
      effectiveEnabledReason: 'Template controls itself after moving to root.',
    });
    replaceTemplateProfiles.mockImplementationOnce(async () => {
      templatesRef.value = [movedTemplate];
      return movedTemplate;
    });

    const TemplateMoveDialogInteractiveStub = defineComponent({
      name: 'TemplateMoveDialogInteractiveStub',
      props: ['template', 'onMove'],
      setup(props) {
        return () =>
          h('button', {
            type: 'button',
            'data-stub': 'trigger-root-move',
            onClick: () => props.onMove(props.template.id, []),
          });
      },
    });

    const TemplateDesktopCardInteractiveStub = defineComponent({
      name: 'TemplateDesktopCardInteractiveStub',
      props: ['template'],
      setup(props) {
        return () =>
          h(
            'div',
            { 'data-stub': 'selected-template-card' },
            props.template?.profileMemberships?.map((item: { profileName?: string | null }) => item.profileName).filter(Boolean).join(', ') || 'root',
          );
      },
    });

    groupsRef.value = [createGroup()];
    templatesRef.value = [createTemplate()];
    preferencesRef.value = createPreferences();

    const wrapper = mount(ReminderLinearView, {
      global: {
        plugins: [i18n],
        stubs: {
          GridTemplateItem: true,
          ReminderTemplateCard: TemplateDesktopCardInteractiveStub,
          TemplateDialog: TemplateDialogStub,
          GroupDialog: GroupDialogStub,
          TemplateMoveDialog: TemplateMoveDialogInteractiveStub,
        },
      },
    });

    const vm = wrapper.vm as unknown as {
      handleTemplateClick: (template: { id: string }) => void;
      handleMoveTemplate: (template: { id: string }) => void;
      templateCardRef?: { open: () => void };
      templateMoveDialogRef?: { open: () => void };
    };
    vm.templateCardRef = { open: vi.fn() };
    vm.templateMoveDialogRef = { open: vi.fn() };

    await nextTick();

    vm.handleTemplateClick({ id: 'template-1' as ReminderTemplateClientDTO['id'] });
    vm.handleMoveTemplate({ id: 'template-1' as ReminderTemplateClientDTO['id'] });
    await nextTick();

    await wrapper.find('[data-stub="trigger-root-move"]').trigger('click');
    await nextTick();

    expect(replaceTemplateProfiles).toHaveBeenCalledWith('template-1', []);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Routine removed from Profile');
    expect(wrapper.find('[data-stub="selected-template-card"]').text()).toBe('root');
  });

  it('refreshes the selected template card immediately after toggling the self switch', async () => {
    const toggledTemplate = createTemplate({
      id: 'template-1' as ReminderTemplateClientDTO['id'],
      selfEnabled: false,
      effectiveEnabled: false,
      lifecycleSource: 'routine',
      effectiveEnabledReason: 'Template self switch is paused.',
    });

    toggleTemplate.mockImplementationOnce(async () => {
      templatesRef.value = [toggledTemplate];
      return toggledTemplate;
    });

    const TemplateDesktopCardInteractiveStub = defineComponent({
      name: 'TemplateDesktopCardInteractiveStub',
      props: ['template'],
      setup(props) {
        return () =>
          h(
            'div',
            { 'data-stub': 'selected-template-card' },
            `${props.template?.selfEnabled ? 'self-on' : 'self-off'}|${
              props.template?.effectiveEnabled ? 'running' : 'paused'
            }`,
          );
      },
    });

    templatesRef.value = [createTemplate()];
    preferencesRef.value = createPreferences();

    const wrapper = mount(ReminderLinearView, {
      global: {
        plugins: [i18n],
        stubs: {
          GridTemplateItem: true,
          ReminderTemplateCard: TemplateDesktopCardInteractiveStub,
          TemplateDialog: TemplateDialogStub,
          GroupDialog: GroupDialogStub,
          TemplateMoveDialog: TemplateMoveDialogStub,
        },
      },
    });

    const vm = wrapper.vm as unknown as {
      handleTemplateClick: (template: { id: string }) => void;
      handleToggleEnabled: (template: { id: string }) => Promise<void>;
      templateCardRef?: { open: () => void };
    };
    vm.templateCardRef = { open: vi.fn() };

    await nextTick();

    vm.handleTemplateClick({ id: 'template-1' as ReminderTemplateClientDTO['id'] });
    await nextTick();
    expect(wrapper.find('[data-stub="selected-template-card"]').text()).toBe('self-on|running');

    await vm.handleToggleEnabled({ id: 'template-1' as ReminderTemplateClientDTO['id'] });
    await nextTick();

    expect(wrapper.find('[data-stub="selected-template-card"]').text()).toBe('self-off|paused');
  });

  it('preserves the paused effective result while a Profile gate is closed', async () => {
    const toggledTemplate = createTemplate({
      id: 'template-1' as ReminderTemplateClientDTO['id'],
      selfEnabled: false,
      effectiveEnabled: false,
      lifecycleSource: 'profile',
      profileMemberships: [
        { profileId: 'group-1' as never, profileName: 'Focus', enabled: true, profileEnabled: false, profileActive: false, effectiveEnabled: false },
      ],
      effectiveEnabledReason: 'Profile is paused.',
    });

    toggleTemplate.mockResolvedValueOnce(toggledTemplate);
    groupsRef.value = [createGroup({ enabled: false })];
    templatesRef.value = [
      createTemplate({
        lifecycleSource: 'profile',
        effectiveEnabled: false,
        profileMemberships: [
          { profileId: 'group-1' as never, profileName: 'Focus', enabled: true, profileEnabled: false, profileActive: false, effectiveEnabled: false },
        ],
      }),
    ];
    preferencesRef.value = createPreferences();

    const wrapper = mountView();
    await nextTick();

    const vm = wrapper.vm as unknown as {
      handleToggleEnabled: (template: { id: string }) => Promise<void>;
    };

    await vm.handleToggleEnabled({ id: 'template-1' as ReminderTemplateClientDTO['id'] });

    expect(toggleTemplate).toHaveBeenCalledWith('template-1');
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Routine paused');
  });

  it('shows enabled toast when global reminder is turned back on', async () => {
    updatePreferences.mockResolvedValueOnce(createPreferences({ globalReminderEnabled: true }));
    preferencesRef.value = createPreferences({ globalReminderEnabled: false });

    const wrapper = mountView();
    await nextTick();

    const vm = wrapper.vm as unknown as {
      handleToggleGlobalReminder: (enabled: boolean) => Promise<void>;
    };

    await vm.handleToggleGlobalReminder(true);

    expect(updatePreferences).toHaveBeenCalledWith({ globalReminderEnabled: true });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Routine master gate opened');
  });
});
