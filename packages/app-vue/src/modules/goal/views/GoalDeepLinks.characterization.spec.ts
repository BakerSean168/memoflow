import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { goalRoutes } from '../router';
import GoalDetailView from './GoalDetailView.vue';
import { createMockGoalMutationReceipt } from '@memoflow/contracts/mocks';
import GoalReviewCreationView from './GoalReviewCreationView.vue';
import GoalReviewDetailView from './GoalReviewDetailView.vue';

const calls = vi.hoisted(() => ({
  getGoalAggregateView: vi.fn(),
  getGoalWorkspace: vi.fn(),
  getGoalRecordsByKeyResult: vi.fn(),
  getGoalWorkspaceTasks: vi.fn(),
  openDialog: vi.fn(),
  createReview: vi.fn(),
  getGoalReviewContext: vi.fn(),
}));
const kr = {
  id: 'kr-1',
  title: 'Distance',
  description: 'Walk daily',
  target: null,
  weight: 3,
  progress: {
    aggregationMethod: 'Sum',
    initialValue: 0,
    currentValue: 4,
    targetValue: 10,
    unit: 'km',
  },
  progressPercentage: 40,
  isCompleted: false,
};
const context = {
  overallProgress: { endPercentage: 40, deltaPercentage: 10 },
  summary: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
  keyResults: [
    {
      keyResultId: 'kr-1',
      title: 'Distance',
      unit: 'km',
      startPercentage: 30,
      endPercentage: 40,
      trend: [],
    },
  ],
};
const review = {
  id: 'review-1',
  reflection: 'Steady progress',
  challenges: 'Rain',
  adjustments: 'Walk indoors',
  reviewedAt: Date.parse('2026-09-30T12:00:00Z'),
  systemContext: context,
};
const keyResults = ref<(typeof kr)[]>([]);
const goalReviews = ref<(typeof review)[]>([]);
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({ keyResults, goalReviews, ...calls }),
}));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({ options: ref([]), isLoading: ref(false), createLabel: vi.fn() }),
}));
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.clearAllMocks();
  keyResults.value = [];
  goalReviews.value = [];
  calls.getGoalAggregateView.mockImplementation(async () => {
    keyResults.value = [kr];
    goalReviews.value = [review];
  });
  calls.getGoalWorkspace.mockResolvedValue({
    ok: true,
    data: {
      goal: createMockGoalMutationReceipt({
        id: 'goal-1' as never,
        name: 'Walking goal',
        keyResults: [kr as never],
        labels: [],
        reminderConfig: null,
      }).readModel,
      taskContext: { availability: 'Unavailable', preview: [], summary: null },
      knowledgeContext: { availability: 'Unavailable', preview: [], summary: null },
      recentProgress: [],
      recentReviews: [],
    },
  });
  calls.getGoalRecordsByKeyResult.mockResolvedValue({ ok: true, data: { records: [], total: 0 } });
  calls.getGoalWorkspaceTasks.mockResolvedValue({ ok: true, data: { items: [], total: 0 } });
  calls.getGoalReviewContext.mockResolvedValue({ ok: true, data: context });
  calls.createReview.mockResolvedValue(review);
});

