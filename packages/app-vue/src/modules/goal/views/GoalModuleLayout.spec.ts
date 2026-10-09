import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import {
  defineComponent,
  effectScope,
  h,
  KeepAlive,
  nextTick,
  ref,
  onMounted,
  watch,
  type Ref,
} from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providePanelWidth } from '../../../layouts/shell/usePanelWidth';
import GoalModuleLayout from './GoalModuleLayout.vue';
import GoalDialog from '../components/dialogs/GoalDialog.vue';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { useGoal } from '../composables/useGoal';
import { createMockGoal } from '@memoflow/contracts/mocks';
import type { GetGoalAggregateRes } from '@memoflow/contracts/goal';
import type { GoalNativeEditSession } from '../composables/goalNativeEditSession';
import {
  provideGoalNativeSurface,
  useGoalNativeSurface,
} from '../../../layouts/shell/useGoalNativeSurface';
import { useShellRouterSync } from '../../../layouts/shell/useShellRouterSync';
import { useAppShellStore, MAX_BUSINESS_TABS } from '../../../layouts/shell/useAppShellStore';
import { canLeaveBusinessSurface } from '../../../layouts/shell/surface-leave-protocol';
import { canLeaveAIWorkflowReview } from '../../ai/composables/chatViewHelpers';

const goalMocks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  transitionGoalStatus: vi.fn(async (goal) => goal),
  setSelectedFolderId: vi.fn(),
  setSystemView: vi.fn(),
  search: vi.fn(),
  setLabelIdsAll: vi.fn(),
  fetchGoals: vi.fn(async () => undefined),
  getGoalAggregateView: vi.fn(async (): Promise<GetGoalAggregateRes | null> => null),
}));

vi.mock('../composables/useGoal', async () => {
  const { ref: vueRef } = await import('vue');
  const state = {
    goals: vueRef([]),
    labelIdsAll: vueRef([]),
    systemView: vueRef('active'),
    isSaving: vueRef(false),
    ...goalMocks,
  };
  return { useGoal: () => state };
});

vi.mock('../../../shared/composables/useLabelCatalog', async () => {
  const { ref: vueRef } = await import('vue');
  return {
    useLabelCatalog: () => ({
      options: vueRef([{ id: 'work', name: 'Work', color: null }]),
      isLoading: vueRef(false),
    }),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      goal: {
        systemFolders: {
          active: 'Active',
          completed: 'Completed',
          expired: 'Expired',
          deleted: 'Deleted',
          all: 'All',
        },
      },
    },
  },
});

let routeMountCount = 0;
const RouteContentProbe = defineComponent({
  name: 'RouteContentProbe',
  setup() {
    onMounted(() => {
      routeMountCount += 1;
    });
    return () =>
      h('div', { 'data-testid': 'goal-route-probe' }, [
        h('input', { 'data-testid': 'goal-route-input', value: 'preserved' }),
        h(
          'div',
          {
            'data-testid': 'goal-route-scroll',
            style: 'height: 20px; overflow: auto',
          },
          [h('div', { style: 'height: 200px' })],
        ),
      ]);
  },
});

const ToolbarStub = defineComponent({
  name: 'GoalPageToolbar',
  emits: ['create-goal', 'update-labels', 'select-system-view'],
  setup(_, { emit }) {
    return () =>
      h('header', { 'data-testid': 'goal-page-toolbar' }, [
        h('button', {
          'data-primary-action': 'create-goal',
          'data-testid': 'create-goal-entry',
          onClick: () => emit('create-goal'),
        }),
        h('button', {
          'data-testid': 'goal-label-filter-stub',
          onClick: () => emit('update-labels', ['work', 'ai']),
        }),
        h('button', {
          'data-testid': 'goal-system-view-stub',
          onClick: () => emit('select-system-view', 'completed'),
        }),
      ]);
  },
});

