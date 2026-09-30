import { flushPromises, shallowMount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { createI18n, useI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockGoalMutationReceipt,
  createMockKeyResult,
  createMockGoalRecord,
} from '@memoflow/contracts/mocks';
import { productionLocaleMessages } from '../../../locales/production-messages';
import GoalDetailView from './GoalDetailView.vue';
import { Select } from '@memoflow/ui-vue-shadcn';
import { goalTimeframeLabel } from '@memoflow/contracts/goal';
import GoalKeyResultTrajectoryPlot from '../components/GoalKeyResultTrajectoryPlot.vue';
import GoalKeyResultDirectControls from '../components/GoalKeyResultDirectControls.vue';
import { KEY_RESULT_CALCULATION_METHODS } from '../utils';

const actions = vi.hoisted(() => ({
  aggregate: vi.fn(),
  openDialog: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  updateKeyResult: vi.fn(),
  createKeyResult: vi.fn(),
  deleteKeyResult: vi.fn(),
  confirm: vi.fn(),
  createDialog: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'goal-1' } }),
  useRouter: () => ({ push: actions.push }),
  onBeforeRouteUpdate: vi.fn(),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({ getGoalAggregateView: actions.aggregate }),
}));
vi.mock('../../../shared/utils/useStrictInject', () => ({ useStrictInject: () => actions }));
vi.mock('@memoflow/ui-vue-shadcn', async (original) => ({
  ...(await original<typeof import('@memoflow/ui-vue-shadcn')>()),
  useConfirm: actions.confirm,
}));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({ options: ref([]), isLoading: ref(false), createLabel: vi.fn() }),
}));
vi.mock('../composables/useGoalWorkspace', () => ({
  useGoalWorkspace: () => ({
    workspace,
    isLoading: ref(false),
    error: ref(null),
    refresh: actions.refresh,
  }),
}));
function createWorkspace() {
  return {
    goal: createMockGoalMutationReceipt({
      id: 'goal-1' as never,
      name: 'Measurement goal',
      summary: null,
      description: null,
      status: 'InProgress',
      reminderConfig: null,
      start: { kind: 'month', year: 2026, month: 9 },
      target: { kind: 'quarter', year: 2026, quarter: 4 },
      keyResults: KEY_RESULT_CALCULATION_METHODS.map((aggregationMethod, index) =>
        createMockKeyResult({
          id: `kr-${index + 1}` as never,
          title: `Measurement ${index + 1}`,
          description: null,
          weight: index + 1,
          progress: {
            aggregationMethod,
            initialValue: index === 3 ? 100 : 10,
            currentValue: index === 3 ? 60 : 30,
            targetValue: index === 3 ? 20 : 50,
            unit: index % 2 ? null : 'km',
          },
          target: index === 0 ? { kind: 'month', year: 2026, month: 10 } : null,
        }),
      ),
    }).readModel,
    taskContext: {
      availability: 'Available',
      summary: { total: 3, byKeyResult: [{ keyResultId: 'kr-1', total: 3 }] },
      preview: [],
    },
    knowledgeContext: { availability: 'Unavailable' },
    recentReviews: [],
    recentProgress: ['Manual', 'TaskUserMeasurement', 'TaskAutomatic'].map((authorship, index) =>
      createMockGoalRecord({
        id: `record-${index}` as never,
        keyResultId: 'kr-1' as never,
        authorship: authorship as 'Manual' | 'TaskUserMeasurement' | 'TaskAutomatic',
        source:
          authorship === 'Manual' ? null : { type: 'TASK_INSTANCE', id: `occurrence-${index}` },
      }),
    ),
  };
}
const workspace = ref(createWorkspace());
beforeEach(() => {
  vi.clearAllMocks();
  workspace.value = createWorkspace();
});
function mountDetail(locale = 'en-US') {
  return shallowMount(GoalDetailView, {
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: productionLocaleMessages })],
      stubs: {
        GoalRecordDialog: DialogStub,
        GoalKeyResultTrajectoryPlot: false,
        GoalKeyResultDirectControls: false,
        ProductAutoTextarea: false,
        KeyResultDialog: CreateDialogStub,
        Select: SlotStub,
        SelectTrigger: { template: '<button type="button"><slot /></button>' },
        SelectContent: SlotStub,
        SelectItem: SlotStub,
        Popover: SlotStub,
        PopoverTrigger: SlotStub,
        PopoverContent: SlotStub,
        DropdownMenu: SlotStub,
        DropdownMenuTrigger: SlotStub,
        DropdownMenuContent: SlotStub,
        DropdownMenuItem: { template: '<button type="button"><slot /></button>' },
        GoalTimeframePicker: TimeframeStub,
        Button: { template: '<button type="button"><slot /></button>' },
      },
    },
  });
}
const SlotStub = defineComponent({ template: '<div><slot /></div>' });
const TimeframeStub = defineComponent({
  props: ['modelValue', 'placeholder', 'testId', 'disabled'],
  template:
    '<button type="button" :disabled="disabled" :data-testid="testId">{{ modelValue ? goalTimeframeLabel(modelValue, locale) : placeholder }}</button>',
  setup: () => ({ goalTimeframeLabel, locale: useI18n().locale }),
});
const CreateDialogStub = defineComponent({
  setup(_, { expose }) {
    expose({ openForCreateKeyResult: actions.createDialog });
    return () => null;
  },
});
const DialogStub = defineComponent({
  setup(_, { expose }) {
    expose({ openDialog: actions.openDialog });
    return () => null;
  },
});

