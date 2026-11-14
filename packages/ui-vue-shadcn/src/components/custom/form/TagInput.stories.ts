import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ref } from 'vue';
import TagInput from './TagInput.vue';

const meta = {
  title: 'Custom/Form/TagInput',
  component: TagInput,
  tags: ['autodocs'],
  args: { tags: [] },
  argTypes: {
    tags: { control: 'object' },
    suggestions: { control: 'object' },
    label: { control: 'text' },
    hint: { control: 'text' },
    placeholder: { control: 'text' },
  },
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => ({
    components: { TagInput },
    setup() {
      const tags = ref<string[]>([]);
      return { tags };
    },
    template: `
      <div class="max-w-md p-4">
        <TagInput
          v-model:tags="tags"
          label="Labels"
          hint="Press Enter to add a label. Tags are lowercased and hyphenated."
        />
      </div>
    `,
  }),
};

export const WithTags: Story = {
  render: () => ({
    components: { TagInput },
    setup() {
      const tags = ref(['design-system', 'needs-review', 'q3-roadmap']);
      return { tags };
    },
    template: `
      <div class="max-w-md p-4">
        <TagInput v-model:tags="tags" label="Labels" hint="Remove a label with the × button." />
      </div>
    `,
  }),
};

export const WithSuggestions: Story = {
  render: () => ({
    components: { TagInput },
    setup() {
      const tags = ref(['frontend']);
      const suggestions = ['frontend', 'backend', 'accessibility', 'performance', 'documentation'];
      return { tags, suggestions };
    },
    template: `
      <div class="max-w-md p-4">
        <TagInput
          v-model:tags="tags"
          :suggestions="suggestions"
          label="Labels"
          hint="Start typing to pick an existing label."
        />
      </div>
    `,
  }),
};

export const Interactive: Story = {
  render: () => ({
    components: { TagInput },
    setup() {
      const tags = ref(['design-system', 'needs-review']);
      return { tags };
    },
    template: `
      <div class="max-w-md p-4">
        <TagInput v-model:tags="tags" label="Labels" placeholder="Add a label…" />
      </div>
    `,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');

    await userEvent.type(input, 'accessibility{Enter}');
    await expect(canvas.getByText('accessibility')).toBeVisible();

    const removeButtons = canvas.getAllByRole('button');
    await userEvent.click(removeButtons[0]);
    await expect(canvas.queryByText('design-system')).not.toBeInTheDocument();
  },
};