const GoalDialogStub = defineComponent({
  name: 'GoalDialog',
  props: ['open', 'mode', 'goal', 'defaultFolderId'],
  emits: ['update:open', 'created', 'updated', 'dirty-change', 'busy-change'],
  setup() {
    return () => h('div', { 'data-testid': 'goal-dialog-stub' });
  },
});

describe('GoalModuleLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routeMountCount = 0;
    vi.clearAllMocks();
  });

  it('coalesces database changes while cached and refreshes once when activated', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goal-list', component: RouteContentProbe }],
    });
    await router.push('/goals');
    await router.isReady();
    const shown = ref(true);
    const Other = defineComponent({ render: () => h('div', 'Other tab') });
    const Host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, { default: () => (shown.value ? h(GoalModuleLayout) : h(Other)) }),
    });
    const wrapper = mount(Host, {
      global: {
        plugins: [router, i18n],
        stubs: { GoalPageToolbar: ToolbarStub, GoalDialog: GoalDialogStub },
      },
    });
    await flushPromises();
    goalMocks.fetchGoals.mockClear();
    shown.value = false;
    await nextTick();
    for (let index = 0; index < 20; index++)
      window.dispatchEvent(new CustomEvent('db:tables-changed', { detail: { modules: ['goal'] } }));
    expect(goalMocks.fetchGoals).not.toHaveBeenCalled();
    shown.value = true;
    await flushPromises();
    expect(goalMocks.fetchGoals).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('keeps one toolbar and the same route DOM, focus, and scroll state across panel tiers', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goal-list', component: RouteContentProbe }],
    });
    await router.push('/goals');
    await router.isReady();

    let panelWidth: Ref<number | null>;
    const Host = defineComponent({
      setup() {
        const provided = providePanelWidth();
        panelWidth = provided.width;
        panelWidth.value = 450;
        return () => h(GoalModuleLayout);
      },
    });

    const wrapper = mount(Host, {
      attachTo: document.body,
      global: {
        plugins: [router, i18n],
        stubs: {
          GoalPageToolbar: ToolbarStub,
          GoalDialog: GoalDialogStub,
        },
      },
    });
    await nextTick();

    const routeRoot = wrapper.get('[data-testid="goal-route-probe"]').element;
    const routeInput = wrapper.get('[data-testid="goal-route-input"]');
    const routeScroll = wrapper.get('[data-testid="goal-route-scroll"]');
    (routeInput.element as HTMLInputElement).focus();
    routeScroll.element.scrollTop = 48;

    panelWidth!.value = 1200;
    await nextTick();

    expect(wrapper.findAll('[data-testid="goal-page-toolbar"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-primary-action="create-goal"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="goal-route-probe"]').element).toBe(routeRoot);
    expect(wrapper.get('[data-testid="goal-route-input"]').element).toBe(document.activeElement);
    expect(wrapper.get('[data-testid="goal-route-scroll"]').element.scrollTop).toBe(48);
    expect(routeMountCount).toBe(1);

    await wrapper.get('[data-testid="goal-label-filter-stub"]').trigger('click');
    await wrapper.get('[data-testid="goal-system-view-stub"]').trigger('click');
    expect(goalMocks.setLabelIdsAll).toHaveBeenCalledWith(['work', 'ai']);
    expect(goalMocks.setSystemView).toHaveBeenCalledWith('completed');

    vi.clearAllMocks();
    window.dispatchEvent(
      new CustomEvent('db:tables-changed', {
        detail: { tables: ['goals'], modules: ['goal'] },
      }),
    );
    await vi.waitFor(() => {
      expect(goalMocks.fetchGoals).toHaveBeenCalledOnce();
    });

    await wrapper.get('[data-testid="create-goal-entry"]').trigger('click');
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.dialog).toBe('goal');
    });
    wrapper.unmount();

    vi.clearAllMocks();
    window.dispatchEvent(
      new CustomEvent('db:tables-changed', {
        detail: { tables: ['goals'], modules: ['goal'] },
      }),
    );
    await nextTick();
    expect(goalMocks.fetchGoals).not.toHaveBeenCalled();
  });

  it('clears the route-owned create dialog on cancel and can reopen it', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goal-list', component: RouteContentProbe }],
    });
    await router.push('/goals?status=active');
    await router.isReady();

    const wrapper = mount(GoalModuleLayout, {
      global: {
        plugins: [router, i18n],
        stubs: {
          GoalPageToolbar: ToolbarStub,
          GoalDialog: GoalDialogStub,
        },
      },
    });

    await wrapper.get('[data-testid="create-goal-entry"]').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.query.dialog).toBe('goal'));

    wrapper.findComponent(GoalDialogStub).vm.$emit('update:open', false);
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.dialog).toBeUndefined();
      expect(router.currentRoute.value.query.goalId).toBeUndefined();
      expect(router.currentRoute.value.query.status).toBe('active');
    });

    await wrapper.get('[data-testid="create-goal-entry"]').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.query.dialog).toBe('goal'));
  });

  it('preserves unrelated route filters when a Goal save closes the dialog', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goal-list', component: RouteContentProbe }],
    });
    await router.push('/goals?status=active&label=work&dialog=goal');
    await router.isReady();

    const wrapper = mount(GoalModuleLayout, {
      global: {
        plugins: [router, i18n],
        stubs: {
          GoalPageToolbar: ToolbarStub,
          GoalDialog: GoalDialogStub,
        },
      },
    });

    await vi.waitFor(() => expect(wrapper.findComponent(GoalDialogStub).props('open')).toBe(true));
    wrapper.findComponent(GoalDialogStub).vm.$emit('created');

    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.dialog).toBeUndefined();
      expect(router.currentRoute.value.query.goalId).toBeUndefined();
      expect(router.currentRoute.value.query.status).toBe('active');
      expect(router.currentRoute.value.query.label).toBe('work');
    });
    expect(goalMocks.fetchGoals).toHaveBeenCalled();
  });

  it('publishes goal dialog status and preserves review on declined or busy departure', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goal-list', component: RouteContentProbe }],
    });
    await router.push('/goals');
    await router.isReady();

    const wrapper = mount(GoalModuleLayout, {
      global: {
        plugins: [router, i18n],
        stubs: {
          GoalPageToolbar: ToolbarStub,
          GoalDialog: GoalDialogStub,
        },
      },
    });
    const shell = useAppShellStore();

    await wrapper.get('[data-testid="create-goal-entry"]').trigger('click');
    await nextTick();
    await vi.waitFor(() => expect(wrapper.findComponent(GoalDialogStub).props('open')).toBe(true));
    expect(shell.surfaceStatus).toBe('clean');

    wrapper.findComponent(GoalDialogStub).vm.$emit('dirty-change', true);
    await nextTick();
    expect(shell.surfaceStatus).toBe('dirty');
    shell.openTab({
      module: 'goal',
      route: router.currentRoute.value.fullPath,
      title: 'Review',
      intent: 'deeplink',
    });
    const originalConfirm = window.confirm;
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    const leave = () =>
      canLeaveAIWorkflowReview(
        'goal-create',
        { goal: false, task: false, knowledge: false },
        () => canLeaveBusinessSurface((key) => key),
        vi.fn(),
      );
    const reviewRoute = router.currentRoute.value.fullPath;
    expect(leave()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe(reviewRoute);
    expect(wrapper.findComponent(GoalDialogStub).props('open')).toBe(true);

    wrapper.findComponent(GoalDialogStub).vm.$emit('dirty-change', false);
    await nextTick();
    expect(shell.surfaceStatus).toBe('clean');
    wrapper.findComponent(GoalDialogStub).vm.$emit('busy-change', true);
    await nextTick();
    expect(shell.surfaceStatus).toBe('busy');
    expect(leave()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe(reviewRoute);
    expect(wrapper.findComponent(GoalDialogStub).props('open')).toBe(true);
    window.confirm = originalConfirm;
    wrapper.findComponent(GoalDialogStub).vm.$emit('busy-change', false);
    await nextTick();
    expect(shell.surfaceStatus).toBe('clean');
    wrapper.unmount();
  });
});

