import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { provide, ref, toRaw } from 'vue';
import { LABEL_SERVICE_KEY } from '../../../../di/keys';
import type { ILabelService } from '../../../../di/types';
import { TaskYmdSchema } from '@memoflow/contracts/task';
import type { TaskPlanViewModel } from '../types';
import TaskPlanForm from './TaskPlanForm.vue';

const plan: TaskPlanViewModel = {
  id: 'story-plan', title: 'Review practice', status: 'Active', importance: 'Moderate',
  checklist: [], labels: [],
  schedule: { kind: 'OneTime', date: TaskYmdSchema.parse('2026-10-22'), timing: { kind: 'AllDay' } },
};
const meta = {
  title: 'Business/Task/TaskPlanForm/TaskPlanForm',
  component: TaskPlanForm,
  tags: ['ci-interaction'],
  args: { modelValue: plan },
  render: (args) => ({
    components: { TaskPlanForm },
    setup() {
      provide(LABEL_SERVICE_KEY, { listLabels: async () => ({ ok: true, data: [] }) } as unknown as ILabelService);
      const model = ref(structuredClone(toRaw(args.modelValue)));
      return { args, model };
    },
    template: '<div class="p-6"><TaskPlanForm v-bind="args" v-model="model" /></div>',
  }),
} satisfies Meta<typeof TaskPlanForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = await canvas.findByTestId('task-plan-title-input');
    await expect(title).toHaveValue('Review practice');
    await userEvent.clear(title);
    await userEvent.type(title, 'Updated practice');
    await expect(title).toHaveValue('Updated practice');
    await userEvent.click(canvas.getByTestId('task-schedule-chip'));
    await expect(await within(canvasElement.ownerDocument.body).findByTestId('task-schedule-popover')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.getByTestId('task-schedule-chip')).toHaveFocus();
  },
};

export const Readonly: Story = {
  args: { readonly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('task-plan-title-input')).toBeDisabled();
    await expect(canvas.getByTestId('task-schedule-chip')).toBeDisabled();
  },
};

export const MissingPlan: Story = {
  args: { modelValue: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Failed to load task plan')).toBeVisible();
    await expect(canvas.queryByTestId('task-plan-title-input')).not.toBeInTheDocument();
  },
};