const slotStub = { template: '<div><slot /></div>' };
const recordDialogStub = defineComponent({
  setup(_, { expose }) {
    expose({ openDialog: calls.openDialog });
    return () => null;
  },
});
async function load(url: string) {
  // Keep production route contracts and real detail views; isolate unrelated shell/list views.
  // Resolve lazy views eagerly so module compilation does not consume navigation/test timeouts.
  const parent = goalRoutes[0]!;
  const probe = defineComponent(() => () => h('div', 'Goal destination'));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        ...parent,
        component: RouterView,
        children: parent.children!.map((route) => ({
          ...route,
          component:
            route.name === 'key-result-detail' || route.name === 'goal-detail'
              ? GoalDetailView
              : route.name === 'goal-review-create'
                ? GoalReviewCreationView
                : route.name === 'goal-review-detail'
                  ? GoalReviewDetailView
                  : probe,
        })),
      },
    ],
  });
  await router.push(url);
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: {
      plugins: [
        router,
        createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
      ],
      provide: { [GOAL_SERVICE_KEY as symbol]: calls },
      stubs: {
        GoalRecordDialog: recordDialogStub,
        GoalStatusPicker: true,
        GoalTimeframePicker: true,
        DropdownMenu: slotStub,
        DropdownMenuTrigger: slotStub,
        DropdownMenuContent: slotStub,
        DropdownMenuSub: slotStub,
        DropdownMenuSubTrigger: slotStub,
        DropdownMenuSubContent: slotStub,
        DropdownMenuItem: { template: '<button><slot /></button>' },
        KeyResultDialog: true,
        GoalKnowledgeMenuItems: true,
        GoalReminderMenuItems: true,
        GoalKeyResultDirectControls: true,
      },
    },
  });
  await flushPromises();
  return { router, wrapper };
}

