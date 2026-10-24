import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Input } from '.';
import { Label } from '../label';

const meta = {
  title: 'Atoms/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    modelValue: { control: 'text' },
    /* @ts-ignore */ placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    type: { control: 'select', options: ['text', 'email', 'password', 'number', 'tel', 'url'] },
  },
  args: { ...({} as any) },
} as Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { ...({} as any) };

export const WithLabel: Story = {
  ...({} as any),
  render: () => ({
    components: { Input, Label },
    template: `
      <div class="grid w-full max-w-sm items-center gap-1.5">
        <Label for="email">Email</Label>
        <Input id="email" type="email" placeholder="Email" />
      </div>
    `,
  }),
};

export const Disabled: Story = {
  ...({} as any),
  args: { ...({} as any), placeholder: 'Disabled input' },
};

export const WithValue: Story = {
  ...({} as any),
  args: { ...({} as any), modelValue: 'Hello World' },
};

export const Password: Story = {
  ...({} as any),
  render: () => ({
    components: { Input },
    template: '<Input type="password" placeholder="Enter password" />',
  }),
};
