import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h, nextTick, onMounted, type Ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providePanelWidth } from '../../../layouts/shell/usePanelWidth';
import GoalModuleLayout from './GoalModuleLayout.vue';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';

const goalMocks = vi.hoisted(() => ({
  setSelectedFolderId: vi.fn(),
  setSystemView: vi.fn(),
  search: vi.fn(),
  setLabelIdsAll: vi.fn(),
  fetchGoals: vi.fn(async () => undefined),
  getGoalAggregateView: vi.fn(async () => null),
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
  emits: ['update:open', 'created', 'updated', 'dirty-change'],
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

  it('publishes the goal dialog draft status to the shell', async () => {
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
    expect(shell.surfaceStatus).toBe('clean');

    wrapper.findComponent(GoalDialogStub).vm.$emit('dirty-change', true);
    await nextTick();
    expect(shell.surfaceStatus).toBe('dirty');

    wrapper.findComponent(GoalDialogStub).vm.$emit('dirty-change', false);
    await nextTick();
    expect(shell.surfaceStatus).toBe('clean');
  });
});
