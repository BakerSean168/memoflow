import type { Meta, StoryObj } from '@storybook/vue3-vite';
import SettingAdvancedActions from './SettingAdvancedActions.vue';

const meta = {
  title: 'Business/Setting/DataTransferActions',
  component: SettingAdvancedActions,
  tags: ['autodocs'],
  args: {
    exportingData: false,
    importingData: false,
    dataPortabilityAvailable: true,
    serverDataDisclosureAvailable: true,
    exportingServerDataDisclosure: false,
    dataPortabilityResult: null,
  },
} satisfies Meta<typeof SettingAdvancedActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PreferenceOnly: Story = {
  args: {
    dataPortabilityAvailable: false,
    serverDataDisclosureAvailable: false,
  },
};

export const Exporting: Story = {
  args: {
    exportingData: true,
    exportingServerDataDisclosure: true,
  },
};

export const WithResult: Story = {
  args: {
    dataPortabilityResult: 'Exported goals: 2, tasks: 8',
  },
};
