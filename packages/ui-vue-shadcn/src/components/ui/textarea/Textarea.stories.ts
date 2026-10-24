import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { Textarea } from '.';
import { Label } from '../label';

const meta = {
  title: 'Atoms/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    /* @ts-ignore */ placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
  },
  args: { ...({} as any), placeholder: 'Type your message here.' },
} as Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { ...({} as any) };

export const WithLabel: Story = {
  ...({} as any),
  render: () => ({
    components: { Textarea, Label },
    template: `
      <div class="grid w-full gap-1.5">
        <Label for="message">Your message</Label>
        <Textarea id="message" placeholder="Type your message here." />
      </div>
    `,
  }),
};

export const Disabled: Story = {
  ...({} as any),
  args: { ...({} as any), placeholder: 'Disabled textarea' },
};

export const WithValue: Story = {
  ...({} as any),
  args: { ...({} as any), modelValue: 'This is some pre-filled content in the textarea.' },
};
