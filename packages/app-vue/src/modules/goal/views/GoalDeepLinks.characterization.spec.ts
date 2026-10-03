import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18nPlugin } from '../../../plugins/i18n';
import { useShellRouterSync } from '../../../layouts/shell/useShellRouterSync';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import { createSettingsSceneGuard } from '../../../layouts/shell/surface-leave-protocol';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { goalRoutes } from '../router';
import GoalDetailView from './GoalDetailView.vue';
import { createMockGoalMutationReceipt } from '@memoflow/contracts/mocks';

const calls = vi.hoisted(() => ({
  getGoalAggregateView: vi.fn(),
  getGoalWorkspace: vi.fn(),
  getGoalRecordsByKeyResult: vi.fn(),
  getGoalWorkspaceTasks: vi.fn(),
  openDialog: vi.fn(),
  createGoalReview: vi.fn(),
  getGoalReviews: vi.fn(),
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
  windowStartAt: 1,
  windowEndAt: 2,
  signals: [],
  overallProgress: { startPercentage: 30, endPercentage: 40, deltaPercentage: 10 },
  summary: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
  keyResults: [
    {
      keyResultId: 'kr-1',
      title: 'Distance',
      unit: 'km',
      deltaPercentage: 10,
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
  calls.createGoalReview.mockResolvedValue({
    ok: true,
    data: createMockGoalMutationReceipt(
      { reviews: [review as never] },
      {
        affectedEntityIds: {
          goalIds: [],
          keyResultIds: [],
          recordIds: [],
          reviewIds: [review.id as never],
        },
      },
    ),
  });
  calls.getGoalReviews.mockResolvedValue({
    ok: true,
    data: { reviews: [{ toDTO: () => review }] },
  });
  window.confirm = vi.fn(() => false);
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
      { path: '/', component: probe },
      { path: '/tasks', component: probe },
      { path: '/settings', component: probe },
      {
        ...parent,
        component: RouterView,
        children: parent.children!.map((route) => ({
          ...route,
          component: [
            'key-result-detail',
            'goal-detail',
            'goal-review-create',
            'goal-review-detail',
          ].includes(String(route.name))
            ? GoalDetailView
            : probe,
        })),
      },
    ],
  });
  router.beforeEach(createSettingsSceneGuard());
  await router.push(url);
  await router.isReady();
  const pinia = createPinia();
  let shell!: ReturnType<typeof useShellRouterSync>;
  const host = defineComponent({
    setup() {
      shell = useShellRouterSync();
      return () => h(RouterView);
    },
  });
  const wrapper = mount(host, {
    global: {
      plugins: [pinia, router, createI18nPlugin('en-US', productionLocaleMessages['en-US'])],
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
  return { router, wrapper, shell, store: useAppShellStore(pinia) };
}

describe('Goal deep links — PVC-BASE-002', () => {
  it('maps Goal, KR and Review compatibility URLs to the same production owner', () => {
    const children = goalRoutes[0]!.children!;
    const detail = children.find((route) => route.name === 'goal-detail')!;
    for (const [name, path] of [
      ['goal-detail', ':id'],
      ['key-result-detail', ':goalId/key-results/:keyResultId'],
      ['goal-review-create', ':goalId/review/create'],
      ['goal-review-detail', ':goalId/review/:reviewId'],
    ]) {
      const route = children.find((route) => route.name === name)!;
      expect(route.path).toBe(path);
      expect(route.component).toBe(detail.component);
      expect(route.props).toBe(false);
    }
  });

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

  it('loads Review create on refresh, validates reflection and saves using the default resolver', async () => {
    const first = await load('/goals/goal-1/review/create');
    first.wrapper.unmount();
    const { router, wrapper, store } = await load(
      '/goals/goal-1/review/create?filter=active#context',
    );
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(2);
    expect(calls.getGoalReviewContext).toHaveBeenNthCalledWith(2, 'goal-1');
    expect(createDialog().text()).toContain('40%');
    expect(createDialog().text()).toContain('since the last review');
    const save = createDialog().get('[data-testid="goal-review-save"]');
    expect(save.attributes('disabled')).toBeDefined();
    await createDialog().get('textarea').setValue('   ');
    expect(save.attributes('disabled')).toBeDefined();
    await createDialog().get('textarea').setValue('Steady progress');
    await createDialog().findAll('textarea')[1]!.setValue('  Rain  ');
    expect(store.surfaceStatus).toBe('dirty');
    await save.trigger('click');
    await flushPromises();
    expect(calls.createGoalReview).toHaveBeenCalledExactlyOnceWith('goal-1', {
      expectedVersion: expect.any(Number),
      reflection: 'Steady progress',
      challenges: 'Rain',
      adjustments: null,
    });
    expect(router.currentRoute.value.fullPath).toBe(
      '/goals/goal-1/review/review-1?filter=active#context',
    );
    expect(inspectDialog().text()).toContain('Steady progress');
    expect(inspectDialog().find('textarea').exists()).toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(store.surfaceStatus).toBe('clean');
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(3);
    expect(wrapper.find('[data-testid="goal-detail-view"]').exists()).toBe(true);
    expect(calls.getGoalAggregateView).not.toHaveBeenCalled();
  });

  it.each(['result', 'throw'])(
    'retains draft and route on %s failure and allows retry',
    async (failure) => {
      if (failure === 'result')
        calls.createGoalReview.mockResolvedValueOnce({
          ok: false,
          error: { code: 'UNKNOWN', message: 'Save failed' },
        });
      else calls.createGoalReview.mockRejectedValueOnce(new Error('Save failed'));
      const { router, store } = await load('/goals/goal-1/review/create');
      await createDialog().get('textarea').setValue('Keep this reflection');
      await createDialog().get('[data-testid="goal-review-save"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('goal-review-create');
      expect(createDialog().get('textarea').element.value).toBe('Keep this reflection');
      expect(createDialog().get('[role="alert"]').exists()).toBe(true);
      expect(store.surfaceStatus).toBe('dirty');
      await createDialog().get('[data-testid="goal-review-save"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('goal-review-detail');
      expect(window.confirm).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2])(
    'reverts field %s to its opening baseline and closes without prompting',
    async (field) => {
      const { router, store } = await load('/goals/goal-1/review/create?filter=active#context');
      const textarea = createDialog().findAll('textarea')[field]!;
      await textarea.setValue('draft');
      expect(store.surfaceStatus).toBe('dirty');
      await textarea.setValue('');
      expect(store.surfaceStatus).toBe('clean');
      await createDialog().get('[data-testid="goal-review-cancel"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1?filter=active#context');
      expect(window.confirm).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/goals/goal-1',
    '/goals/goal-1/review/review-1',
    '/goals/goal-1/key-results/kr-1',
    '/goals/goal-2/review/create',
    '/goals?dialog=goal',
    '/goals',
    '/tasks',
    '/settings',
  ])('guards draft navigation to %s, and prompts only once when accepted', async (target) => {
    const { router, store } = await load('/goals/goal-1/review/create');
    await createDialog().get('textarea').setValue('Keep draft');
    await router.push(target);
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    expect(createDialog().get('textarea').element.value).toBe('Keep draft');
    expect(store.surfaceStatus).toBe('dirty');
    expect(window.confirm).toHaveBeenCalledTimes(1);
    vi.mocked(window.confirm).mockReturnValue(true);
    await router.push(target);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(target);
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it('preserves the same draft across unrelated query/hash updates', async () => {
    const { router } = await load('/goals/goal-1/review/create');
    await createDialog().get('textarea').setValue('Keep draft');
    await router.push('/goals/goal-1/review/create?filter=active#context');
    await flushPromises();
    expect(createDialog().get('textarea').element.value).toBe('Keep draft');
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(1);
    expect(calls.getGoalReviewContext).toHaveBeenCalledTimes(1);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('guards cancel and Escape through the route rather than hiding the dialog', async () => {
    const { router } = await load('/goals/goal-1/review/create');
    await createDialog().get('textarea').setValue('Keep draft');
    await createDialog().get('[data-testid="goal-review-cancel"]').trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    expect(createDialog().get('textarea').element.value).toBe('Keep draft');
  });

  it('guards browser back and forward without losing the draft', async () => {
    const { router } = await load('/goals/goal-1');
    await router.push('/goals/goal-1/review/create');
    await flushPromises();
    await createDialog().get('textarea').setValue('Keep draft');
    router.back();
    await vi.waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    expect(createDialog().get('textarea').element.value).toBe('Keep draft');
    vi.mocked(window.confirm).mockReturnValue(true);
    router.back();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('goal-detail'));
    router.forward();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('goal-review-create'));
    await flushPromises();
    expect(createDialog().get('textarea').element.value).toBe('');
    await router.push('/goals/goal-1/review/review-1');
    router.back();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('goal-review-create'));
    await flushPromises();
    await createDialog().get('textarea').setValue('Forward draft');
    vi.mocked(window.confirm).mockReturnValue(false);
    router.forward();
    await vi.waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(3));
    await flushPromises();
    expect(createDialog().get('textarea').element.value).toBe('Forward draft');
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(1);
  });

  it.each(['home', 'module', 'close-tab', 'switch-tab', 'settings'])(
    'shares one approval with shell %s navigation',
    async (action) => {
      const { router, shell, store } = await load('/goals/goal-1/review/create');
      const goalTabId = store.activeTabId!;
      const taskTabId = store.openTab({
        module: 'task',
        route: '/tasks',
        title: 'Tasks',
        intent: 'deeplink',
      }).tabId!;
      store.activateTab(goalTabId);
      await createDialog().get('textarea').setValue('Keep draft');
      const navigate = () =>
        action === 'home'
          ? shell.goHome()
          : action === 'module'
            ? shell.openModule('task', '/tasks')
            : action === 'close-tab'
              ? shell.closeTab(goalTabId)
              : action === 'switch-tab'
                ? shell.activateTab(taskTabId)
                : shell.openSettings();
      await navigate();
      expect(router.currentRoute.value.name).toBe('goal-review-create');
      expect(store.activeTabId).toBe(goalTabId);
      expect(store.surfaceStatus).toBe('dirty');
      vi.mocked(window.confirm).mockReturnValue(true);
      await navigate();
      await flushPromises();
      expect(router.currentRoute.value.name).not.toBe('goal-review-create');
      expect(window.confirm).toHaveBeenCalledTimes(2);
    },
  );

  it('does not retain shell approval after another guard rejects navigation', async () => {
    const { router, shell, store } = await load('/goals/goal-1/review/create');
    await createDialog().get('textarea').setValue('Keep draft');
    const stop = router.beforeResolve(() => false);
    vi.mocked(window.confirm).mockReturnValue(true);
    await shell.goHome();
    expect(store.surfaceStatus).toBe('dirty');
    expect(createDialog().get('textarea').element.value).toBe('Keep draft');
    stop();
    vi.mocked(window.confirm).mockReturnValue(false);
    await shell.goHome();
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(router.currentRoute.value.name).toBe('goal-review-create');
  });

  it('ignores late review detail responses after route switching', async () => {
    let resolveOld!: (value: unknown) => void;
    calls.getGoalReviews.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { router } = await load('/goals/goal-1/review/old');
    expect(inspectDialog().get('[role="status"]').exists()).toBe(true);
    await router.push('/goals/goal-1/review/review-1');
    await flushPromises();
    expect(inspectDialog().text()).toContain(review.reflection);
    resolveOld({
      ok: true,
      data: { reviews: [{ toDTO: () => ({ ...review, id: 'old', reflection: 'Stale review' }) }] },
    });
    await flushPromises();
    expect(inspectDialog().text()).toContain(review.reflection);
    expect(inspectDialog().text()).not.toContain('Stale review');
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(1);
  });

  it('reloads the new owner and ignores the previous create context after an owner switch', async () => {
    let resolveOld!: (value: unknown) => void;
    calls.getGoalReviewContext.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { router } = await load('/goals/goal-1/review/create');
    const result = await calls.getGoalWorkspace.mock.results[0]!.value;
    calls.getGoalWorkspace.mockResolvedValueOnce({
      ...result,
      data: { ...result.data, goal: { ...result.data.goal, id: 'goal-2', name: 'Other goal' } },
    });
    await router.push('/goals/goal-2/review/create');
    await flushPromises();
    expect(createDialog().text()).toContain('Other goal');
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(2);
    expect(calls.getGoalReviewContext).toHaveBeenLastCalledWith('goal-2');
    resolveOld({
      ok: true,
      data: {
        ...context,
        overallProgress: { startPercentage: 999, endPercentage: 999, deltaPercentage: 0 },
      },
    });
    await flushPromises();
    expect(createDialog().text()).not.toContain('999');
  });

  it('keeps saving busy through refresh and blocks close, Escape, routes and shell actions', async () => {
    let resolveSave!: (value: unknown) => void;
    calls.createGoalReview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { router, store, shell } = await load('/goals/goal-1/review/create');
    await createDialog().get('textarea').setValue('Busy draft');
    await createDialog().get('[data-testid="goal-review-save"]').trigger('click');
    expect(store.surfaceStatus).toBe('busy');
    expect(
      createDialog().get('[data-testid="goal-review-cancel"]').attributes('disabled'),
    ).toBeDefined();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await router.push('/tasks');
    await router.push('/goals/goal-1');
    await shell.goHome();
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    expect(window.confirm).not.toHaveBeenCalled();
    const workspaceResult = await calls.getGoalWorkspace.mock.results[0]!.value;
    let resolveRefresh!: (value: unknown) => void;
    calls.getGoalWorkspace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    resolveSave(await calls.createGoalReview.getMockImplementation()!('goal-1', {}));
    await flushPromises();
    expect(store.surfaceStatus).toBe('busy');
    await router.push('/tasks');
    expect(router.currentRoute.value.name).toBe('goal-review-create');
    resolveRefresh(workspaceResult);
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('goal-review-detail');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('opens normal create/latest affordances and navigates overlays without reloading the owner', async () => {
    const workspaceResult = await calls.getGoalWorkspace();
    calls.getGoalWorkspace.mockClear();
    calls.getGoalWorkspace.mockResolvedValue({
      ...workspaceResult,
      data: { ...workspaceResult.data, recentReviews: [review] },
    });
    const { router, wrapper } = await load('/goals/goal-1?filter=active#context');
    await wrapper.get('[data-testid="goal-reviews-row"] button').trigger('click');
    await flushPromises();
    expect(inspectDialog().text()).toContain('Steady progress');
    expect(calls.getGoalReviews).not.toHaveBeenCalled();
    await inspectDialog().get('[data-testid="goal-review-inspect-close"]').trigger('click');
    await flushPromises();
    const create = wrapper.get('[data-testid="goal-reviews-row"] button[aria-label]');
    await create.trigger('click');
    await flushPromises();
    expect(createDialog().exists()).toBe(true);
    await router.push('/goals/goal-1/key-results/kr-1?filter=active#context');
    await flushPromises();
    expect(document.querySelector('[data-testid="goal-kr-inspect"]')).not.toBeNull();
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(1);
  });

  it('restores Review detail on direct refresh, uses full history, and closes with query/hash', async () => {
    for (let refresh = 0; refresh < 2; refresh++) {
      const { router, wrapper } = await load('/goals/goal-1/review/review-1?filter=active#context');
      expect(calls.getGoalReviews).toHaveBeenLastCalledWith('goal-1');
      expect(inspectDialog().text()).toContain('Walk indoors');
      expect(inspectDialog().text()).toContain('Authoritative progress snapshot');
      expect(
        inspectDialog()
          .findAll('button')
          .map((button) => button.text()),
      ).not.toContain('Save review');
      await inspectDialog().get('[data-testid="goal-review-inspect-close"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1?filter=active#context');
      wrapper.unmount();
    }
    expect(calls.getGoalWorkspace).toHaveBeenCalledTimes(2);
  });

  it('still looks up an older review after saving a new one', async () => {
    const { router } = await load('/goals/goal-1/review/create');
    await createDialog().get('textarea').setValue('New review');
    await createDialog().get('[data-testid="goal-review-save"]').trigger('click');
    await flushPromises();
    const older = { ...review, id: 'older', reflection: 'Older review beyond preview' };
    calls.getGoalReviews.mockResolvedValue({
      ok: true,
      data: { reviews: [{ toDTO: () => older }] },
    });
    await router.push('/goals/goal-1/review/older');
    await flushPromises();
    expect(inspectDialog().text()).toContain(older.reflection);
  });

  it.each(['missing-review', 'failed-review', 'missing-goal-create', 'missing-goal-detail'])(
    'shows deterministic closable %s feedback',
    async (missing) => {
      if (missing.startsWith('missing-goal'))
        calls.getGoalWorkspace.mockResolvedValueOnce({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing' },
        });
      if (missing === 'failed-review')
        calls.getGoalReviews.mockResolvedValueOnce({
          ok: false,
          error: { code: 'UNKNOWN', message: 'unavailable' },
        });
      const suffix = missing === 'missing-goal-create' ? 'create' : 'missing-review';
      const { router, wrapper } = await load(
        `/goals/goal-1/review/${suffix}?filter=active#context`,
      );
      if (missing.startsWith('missing-goal')) {
        expect(wrapper.get('[data-testid="goal-not-found"]').text()).toContain(
          'Goal not found or unavailable.',
        );
        await wrapper.get('[data-testid="goal-not-found"] button').trigger('click');
      } else {
        expect(inspectDialog().get('[role="alert"]').text()).toContain(
          missing === 'missing-review' ? 'Review not found.' : 'Failed to load',
        );
        await inspectDialog().get('[data-testid="goal-review-inspect-close"]').trigger('click');
      }
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/goals/goal-1?filter=active#context');
    },
  );
});

function createDialog() {
  return new DOMWrapper(
    document.querySelector<HTMLElement>('[data-testid="goal-review-create-dialog"]')!,
  );
}
function inspectDialog() {
  return new DOMWrapper(
    document.querySelector<HTMLElement>('[data-testid="goal-review-inspect-dialog"]')!,
  );
}
