import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { requireYmd } from '@memoflow/contracts/primitives';
import ProfileForm from './ProfileForm.vue';

const meta = {
  title: 'Business/Account/ProfileForm',
  component: ProfileForm,
  tags: ['autodocs'],
  argTypes: {
    loading: { control: 'boolean' },
    showCancel: { control: 'boolean' },
  },
  args: {
    loading: false,
    showCancel: true,
  },
} satisfies Meta<typeof ProfileForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockProfile = {
  nickname: 'JohnDoe',
  realName: 'John Doe',
  avatarUrl: null,
  bio: '一个热爱编程和生活的全栈开发者。',
  gender: 'Male' as const,
  birthday: requireYmd('1995-06-15'),
};

export const Default: Story = {
  args: {
    profile: mockProfile,
  },
};

export const EmptyProfile: Story = {
  args: {
    profile: {
      nickname: '',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay' as const,
      birthday: null,
    },
  },
};

export const Loading: Story = {
  args: {
    profile: mockProfile,
    loading: true,
  },
};

export const WithoutCancel: Story = {
  args: {
    profile: mockProfile,
    showCancel: false,
  },
};

export const WithAvatar: Story = {
  args: {
    profile: {
      ...mockProfile,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JohnDoe',
    },
  },
};
