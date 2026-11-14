import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { userEvent, within } from 'storybook/test';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@memoflow/ui-vue-shadcn';
import ProductMoreProperties from './ProductMoreProperties.vue';

const meta = {
  title: 'Business/AppVue/ProductMoreProperties',
  component: ProductMoreProperties,
  tags: ['autodocs'],
  args: { label: 'More properties', testId: 'story-more-properties' },
  render: (args) => ({
    components: {
      ProductMoreProperties,
      DropdownMenuGroup,
      DropdownMenuItem,
      DropdownMenuLabel,
      DropdownMenuSeparator,
    },
    setup() {
      return { args };
    },
    template: `
      <div class="flex items-center gap-2 rounded-xl border bg-background p-3">
        <span class="text-sm">Due Nov 20 · High</span>
        <ProductMoreProperties v-bind="args">
          <DropdownMenuLabel>Properties</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>Reminder</DropdownMenuItem>
            <DropdownMenuItem>Recurrence</DropdownMenuItem>
            <DropdownMenuItem>Attachments</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Clear all</DropdownMenuItem>
        </ProductMoreProperties>
      </div>
    `,
  }),
} satisfies Meta<typeof ProductMoreProperties>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const OpenMenu: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByTestId('story-more-properties'));
    await page.findByText('Properties');
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
