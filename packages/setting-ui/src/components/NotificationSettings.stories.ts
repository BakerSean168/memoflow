import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onBeforeUnmount, ref } from 'vue';
import { settingUiHost, type SettingNotificationPreferenceFacade } from '../setting-ui-host';
import NotificationSettings from './NotificationSettings.vue';

function renderPreferences(enabled = true) {
  return {
    components: { NotificationSettings },
    setup() {
      const desktop = ref(enabled);
      const categories = ref<Record<string, boolean>>({
        task: false,
        goal: true,
        routine: true,
        account: true,
        system: true,
      });
      const facade: SettingNotificationPreferenceFacade = {
        modules: ['task', 'goal', 'routine', 'account', 'system'],
        isLoaded: ref(true),
        isLoading: ref(false),
        isSaving: ref(false),
        error: ref(null),
        hasGlobalChannel: () => desktop.value,
        hasChannel: (moduleName) => categories.value[moduleName] ?? true,
        loadPreferences: async () => undefined,
        setGlobalChannel: async (_flag, value) => {
          desktop.value = value;
          return true;
        },
        setModuleChannel: async (moduleName, _flag, value) => {
          categories.value[moduleName] = value;
          return true;
        },
      };
      const original = settingUiHost.useNotificationPreferences;
      settingUiHost.useNotificationPreferences = () => facade;
      onBeforeUnmount(() => {
        settingUiHost.useNotificationPreferences = original;
      });
    },
    template: '<div class="max-w-3xl"><NotificationSettings /></div>',
  };
}

const meta = {
  title: 'Business/Setting/NotificationSettings',
  component: NotificationSettings,
  tags: ['autodocs'],
  render: () => renderPreferences(),
} satisfies Meta<typeof NotificationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const DesktopDisabled: Story = { render: () => renderPreferences(false) };
