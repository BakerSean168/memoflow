import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { requireYmd } from '@memoflow/contracts/primitives';
import ProfileCard from './ProfileCard.vue';

const meta = {
  title: 'Business/Account/ProfileCard',
  component: ProfileCard,
  tags: ['autodocs'],
  argTypes: {
    showEditButton: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
  args: {
    showEditButton: true,
    loading: false,
  },
} satisfies Meta<typeof ProfileCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockProfile = {
  nickname: 'JohnDoe',
  realName: 'John Doe',
  avatarUrl: null,
  bio: '一个热爱编程和生活的全栈开发者，喜欢用代码创造有趣的产品。',
  gender: 'Male' as const,
  birthday: requireYmd('1995-06-15'),
};

export const Default: Story = {
  args: {
    profile: mockProfile,
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

export const MinimalProfile: Story = {
  args: {
    profile: {
      nickname: 'NewUser',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay' as const,
      birthday: null,
    },
  },
};

export const WithoutEditButton: Story = {
  args: {
    profile: mockProfile,
    showEditButton: false,
  },
};

export const Loading: Story = {
  args: {
    profile: mockProfile,
    loading: true,
  },
};

export const FemaleProfile: Story = {
  args: {
    profile: {
      ...mockProfile,
      nickname: 'JaneDoe',
      realName: 'Jane Doe',
      gender: 'Female' as const,
      bio: '设计师 & 前端开发，追求极致的用户体验。',
      birthday: requireYmd('1998-03-20'),
    },
  },
};