describe('Goal Detail quick check-in', () => {
  it.each(['click', 'Enter', ' '])(
    'reads the aggregate and opens the dialog once for %s activation',
    async (activation) => {
      actions.aggregate.mockResolvedValue({});
      const wrapper = mountDetail();
      const button = wrapper.get('[data-testid="goal-quick-check-in-kr-2"]');
      expect(button.element.tagName).toBe('BUTTON');
      expect(button.attributes('type')).toBe('button');
      if (activation !== 'click') {
        await button.trigger('keydown', { key: activation });
        await button.trigger('keyup', { key: activation });
        await flushPromises();
        expect(actions.aggregate).not.toHaveBeenCalled();
        expect(actions.openDialog).not.toHaveBeenCalled();
      }
      // happy-dom does not synthesize keyboard clicks; dispatch the native activation click.
      await button.trigger('click');
      await flushPromises();
      expect(actions.aggregate).toHaveBeenCalledTimes(1);
      expect(actions.aggregate).toHaveBeenCalledWith('goal-1');
      expect(actions.openDialog).toHaveBeenCalledTimes(1);
      expect(actions.openDialog).toHaveBeenCalledWith('goal-1', 'kr-2');
      expect(actions.push).not.toHaveBeenCalled();
      expect(actions.updateKeyResult).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );
});

it('recent progress exposes only Goal-owned Manual/user measurement correction', async () => {
  actions.aggregate.mockResolvedValue({});
  const wrapper = mountDetail();
  expect(wrapper.find('[data-testid="correct-goal-record-record-2"]').exists()).toBe(false);
  for (const index of [0, 1]) {
    await wrapper.get(`[data-testid="correct-goal-record-record-${index}"]`).trigger('click');
    await flushPromises();
    expect(actions.openDialog).toHaveBeenLastCalledWith(
      'goal-1',
      'kr-1',
      expect.objectContaining({
        id: `record-${index}`,
        authorship: index ? 'TaskUserMeasurement' : 'Manual',
      }),
    );
  }
  expect(actions.push).not.toHaveBeenCalled();
  wrapper.unmount();
});

describe.each([
  { locale: 'en-US', labels: ['Cumulative', 'Average', 'Maximum', 'Minimum', 'Latest'] },
  { locale: 'zh-CN', labels: ['累计', '平均值', '最高值', '最低值', '最新值'] },
])('Goal Detail trajectory summaries in $locale', ({ locale, labels }) => {
  it('explains all five KRs with canonical method labels, actual units, weight and timeframe', () => {
    const wrapper = mountDetail(locale);
    const rows = wrapper.findAll('[data-testid^="goal-kr-summary-"]');
    expect(rows).toHaveLength(5);
    for (const [index, row] of rows.entries()) {
      const kr = workspace.value.goal.keyResults[index]!;
      expect(row.get(`[data-testid="goal-kr-method-${kr.id}"]`).text()).toBe(labels[index]);
      expect(row.get(`[data-testid="goal-kr-weight-${kr.id}"]`).text()).toBe(String(index + 1));
      expect(row.get('[data-testid="kr-timeframe"] dd').text()).toBe(
        goalTimeframeLabel(kr.target ?? workspace.value.goal.target!, locale),
      );
      const suffix = kr.progress.unit ? ` ${kr.progress.unit}` : '';
      expect(row.get('[data-testid="kr-initial-value"]').text()).toBe(
        `${kr.progress.initialValue}${suffix}`,
      );
      expect(row.get(`[data-testid="goal-quick-check-in-${kr.id}"]`).text()).toBe(
        `${kr.progress.currentValue}${suffix}`,
      );
      expect(row.get('[data-testid="kr-target-value"]').text()).toBe(
        `${kr.progress.targetValue}${suffix}`,
      );
      expect(row.find('[data-testid="kr-trajectory-summary"]').exists()).toBe(true);
      expect(row.findAll('textarea')).toHaveLength(2);
      expect(row.find('[data-testid="draft-kr-current-input"]').exists()).toBe(false);
      expect(row.find('[data-testid="kr-trajectory-editor"]').exists()).toBe(false);
    }
    expect(actions.aggregate).not.toHaveBeenCalled();
    expect(actions.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

it('shows an unset timeframe without inventing a date and retains the KR override', async () => {
  workspace.value.goal.target = null;
  workspace.value.goal.start = null;
  const wrapper = mountDetail();
  const first = wrapper.get('[data-testid="goal-kr-summary-kr-1"]');
  const second = wrapper.get('[data-testid="goal-kr-summary-kr-2"]');
  expect(first.get('[data-testid="kr-timeframe"] dd').text()).toBe('2026-10');
  expect(second.get('[data-testid="kr-timeframe"] dd').text()).toBe('Not set');
  expect(second.get('[data-testid="kr-trajectory-summary"]').text()).toContain('Not set');
  wrapper.unmount();
});

it('keeps linked Task context secondary and preserves both Task and KR deep links', async () => {
  const wrapper = mountDetail();
  const first = wrapper.get('[data-testid="goal-kr-summary-kr-1"]');
  const linkedTasks = first
    .findAll('button')
    .find((button) => button.text().includes('3 linked tasks'))!;
  expect(linkedTasks).toBeDefined();
  expect(first.html().indexOf('kr-trajectory-summary')).toBeLessThan(
    first.html().indexOf('3 linked tasks'),
  );
  expect(wrapper.get('[data-testid="goal-kr-summary-kr-2"]').text()).not.toContain('linked tasks');
  await linkedTasks.trigger('click');
  expect(actions.push).toHaveBeenLastCalledWith({
    name: 'task-list',
    query: { goalId: 'goal-1', keyResultId: 'kr-1' },
  });
  await first.get('[data-testid="goal-kr-detail-kr-1"]').trigger('click');
  expect(actions.push).toHaveBeenLastCalledWith({
    name: 'key-result-detail',
    params: { goalId: 'goal-1', keyResultId: 'kr-1' },
    query: undefined,
    hash: undefined,
  });
  expect(actions.aggregate).not.toHaveBeenCalled();
  wrapper.unmount();
});

it('refreshes after quick check-in and displays the latest canonical current value', async () => {
  const wrapper = mountDetail();
  wrapper.findComponent(DialogStub).vm.$emit('saved');
  await flushPromises();
  expect(actions.refresh).toHaveBeenCalledTimes(1);
  workspace.value.goal.keyResults[1]!.progress.currentValue = 42;
  await flushPromises();
  expect(wrapper.get('[data-testid="goal-quick-check-in-kr-2"]').text()).toBe('42');
  expect(wrapper.findAllComponents(GoalKeyResultTrajectoryPlot)[1]!.props('currentValue')).toBe(42);
  wrapper.unmount();
});

it('does not open quick check-in when the aggregate is unavailable', async () => {
  actions.aggregate.mockResolvedValue(null);
  const wrapper = mountDetail();
  await wrapper.get('[data-testid="goal-quick-check-in-kr-1"]').trigger('click');
  await flushPromises();
  expect(actions.openDialog).not.toHaveBeenCalled();
  wrapper.unmount();
});

function succeedWithPatch() {
  actions.updateKeyResult.mockImplementation(async (_goalId, krId, patch) => {
    const goal = canonicalGoal();
    const kr = goal.keyResults.find((item) => item.id === krId)!;
    if (patch.title !== undefined) kr.title = patch.title;
    if (patch.description !== undefined) kr.description = patch.description;
    if (patch.weight !== undefined) kr.weight = patch.weight;
    if (patch.target !== undefined) kr.target = patch.target;
    if (patch.calculationMethod !== undefined)
      kr.progress.aggregationMethod = patch.calculationMethod;
    goal.version += 1;
    return { ok: true, data: { readModel: goal } };
  });
}

// Clone Vue's reactive read model through serialization for test command receipts.
function canonicalGoal() {
  return JSON.parse(JSON.stringify(workspace.value.goal));
}

describe('KR direct metadata commands', () => {
  it.each([
    ['title', '  Updated title  ', { title: 'Updated title' }, 'Updated title', 'Enter'],
    [
      'description',
      '  Useful description  ',
      { description: 'Useful description' },
      'Useful description',
      'Enter',
    ],
  ] as const)(
    'saves %s from the keyboard and applies the canonical receipt',
    async (field, input, patch, displayed, key) => {
      succeedWithPatch();
      const wrapper = mountDetail();
      const version = workspace.value.goal.version;
      const control = wrapper.get(`textarea[data-testid="goal-kr-${field}-kr-1"]`);
      await control.setValue(input);
      await control.trigger('keydown', { key, ctrlKey: field === 'description' });
      await flushPromises();
      expect(actions.updateKeyResult).toHaveBeenCalledExactlyOnceWith('goal-1', 'kr-1', {
        ...patch,
        expectedVersion: version,
      });
      expect((control.element as HTMLTextAreaElement).value).toBe(displayed);
      expect(workspace.value.goal.version).toBe(version + 1);
      expect(workspace.value.goal.keyResults[1]!.title).toBe('Measurement 2');
      wrapper.unmount();
    },
  );

  it.each(['title', 'description'])(
    'reverts %s and shows service error on failure',
    async (field) => {
      workspace.value.goal.keyResults[0]!.description = 'Authoritative description';
      actions.updateKeyResult.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'Version conflict' },
      });
      const wrapper = mountDetail();
      const control = wrapper.get(`textarea[data-testid="goal-kr-${field}-kr-1"]`);
      const previous = (control.element as HTMLTextAreaElement).value;
      await control.setValue('Failed edit');
      await control.trigger('blur');
      await flushPromises();
      expect((control.element as HTMLTextAreaElement).value).toBe(previous);
      expect(wrapper.get('[role="alert"]').text()).toBe('资源冲突');
      wrapper.unmount();
    },
  );

  it.each(['title', 'description'])(
    'resets %s on Escape without a mutation on subsequent blur',
    async (field) => {
      const wrapper = mountDetail();
      const control = wrapper.get(`textarea[data-testid="goal-kr-${field}-kr-2"]`);
      const previous = (control.element as HTMLTextAreaElement).value;
      await control.setValue('Discard');
      await control.trigger('keydown', { key: 'Escape' });
      await control.trigger('blur');
      await flushPromises();
      expect((control.element as HTMLTextAreaElement).value).toBe(previous);
      expect(actions.updateKeyResult).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it('normalizes empty description to null and blank title to the existing title', async () => {
    workspace.value.goal.keyResults[0]!.description = 'Clear me';
    succeedWithPatch();
    const wrapper = mountDetail();
    const description = wrapper.get('textarea[data-testid="goal-kr-description-kr-1"]');
    await description.setValue('   ');
    await description.trigger('blur');
    await flushPromises();
    expect(actions.updateKeyResult).toHaveBeenLastCalledWith('goal-1', 'kr-1', {
      description: null,
      expectedVersion: expect.any(Number),
    });
    expect((description.element as HTMLTextAreaElement).value).toBe('');
    await description.trigger('blur');
    const title = wrapper.get('textarea[data-testid="goal-kr-title-kr-1"]');
    await title.setValue('  ');
    await title.trigger('blur');
    expect((title.element as HTMLTextAreaElement).value).toBe('Measurement 1');
    expect(actions.updateKeyResult).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it.each([
    ['method', { calculationMethod: 'Average' }],
    ['weight', { weight: 5 }],
    ['timeframe', { target: { kind: 'year', year: 2027 } }],
    ['clear timeframe', { target: null }],
  ])('saves %s through updateKeyResult with the current Goal version', async (field, patch) => {
    succeedWithPatch();
    const wrapper = mountDetail();
    const version = workspace.value.goal.version;
    const controls = wrapper.findAllComponents(GoalKeyResultDirectControls)[0]!;
    if (field === 'method') controls.findComponent(Select).vm.$emit('update:modelValue', 'Average');
    else if (field === 'weight')
      await wrapper.get('[data-testid="goal-kr-weight-kr-1-option-5"]').trigger('click');
    else controls.findComponent(TimeframeStub).vm.$emit('update:modelValue', patch.target);
    await flushPromises();
    expect(actions.updateKeyResult).toHaveBeenCalledExactlyOnceWith('goal-1', 'kr-1', {
      ...patch,
      expectedVersion: version,
    });
    const kr = workspace.value.goal.keyResults[0]!;
    if (field === 'method') expect(kr.progress.aggregationMethod).toBe('Average');
    if (field === 'weight')
      expect(wrapper.get('[data-testid="kr-weight"] dd').text()).toContain('5');
    if (field.includes('timeframe'))
      expect(wrapper.get('[data-testid="goal-kr-timeframe-kr-1"]').text()).toBe(
        goalTimeframeLabel(kr.target ?? workspace.value.goal.target!, 'en-US'),
      );
    wrapper.unmount();
  });

  it.each(['method', 'weight', 'timeframe'])(
    'keeps the displayed %s authoritative and exposes a failed command',
    async (field) => {
      actions.updateKeyResult.mockResolvedValue({
        ok: false,
        error: { code: 'CONFLICT', message: 'Conflict' },
      });
      const wrapper = mountDetail();
      const controls = wrapper.findAllComponents(GoalKeyResultDirectControls)[0]!;
      const trigger = wrapper.get(`[data-testid="goal-kr-${field}-kr-1"]`);
      const previous = trigger.text();
      if (field === 'method') controls.findComponent(Select).vm.$emit('update:modelValue', 'Last');
      else if (field === 'weight')
        await wrapper.get('[data-testid="goal-kr-weight-kr-1-option-5"]').trigger('click');
      else controls.findComponent(TimeframeStub).vm.$emit('update:modelValue', null);
      await flushPromises();
      expect(actions.updateKeyResult).toHaveBeenCalledTimes(1);
      expect(trigger.text()).toBe(previous);
      expect(wrapper.get('[role="alert"]').text()).toBe('资源冲突');
      wrapper.unmount();
    },
  );

  it('locks all KRs until receipt arrival and uses the next version for the next KR', async () => {
    let resolve!: (value: unknown) => void;
    actions.updateKeyResult.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const wrapper = mountDetail();
    const version = workspace.value.goal.version;
    const first = wrapper.get('textarea[data-testid="goal-kr-title-kr-1"]');
    await first.setValue('One');
    await first.trigger('blur');
    const second = wrapper.get('textarea[data-testid="goal-kr-title-kr-2"]');
    expect(second.attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="goal-kr-weight-kr-2-option-5"]').trigger('click');
    expect(actions.updateKeyResult).toHaveBeenCalledTimes(1);
    const goal = canonicalGoal();
    goal.version += 1;
    goal.keyResults[0].title = 'One';
    resolve({ ok: true, data: { readModel: goal } });
    await flushPromises();
    succeedWithPatch();
    await second.setValue('Two');
    await second.trigger('blur');
    await flushPromises();
    expect(actions.updateKeyResult).toHaveBeenLastCalledWith('goal-1', 'kr-2', {
      title: 'Two',
      expectedVersion: version + 1,
    });
    expect((first.element as HTMLTextAreaElement).value).toBe('One');
    expect((second.element as HTMLTextAreaElement).value).toBe('Two');
    wrapper.unmount();
  });

  it('restores a draft after a thrown transport failure', async () => {
    actions.updateKeyResult.mockRejectedValue(new Error('Offline'));
    const wrapper = mountDetail();
    const title = wrapper.get('textarea[data-testid="goal-kr-title-kr-1"]');
    await title.setValue('Unsent');
    await title.trigger('blur');
    await flushPromises();
    expect((title.element as HTMLTextAreaElement).value).toBe('Measurement 1');
    expect(wrapper.get('[role="alert"]').text()).toBe('Offline');
    expect(title.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('removes Edit while retaining create, delete, bound Task and detail navigation', async () => {
    actions.confirm.mockResolvedValue(true);
    actions.deleteKeyResult.mockResolvedValue({ ok: true });
    const wrapper = mountDetail();
    const row = wrapper.get('[data-testid="goal-kr-summary-kr-1"]');
    expect(row.findAll('button').some((button) => button.text() === 'Edit')).toBe(false);
    await wrapper.get('[data-testid="goal-add-key-result"]').trigger('click');
    expect(actions.createDialog).toHaveBeenCalledWith('goal-1');
    await row
      .findAll('button')
      .find((button) => button.text() === 'Create and link task…')!
      .trigger('click');
    expect(actions.push).toHaveBeenLastCalledWith({
      name: 'task-list',
      query: { create: '1', createGoalId: 'goal-1', createKeyResultId: 'kr-1' },
    });
    await row
      .findAll('button')
      .find((button) => button.text() === 'Delete')!
      .trigger('click');
    await flushPromises();
    expect(actions.deleteKeyResult).toHaveBeenCalledWith('goal-1', 'kr-1', {
      expectedVersion: workspace.value.goal.version,
    });
    wrapper.unmount();
  });
});