describe('Goal deep links — PVC-BASE-002', () => {
  it('loads the workspace on direct KR refresh and closes while preserving query/hash', async () => {
    for (let refresh = 0; refresh < 2; refresh++) {
      const { router, wrapper } = await load(
        '/goals/goal-1/key-results/kr-1?filter=active#context',
      );
      expect(calls.getGoalWorkspace).toHaveBeenLastCalledWith('goal-1', undefined);
      expect(wrapper.find('[data-testid="goal-detail-view"]').exists()).toBe(true);
      const dialog = document.querySelector('[data-testid="goal-kr-inspect"]')!;
      expect(dialog.textContent).toContain('Distance');
      expect(dialog.textContent).toContain('Walk daily');
      expect(router.currentRoute.value.name).toBe('key-result-detail');
      (dialog.querySelector('[data-testid="goal-kr-inspect-close"]') as HTMLElement).click();
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1?filter=active#context');
      expect(document.querySelector('[data-testid="goal-kr-inspect"]')).toBeNull();
      expect(wrapper.find('[data-testid="goal-detail-view"]').exists()).toBe(true);
      wrapper.unmount();
    }
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(2);
    expect(calls.getGoalAggregateView).not.toHaveBeenCalled();
  });

  it('opens from the normal detail action and synchronizes back/forward without reloading the owner', async () => {
    const { router, wrapper } = await load('/goals/goal-1?filter=active');
    await wrapper.get('[data-testid="goal-kr-detail-kr-1"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="goal-kr-inspect"]')).not.toBeNull();
    expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1/key-results/kr-1?filter=active');
    router.back();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('goal-detail'));
    await flushPromises();
    expect(document.querySelector('[data-testid="goal-kr-inspect"]')).toBeNull();
    router.forward();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('key-result-detail'));
    await flushPromises();
    expect(document.querySelector('[data-testid="goal-kr-inspect"]')).not.toBeNull();
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(1);
    expect(calls.getGoalAggregateView).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('delegates Inspect Current to the existing record dialog and refreshes after save', async () => {
    calls.getGoalAggregateView.mockResolvedValue({});
    const { wrapper } = await load('/goals/goal-1/key-results/kr-1');
    (document.querySelector('[data-testid="goal-inspect-check-in"]') as HTMLElement).click();
    await flushPromises();
    expect(calls.openDialog).toHaveBeenCalledExactlyOnceWith('goal-1', 'kr-1');
    wrapper.findComponent(recordDialogStub).vm.$emit('saved');
    await flushPromises();
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(2);
    expect(calls.getGoalRecordsByKeyResult).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  // GOAL-1301 deliberately replaces BASE-002's blank missing Goal/KR bodies.
  it.each(['missing-kr', 'missing-goal'])(
    'shows explicit deterministic feedback for %s',
    async (missing) => {
      if (missing === 'missing-goal')
        calls.getGoalWorkspace.mockResolvedValueOnce({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing-goal' },
        });
      const goalId = missing === 'missing-goal' ? missing : 'goal-1';
      const { router, wrapper } = await load(`/goals/${goalId}/key-results/missing-kr`);
      expect(router.currentRoute.value.name).toBe('key-result-detail');
      if (missing === 'missing-goal') {
        expect(wrapper.get('[data-testid="goal-not-found"]').text()).toContain(
          'Goal not found or unavailable.',
        );
        await wrapper.get('[data-testid="goal-not-found"] button').trigger('click');
      } else {
        const dialog = document.querySelector('[data-testid="goal-kr-inspect"]')!;
        expect(dialog.querySelector('[data-testid="goal-kr-not-found"]')?.textContent).toBe(
          'Key result not found.',
        );
        (dialog.querySelector('[data-testid="goal-kr-inspect-close"]') as HTMLElement).click();
      }
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe(`/goals/${goalId}`);
      expect(calls.getGoalRecordsByKeyResult).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it('loads Review create on refresh, validates reflection and saves into the canonical detail deep link', async () => {
    const first = await load('/goals/goal-1/review/create');
    first.wrapper.unmount();
    const { router, wrapper } = await load('/goals/goal-1/review/create');
    expect(calls.getGoalAggregateView).toHaveBeenCalledTimes(2);
    expect(calls.getGoalReviewContext).toHaveBeenNthCalledWith(2, 'goal-1', 7);
    expect(wrapper.get('article').text()).toContain('40%');
    const save = wrapper.findAll('button').find((button) => button.text() === 'Save review')!;
    expect(save.attributes('disabled')).toBeDefined();
    await wrapper.findAll('textarea')[0]!.setValue('   ');
    expect(save.attributes('disabled')).toBeDefined();
    await wrapper.findAll('textarea')[0]!.setValue('Steady progress');
    await wrapper.findAll('textarea')[1]!.setValue('  Rain  ');
    await save.trigger('click');
    await flushPromises();
    expect(calls.createReview).toHaveBeenCalledExactlyOnceWith('goal-1', {
      reflection: 'Steady progress',
      challenges: 'Rain',
      adjustments: null,
      windowDays: 7,
    });
    expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1/review/review-1');
    expect(wrapper.text()).toContain('Steady progress');
  });

  it('retains the Review create draft on a failed save and navigates only after retry succeeds', async () => {
    calls.createReview.mockResolvedValueOnce(null);
    const { router, wrapper } = await load('/goals/goal-1/review/create');
    await wrapper.findAll('textarea')[0]!.setValue('Keep this reflection');
    const save = wrapper.findAll('button').find((button) => button.text() === 'Save review')!;
    await save.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    expect(wrapper.findAll('textarea')[0]!.element.value).toBe('Keep this reflection');
    expect(save.attributes('disabled')).toBeUndefined();
    await save.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-detail');
  });

  it('uses history back to leave Review create without saving', async () => {
    const { router, wrapper } = await load('/goals/goal-1');
    await router.push('/goals/goal-1/review/create');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1'));
    expect(calls.createReview).not.toHaveBeenCalled();
  });

  it('restores Review detail on direct load and refresh and closes to its owning Goal', async () => {
    for (let refresh = 0; refresh < 2; refresh++) {
      goalReviews.value = [];
      const { router, wrapper } = await load('/goals/goal-1/review/review-1');
      expect(calls.getGoalAggregateView).toHaveBeenLastCalledWith('goal-1');
      expect(wrapper.text()).toContain('Steady progress');
      expect(wrapper.text()).toContain('Walk indoors');
      expect(wrapper.text()).toContain('Authoritative progress snapshot');
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1');
      wrapper.unmount();
    }
  });

  it('keeps missing Review detail blank with a working Goal back action', async () => {
    const { router, wrapper } = await load('/goals/goal-1/review/missing-review');
    expect(wrapper.get('h1').text()).toBe('Goal review');
    expect(wrapper.find('article').exists()).toBe(false);
    expect(router.currentRoute.value.name).toBe('goal-review-detail');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1');
  });
});