// Owner session probe keeps these integration tests focused on route/loading/lifecycle.
// The real GoalDialog adapter is exercised in GoalDialog.spec.ts.
const sessionProbe: GoalNativeEditSession = {
  patch: vi.fn(),
  addChild: vi.fn(),
  removeChild: vi.fn(),
  focus: vi.fn(async () => undefined),
  coordinateSubmit: vi.fn(),
  setEditingBlocked: vi.fn(),
  requestSubmit: vi.fn(async () => null),
  requestCancel: vi.fn(),
  readDraftState: vi.fn(),
};
const SessionDialogProbe = defineComponent({
  name: 'GoalDialog',
  props: ['open', 'mode', 'goal'],
  emits: ['session-change', 'update:open'],
  setup(props, { emit }) {
    watch(
      () => [props.open, props.mode, props.goal?.id],
      () => {
        emit('session-change', props.open ? sessionProbe : null);
      },
      { immediate: true },
    );
    return () => h('div', { 'data-testid': 'native-dialog-probe' });
  },
});

async function mountNativeHost(initial = '/tasks', realDialog = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tasks', component: RouteContentProbe },
      { path: '/', component: RouteContentProbe },
      { path: '/repository', component: RouteContentProbe },
      {
        path: '/goals',
        component: GoalModuleLayout,
        children: [{ path: '', name: 'goal-list', component: RouteContentProbe }],
      },
    ],
  });
  await router.push(initial);
  await router.isReady();
  let host!: ReturnType<typeof provideGoalNativeSurface>;
  let disposeHost!: () => void;
  const Consumer = defineComponent({
    setup() {
      const surface = useGoalNativeSurface();
      expect(Object.keys(surface).sort()).toEqual(['locate', 'openCreate', 'openExisting']);
      return () => null;
    },
  });
  const Host = defineComponent({
    setup() {
      useShellRouterSync();
      const hostScope = effectScope();
      host = hostScope.run(provideGoalNativeSurface)!;
      disposeHost = () => hostScope.stop();
      return () =>
        h('div', [
          h(Consumer),
          h(
            RouterView,
            {},
            {
              default: ({ Component }: { Component: ReturnType<typeof h> }) =>
                h(KeepAlive, {}, { default: () => Component }),
            },
          ),
        ]);
    },
  });
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      plugins: [
        pinia,
        router,
        realDialog
          ? createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })
          : i18n,
      ],
      stubs: {
        GoalPageToolbar: ToolbarStub,
        ...(realDialog ? {} : { GoalDialog: SessionDialogProbe }),
      },
    },
  });
  await flushPromises();
  return { router, wrapper, host, disposeHost };
}

