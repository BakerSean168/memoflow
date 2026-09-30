import { flushPromises, shallowMount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockGoalMutationReceipt,
  createMockKeyResult,
  createMockGoalRecord,
} from '@memoflow/contracts/mocks';
import { productionLocaleMessages } from '../../../locales/production-messages';
import GoalDetailView from './GoalDetailView.vue';
import { goalTimeframeLabel } from '@memoflow/contracts/goal';
import GoalKeyResultTrajectoryPlot from '../components/GoalKeyResultTrajectoryPlot.vue';
import { KEY_RESULT_CALCULATION_METHODS } from '../utils';

const actions = vi.hoisted(() => ({
  aggregate: vi.fn(),
  openDialog: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'goal-1' } }),
  useRouter: () => ({ push: actions.push }),
}));
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({ getGoalAggregateView: actions.aggregate }),
}));
vi.mock('../../../shared/utils/useStrictInject', () => ({ useStrictInject: () => ({}) }));
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
        Button: { template: '<button type="button"><slot /></button>' },
      },
    },
  });
}
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
      expect(row.get('[data-testid="kr-method"] dd').text()).toBe(labels[index]);
      expect(row.get('[data-testid="kr-weight"] dd').text()).toBe(String(index + 1));
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
      expect(
        row.find('input, textarea, select, [role="combobox"], [contenteditable="true"]').exists(),
      ).toBe(false);
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
