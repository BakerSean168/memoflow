import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from '.';
import { ref } from 'vue';

const meta = {
  title: 'Atoms/TagsInput',
  component: TagsInput,
  tags: ['autodocs'],
} satisfies Meta<typeof TagsInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      TagsInput,
      TagsInputInput,
      TagsInputItem,
      TagsInputItemDelete,
      TagsInputItemText,
    },
    setup() {
      const modelValue = ref(['Vue', 'React']);
      return { modelValue };
    },
    template: `
      <TagsInput v-model="modelValue" class="w-[350px]">
        <TagsInputItem v-for="item in modelValue" :key="item" :value="item">
          <TagsInputItemText />
          <TagsInputItemDelete />
        </TagsInputItem>
        <TagsInputInput placeholder="Add framework..." />
      </TagsInput>
    `,
  }),
};

export const Empty: Story = {
  render: () => ({
    components: {
      TagsInput,
      TagsInputInput,
      TagsInputItem,
      TagsInputItemDelete,
      TagsInputItemText,
    },
    setup() {
      const modelValue = ref<string[]>([]);
      return { modelValue };
    },
    template: `
      <TagsInput v-model="modelValue" class="w-[350px]">
        <TagsInputItem v-for="item in modelValue" :key="item" :value="item">
          <TagsInputItemText />
          <TagsInputItemDelete />
        </TagsInputItem>
        <TagsInputInput placeholder="Type and press enter..." />
      </TagsInput>
    `,
  }),
};