describe('Goal native surface host (PVC-AI-8001)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    goalMocks.getGoalAggregateView.mockReset();
    goalMocks.getGoalAggregateView.mockResolvedValue(null);
    useGoal().isSaving.value = false;
  });

  it.each(['create', 'edit'] as const)(
    'preserves the real %s owner draft across route-driven KeepAlive tab switches',
    async (mode) => {
      const goal = createMockGoal({ name: 'Loaded Goal', keyResults: [] });
      const aggregate = {
        goal,
        keyResults: [],
        records: [],
        reviews: [],
        statistics: {
          totalKeyResults: 0,
          completedKeyResults: 0,
          totalRecords: 0,
          totalReviews: 0,
          overallProgress: 0,
        },
      };
      goalMocks.getGoalAggregateView.mockResolvedValue(aggregate);
      const initial = `/goals?dialog=goal${mode === 'edit' ? `&goalId=${goal.id}` : ''}`;
      const { wrapper, router, host } = await mountNativeHost(initial, true);
      const session = host.locate()!;
      expect(session).not.toBeNull();
      session.patch({ name: 'Retained owner draft', summary: 'Unsaved summary' });
      await flushPromises();
      const retained = session.readDraftState();
      const dialog = wrapper.findComponent(GoalDialog);
      const ownerGoal = dialog.props('goal');
      const loads = goalMocks.getGoalAggregateView.mock.calls.length;

      await router.replace({ query: { ...router.currentRoute.value.query, label: 'work' } });
      await flushPromises();
      expect(host.locate()).toBe(session);
      const returnRoute = router.currentRoute.value.fullPath;
      await router.push('/tasks');
      await flushPromises();
      expect(host.locate()).toBeNull();
      expect(() => session.readDraftState()).toThrow('closed');
      expect(dialog.props('open')).toBe(true);
      expect(dialog.props('goal')).toBe(ownerGoal);

      await router.push(returnRoute);
      await flushPromises();
      const restored = host.locate()!;
      expect(restored).not.toBeNull();
      expect(restored).not.toBe(session);
      expect(restored.readDraftState()).toEqual(retained);
      expect(goalMocks.getGoalAggregateView).toHaveBeenCalledTimes(loads);
      expect(wrapper.findComponent(GoalDialog).vm.$).toBe(dialog.vm.$);
      restored.patch({ description: 'Fresh handle is writable' });

      await router.push('/tasks');
      await flushPromises();
      goalMocks.getGoalAggregateView.mockResolvedValue({
        ...aggregate,
        goal: createMockGoal({ id: 'different-goal', name: 'Different Goal', keyResults: [] }),
      });
      await router.push('/goals?dialog=goal&goalId=different-goal');
      await flushPromises();
      expect(goalMocks.getGoalAggregateView).toHaveBeenLastCalledWith('different-goal');
      expect(goalMocks.getGoalAggregateView).toHaveBeenCalledTimes(loads + 1);
      expect(host.locate()!.readDraftState().draft.name).toBe('Different Goal');
      expect(host.locate()!.readDraftState().dirty).toBe(false);
      expect(() => restored.readDraftState()).toThrow('closed');
      wrapper.unmount();
    },
  );

  it.each(['create', 'edit'] as const)(
    'blocks real %s Notes navigation and erroneous child events during deferred submission',
    async (mode) => {
      const goal = createMockGoal({ name: 'Saving Goal', keyResults: [] });
      goalMocks.getGoalAggregateView.mockResolvedValue({
        goal,
        keyResults: [],
        records: [],
        reviews: [],
        statistics: {
          totalKeyResults: 0,
          completedKeyResults: 0,
          totalRecords: 0,
          totalReviews: 0,
          overallProgress: 0,
        },
      });
      let settle!: (value: null) => void;
      const save = mode === 'create' ? goalMocks.createGoal : goalMocks.updateGoal;
      save.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      );
      const { wrapper, router, host } = await mountNativeHost(
        `/goals?dialog=goal${mode === 'edit' ? `&goalId=${goal.id}` : ''}`,
        true,
      );
      const session = host.locate()!;
      session.patch({ name: 'Saving Goal' });
      await flushPromises();
      const notes = document.querySelector('[data-testid="goal-notes-chip"]') as HTMLElement;
      notes.click();
      await flushPromises();
      const actionId =
        mode === 'create' ? 'goal-notes-create-with-ai' : 'goal-notes-open-knowledge';
      const action = () =>
        document.querySelector(`[data-testid="${actionId}"]`) as HTMLButtonElement;
      expect(action().disabled).toBe(false);
      const submitting = session.requestSubmit();
      await flushPromises();
      expect(save).toHaveBeenCalledOnce();
      expect(action().disabled).toBe(true);
      if (mode === 'create') {
        expect(
          (document.querySelector('[data-testid="goal-create-with-ai"]') as HTMLButtonElement)
            .disabled,
        ).toBe(true);
      }
      const route = router.currentRoute.value.fullPath;
      const dialog = wrapper.findComponent(GoalDialog);
      action().click();
      dialog.vm.$emit(mode === 'create' ? 'create-with-ai' : 'open-knowledge', String(goal.id));
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe(route);
      expect(dialog.props('open')).toBe(true);
      expect(host.locate()).toBe(session);

      // A failed save leaves the dialog available for the baseline navigation action.
      settle(null);
      await submitting;
      await flushPromises();
      expect(action().disabled).toBe(false);
      // Also protect against lagging/missing busy-change publication from the child.
      useGoal().isSaving.value = true;
      dialog.vm.$emit('busy-change', false);
      dialog.vm.$emit(mode === 'create' ? 'create-with-ai' : 'open-knowledge', String(goal.id));
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe(route);
      expect(dialog.props('open')).toBe(true);
      useGoal().isSaving.value = false;
      await flushPromises();
      action().click();
      await flushPromises();
      expect(router.currentRoute.value.path).toBe(mode === 'create' ? '/' : '/repository');
      expect(router.currentRoute.value.query).toEqual(
        mode === 'create' ? { workflow: 'goal-create' } : { goalId: String(goal.id) },
      );
      expect(dialog.props('open')).toBe(false);
      wrapper.unmount();
    },
  );

  it('opens/locates the native create route and preserves the same live session on repeat', async () => {
    const { wrapper, router, host } = await mountNativeHost();
    expect(host.locate()).toBeNull();
    const session = await host.openCreate();
    expect(session).toBe(sessionProbe);
    expect(router.currentRoute.value.fullPath).toBe('/goals?dialog=goal');
    expect(wrapper.findComponent(SessionDialogProbe).props('open')).toBe(true);
    expect(useAppShellStore().activeTab?.module).toBe('goal');
    expect(host.locate()).toBe(session);
    expect(await host.openCreate()).toBe(session);
    wrapper.findComponent(SessionDialogProbe).vm.$emit('update:open', false);
    await flushPromises();
    expect(host.locate()).toBeNull();
    expect(router.currentRoute.value.query.dialog).toBeUndefined();
    wrapper.unmount();
    await expect(host.openCreate()).rejects.toThrow('closed');
  });

  it('awaits edit aggregate loading before publishing the native edit session', async () => {
    const { wrapper, router, host } = await mountNativeHost();
    let resolve!: (value: GetGoalAggregateRes | null) => void;
    goalMocks.getGoalAggregateView.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const opened = host.openExisting('goal-existing');
    await flushPromises();
    expect(router.currentRoute.value.query.goalId).toBe('goal-existing');
    expect(host.locate()).toBeNull();
    expect(wrapper.findComponent(SessionDialogProbe).props('open')).toBe(false);
    const goal = createMockGoal({ name: 'Aggregate', version: 9 });
    resolve({
      goal,
      keyResults: [],
      records: [],
      reviews: [],
      statistics: {
        totalKeyResults: 0,
        completedKeyResults: 0,
        totalRecords: 0,
        totalReviews: 0,
        overallProgress: 0,
      },
    });
    expect(await opened).toBe(sessionProbe);
    expect(wrapper.findComponent(SessionDialogProbe).props('mode')).toBe('edit');
    expect(wrapper.findComponent(SessionDialogProbe).props('goal')).toEqual({
      ...goal,
      keyResults: [],
      reviews: [],
    });
    wrapper.unmount();
    expect(host.locate()).toBeNull();
  });

  it('rejects unavailable aggregates and pending opens on shell disposal', async () => {
    const { wrapper, host } = await mountNativeHost();
    await expect(host.openExisting('missing')).rejects.toThrow();
    expect(host.locate()).toBeNull();
    goalMocks.getGoalAggregateView.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = host.openExisting('loading');
    const rejected = expect(pending).rejects.toThrow('closed');
    await flushPromises();
    wrapper.unmount();
    await rejected;
  });

  it('rejects disposal during navigation before registering a readiness watcher without hanging', async () => {
    const { wrapper, host, router, disposeHost } = await mountNativeHost();
    router.beforeResolve(() => {
      disposeHost();
    });
    goalMocks.getGoalAggregateView.mockImplementationOnce(() => new Promise(() => undefined));
    const result = host.openExisting('loading').then(
      () => 'resolved',
      (error) => error.message,
    );
    await flushPromises();
    // A bounded assertion detects the old pending promise without awaiting it forever.
    expect(await Promise.race([result, Promise.resolve('still pending')])).toContain('closed');
    expect(host.locate()).toBeNull();
    wrapper.unmount();
  });

  it('does not allow an old aggregate response to replace a newer create session', async () => {
    const { wrapper, host } = await mountNativeHost();
    let resolve!: (value: GetGoalAggregateRes | null) => void;
    goalMocks.getGoalAggregateView.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = host.openExisting('old');
    const rejected = expect(pending).rejects.toThrow('closed');
    await flushPromises();
    await host.openCreate();
    await rejected;
    resolve({
      goal: createMockGoal(),
      keyResults: [],
      records: [],
      reviews: [],
      statistics: {
        totalKeyResults: 0,
        completedKeyResults: 0,
        totalRecords: 0,
        totalReviews: 0,
        overallProgress: 0,
      },
    });
    await flushPromises();
    expect(wrapper.findComponent(SessionDialogProbe).props('mode')).toBe('create');
    expect(wrapper.findComponent(SessionDialogProbe).props('goal')).toBeNull();
    expect(host.locate()).toBe(sessionProbe);
    wrapper.unmount();
  });

  it('protects dirty/busy surfaces and rejected tab-limit navigation', async () => {
    const { wrapper, host, router } = await mountNativeHost();
    const shell = useAppShellStore();
    shell.setSurfaceStatus('busy');
    await expect(host.openCreate()).rejects.toThrow('declined');
    expect(router.currentRoute.value.path).toBe('/tasks');
    shell.setSurfaceStatus('dirty');
    const confirm = vi.fn(() => false);
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });
    await expect(host.openCreate()).rejects.toThrow('declined');
    expect(router.currentRoute.value.path).toBe('/tasks');
    shell.setSurfaceStatus('clean');
    for (let i = 0; i < MAX_BUSINESS_TABS - 1; i += 1)
      shell.openTab({ module: 'task', route: `/tasks/${i}`, title: 'Task', intent: 'deeplink' });
    expect(shell.tabs).toHaveLength(MAX_BUSINESS_TABS);
    // Restore the route's active tab before requesting a different owner.
    const original = shell.tabs.find((tab) => tab.route === '/tasks');
    if (original) shell.activateTab(original.id);
    await expect(host.openCreate()).rejects.toThrow('not active');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/tasks');
    expect(confirm).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('preserves Goal filters and locates the same draft after unrelated query changes', async () => {
    const { wrapper, host, router } = await mountNativeHost('/goals?status=active&label=work');
    const session = await host.openCreate();
    expect(router.currentRoute.value.query).toMatchObject({
      status: 'active',
      label: 'work',
      dialog: 'goal',
    });
    await router.replace({
      name: 'goal-list',
      query: { ...router.currentRoute.value.query, label: 'health' },
    });
    await flushPromises();
    expect(host.locate()).toBe(session);
    expect(await host.openCreate()).toBe(session);
    wrapper.unmount();
  });

  it('keeps newer registration alive when an old registration disposer runs', async () => {
    const { wrapper, router, host } = await mountNativeHost();
    await host.openCreate();
    const oldDispose = host.register(router.currentRoute.value.fullPath, sessionProbe);
    const newer = { ...sessionProbe };
    const newDispose = host.register(router.currentRoute.value.fullPath, newer);
    oldDispose();
    expect(host.locate()).toBe(newer);
    newDispose();
    expect(host.locate()).toBeNull();
    wrapper.unmount();
  });
});
