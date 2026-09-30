import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref, toValue, type ComputedRef, type Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createTestPinia } from '@memoflow/test-utils';
import { ok } from '@memoflow/contracts/result';
import type { UseTaskPlanListQueryComposableOptions } from '../composables/useTaskPlanListQuery';
import type { TaskPlanListQueryInput } from '../../../platform/server-state/query-keys';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { GOAL_SERVICE_KEY, TASK_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../../platform/server-state';
import { useTaskStore } from '../stores/task-store';
import type { LocationQuery } from 'vue-router';
import TaskCompletionMeasurementDialog from '../components/dialogs/TaskCompletionMeasurementDialog.vue';
import TaskOccurrenceInspectDialog from '../components/dialogs/TaskOccurrenceInspectDialog.vue';
import QuickTaskDialog from '../components/dialogs/QuickTaskDialog.vue';
import TaskPlanDialog from '../components/dialogs/TaskPlanDialog.vue';

type ListParams = TaskPlanListQueryInput;
const mocks = vi.hoisted(() => ({
  range: vi.fn(),
  complete: vi.fn(),
  uncomplete: vi.fn(),
  missed: vi.fn(),
  skip: vi.fn(),
  checklist: vi.fn(),
  listParams: undefined as ComputedRef<ListParams> | undefined,
  listEnabled: undefined as UseTaskPlanListQueryComposableOptions['enabled'],
  listLoading: undefined as Ref<boolean> | undefined,
  listError: undefined as Ref<boolean> | undefined,
  listTotal: undefined as Ref<number> | undefined,
  refetch: vi.fn(),
  createPlanSafe: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  route: { query: {} as LocationQuery, hash: '' },
}));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('../composables/useTaskOccurrences', () => ({
  useTaskOccurrences: () => ({
    fetchInstancesByDateRange: mocks.range,
    completeOccurrence: mocks.complete,
    uncompleteOccurrence: mocks.uncomplete,
    markOccurrenceMissed: mocks.missed,
    skipOccurrence: mocks.skip,
    setOccurrenceChecklistItem: mocks.checklist,
  }),
}));
vi.mock('../composables/useTaskPlanListQuery', () => ({
  useTaskPlanListQuery: (options: UseTaskPlanListQueryComposableOptions) => {
    mocks.listParams = options.params as ComputedRef<ListParams>;
    mocks.listEnabled = options.enabled;
    mocks.listLoading = ref(false);
    mocks.listError = ref(false);
    mocks.listTotal = ref(201);
    return {
      templates: ref([]),
      total: mocks.listTotal,
      isLoading: mocks.listLoading,
      isError: mocks.listError,
      refetch: mocks.refetch,
    };
  },
}));
vi.mock('../composables/useTaskPlanMutations', () => ({
  useTaskPlanMutations: () => ({ createPlanSafe: mocks.createPlanSafe, isSaving: ref(false) }),
}));
vi.mock('../utils/task-occurrence-presentation', () => ({
  isTaskOccurrenceOnTodaySurface: () => true,
  isTaskOccurrenceOverdue: () => false,
  sortTaskOccurrences: (rows: unknown[]) => rows,
}));
vi.mock('../../../shared/utils/product-time', () => ({
  startOfDayMs: () => 1000,
  endOfDayMs: () => 2000,
  isTodayMs: () => true,
  getProductTodayYmd: () => '2026-09-29',
}));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>()),
  Button: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('button', slots.default?.()),
  }),
  useConfirm: vi.fn(),
}));
vi.mock('../components/dialogs/TaskPlanDialog.vue', () => ({
  default: defineComponent({
    props: ['modelValue', 'initialGoalBinding', 'mode'],
    emits: ['save', 'cancel', 'update:modelValue'],
    setup: () => () => h('div'),
  }),
}));
import TaskManagementView from './TaskManagementView.vue';

const toolbar = defineComponent({
  name: 'TaskPageToolbar',
  props: ['goalScopeLabel'],
  emits: ['update:active-surface', 'update:plan-state-filter', 'update:label-filter-ids', 'create-task'],
  setup: (props) => () => h('div', props.goalScopeLabel),
});
const occurrenceRow = defineComponent({
  props: ['template'],
  setup: (props) => () => h('div', props.template.name),
});
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.route = reactive({ query: {}, hash: '' });
  mocks.replace.mockImplementation(async (location: { query?: LocationQuery; hash?: string }) => {
    mocks.route.query = location.query ?? {};
    mocks.route.hash = location.hash ?? '';
  });
  mocks.createPlanSafe.mockResolvedValue({ todayOccurrenceCreated: true });
});

function render(detailFails = false, goalBinding: import('@memoflow/contracts/task').TaskGoalBindingDTO | null = null) {
  const pinia = createTestPinia();
  const store = useTaskStore(pinia);
  const occurrences = [
    { id: 'occurrence', planId: 'outside-page', scheduledAt: 1500, status: 'Pending' },
  ] as TaskOccurrenceClientDTO[];
  mocks.range.mockImplementation(async () => {
    store.setInstances(occurrences);
    return occurrences;
  });
  const getPlan = detailFails
    ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi
        .fn()
        .mockResolvedValue(
          ok({
            toDTO: () => ({
              id: 'outside-page',
              name: 'Plan outside page',
              labels: [],
              goalBinding,
            }),
          }),
        );
  const goalService = {
    getGoal: vi.fn().mockResolvedValue(ok({ name: 'Readable Goal' })),
    getKeyResults: vi
      .fn()
      .mockResolvedValue(ok({ keyResults: [{ id: 'kr-id', title: 'Readable KR' }] })),
  };
  const runtime = createTestServerStateRuntime();
  const wrapper = mount(TaskManagementView, {
    global: {
      plugins: [
        pinia,
        createI18n({
          legacy: false,
          locale: 'en',
          missingWarn: false,
          fallbackWarn: false,
          messages: { en: {} },
        }),
      ],
      provide: {
        [TASK_SERVICE_KEY as symbol]: { getPlan },
        [GOAL_SERVICE_KEY as symbol]: goalService,
        [SERVER_STATE_RUNTIME_KEY]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'owner',
      },
      stubs: {
        TaskCompletionMeasurementDialog: true,
        TaskOccurrenceInspectDialog: true,
        TaskPageToolbar: toolbar,
        TaskOccurrenceRow: occurrenceRow,
        TaskPlanRow: true,
        Dialog: defineComponent({
          name: 'DialogStub',
          props: ['open'],
          emits: ['update:open'],
          setup: (props, { slots }) => () => props.open ? h('div', slots.default?.()) : null,
        }),
        ProductDialogShell: defineComponent({
          setup: (_, { slots }) => () => h('div', [slots.default?.(), slots.footer?.()]),
        }),
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, getPlan, goalService, store };
}

describe('Task Management quick create', () => {
  it('opens the title-only dialog on direct load and refresh without opening the full editor', async () => {
    mocks.route.query = { dialog: 'quick-task', source: 'today' };
    for (let load = 0; load < 2; load++) {
      const { wrapper } = render();
      await flushPromises();
      expect(wrapper.findComponent(QuickTaskDialog).props('modelValue')).toBe(true);
      expect(wrapper.findAll('input')).toHaveLength(1);
      expect(wrapper.findComponent(TaskPlanDialog).props('modelValue')).toBe(false);
      wrapper.unmount();
      wrappers.pop();
    }
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.createPlanSafe).not.toHaveBeenCalled();
  });

  it('consumes later route changes and closes when the quick intent is removed', async () => {
    const { wrapper } = render();
    await flushPromises();
    const dialog = wrapper.findComponent(QuickTaskDialog);
    expect(dialog.props('modelValue')).toBe(false);
    mocks.route.query = { dialog: 'quick-task' };
    await flushPromises();
    expect(dialog.props('modelValue')).toBe(true);
    mocks.route.query = { dialog: 'another-dialog' };
    await flushPromises();
    expect(dialog.props('modelValue')).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'dismiss'] as const)('clears only quick dialog state on %s without reopening', async (action) => {
    const unrelated = { source: 'overview', labels: ['a', 'b'], flag: null };
    mocks.route.query = { ...unrelated, dialog: 'quick-task' };
    mocks.route.hash = '#today';
    const { wrapper } = render();
    await flushPromises();
    const dialog = wrapper.findComponent(QuickTaskDialog);
    await wrapper.get('input').setValue('Unsaved draft');
    if (action === 'cancel') await dialog.get('button[type="button"]').trigger('click');
    else dialog.findComponent({ name: 'DialogStub' }).vm.$emit('update:open', false);
    await flushPromises();
    expect(dialog.props('modelValue')).toBe(false);
    expect(mocks.route.query).toEqual(unrelated);
    expect(mocks.route.hash).toBe('#today');
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    mocks.route.query = { ...mocks.route.query, source: 'ai' };
    await flushPromises();
    expect(dialog.props('modelValue')).toBe(false);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.createPlanSafe).not.toHaveBeenCalled();
    expect(mocks.range).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft on failure, then creates the canonical quick plan and refreshes bounded Today on retry', async () => {
    mocks.route.query = { dialog: 'quick-task', source: 'ai', tags: ['a', 'b'] };
    mocks.createPlanSafe.mockResolvedValueOnce(null);
    const { wrapper } = render();
    await flushPromises();
    await wrapper.get('input').setValue('  Ship review  ');
    await wrapper.get('#quick-task-form').trigger('submit');
    await flushPromises();
    const expectedRequest = {
      name: 'Ship review',
      description: null,
      schedule: { kind: 'OneTime', date: '2026-09-29', timing: { kind: 'AllDay' } },
      reminderConfig: null,
      importance: 'Moderate',
      labelIds: [],
      goalBinding: null,
      checklist: [],
    };
    expect(mocks.createPlanSafe).toHaveBeenLastCalledWith(expectedRequest, 'quick');
    expect(wrapper.findComponent(QuickTaskDialog).props('modelValue')).toBe(true);
    expect(wrapper.get('input').element.value).toBe('  Ship review  ');
    expect(mocks.route.query.dialog).toBe('quick-task');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.range).toHaveBeenCalledTimes(1);

    await wrapper.get('#quick-task-form').trigger('submit');
    await flushPromises();
    expect(mocks.createPlanSafe).toHaveBeenCalledTimes(2);
    expect(mocks.createPlanSafe).toHaveBeenLastCalledWith(expectedRequest, 'quick');
    expect(wrapper.findComponent(QuickTaskDialog).props('modelValue')).toBe(false);
    expect(wrapper.findComponent(TaskPlanDialog).props('modelValue')).toBe(false);
    expect(mocks.route.query).toEqual({ source: 'ai', tags: ['a', 'b'] });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.range).toHaveBeenCalledTimes(2);
    expect(mocks.range).toHaveBeenLastCalledWith(1000, 2000, { force: true, includeOverdueOpen: true });
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('refreshes Today even when quick creation is opened over Plans without inheriting its Goal scope', async () => {
    mocks.route.query = { goalId: 'goal-id', keyResultId: 'kr-id', dialog: 'quick-task' };
    const { wrapper } = render();
    await flushPromises();
    expect(toValue(mocks.listEnabled)).toBe(true);
    expect(mocks.range).not.toHaveBeenCalled();
    await wrapper.get('input').setValue('Unbound task');
    await wrapper.get('#quick-task-form').trigger('submit');
    await flushPromises();
    expect(mocks.createPlanSafe.mock.calls[0][0].goalBinding).toBeNull();
    expect(mocks.route.query).toEqual({ goalId: 'goal-id', keyResultId: 'kr-id' });
    expect(mocks.range).toHaveBeenCalledWith(1000, 2000, { force: true, includeOverdueOpen: true });
  });

  it('preserves full create-and-bind and the ordinary New Task editor', async () => {
    mocks.route.query = { create: '1', createGoalId: 'goal-id', createKeyResultId: 'kr-id' };
    const { wrapper } = render();
    await flushPromises();
    const fullDialog = wrapper.findComponent(TaskPlanDialog);
    expect(fullDialog.props()).toMatchObject({
      modelValue: true,
      mode: 'create',
      initialGoalBinding: { goalId: 'goal-id', keyResultId: 'kr-id' },
    });
    expect(wrapper.findComponent(QuickTaskDialog).props('modelValue')).toBe(false);
    expect(mocks.listParams!.value).toEqual({ page: 1, limit: 100 });
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'task-list' });
    fullDialog.vm.$emit('cancel');
    await flushPromises();
    wrapper.findComponent(toolbar).vm.$emit('create-task');
    await flushPromises();
    expect(fullDialog.props('modelValue')).toBe(true);
    expect(fullDialog.props('initialGoalBinding')).toBeNull();
    expect(wrapper.findComponent(QuickTaskDialog).props('modelValue')).toBe(false);
  });
});

describe('Task Management bounded reads', () => {
  it('renders Today facts whose plan is outside the bounded Plan page', async () => {
    const { wrapper, getPlan } = render();
    await flushPromises();
    expect(mocks.range).toHaveBeenCalledWith(1000, 2000, {
      force: false,
      includeOverdueOpen: true,
    });
    expect(getPlan).toHaveBeenCalledWith('outside-page');
    expect(toValue(mocks.listEnabled)).toBe(false);
    expect(wrapper.text()).toContain('Plan outside page');
    wrapper.findComponent(toolbar).vm.$emit('update:active-surface', 'plans');
    await flushPromises();
    await wrapper.get('[data-testid="task-plan-pagination"] button:last-child').trigger('click');
    expect(mocks.listParams!.value.page).toBe(2);
    expect(toValue(mocks.listEnabled)).toBe(true);
  });

  it('shows a retryable failure instead of silently dropping unresolved plan details', async () => {
    const { wrapper } = render(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="task-error-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-occurrences-empty-state"]').exists()).toBe(false);
    await wrapper.get('[data-testid="task-error-state"] button').trigger('click');
    await flushPromises();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.range).toHaveBeenLastCalledWith(1000, 2000, { force: true, includeOverdueOpen: true });
  });

  it.each([
    ['all', {}],
    ['active', { status: ['Active'], outcome: ['Open'], archiveState: 'active' }],
    ['paused', { status: ['Paused'], outcome: ['Open'], archiveState: 'active' }],
    ['succeeded', { outcome: ['Succeeded'] }],
    ['failed', { outcome: ['Failed'] }],
    ['abandoned', { outcome: ['Abandoned'] }],
    ['archived', { archiveState: 'archived' }],
  ])('sends the %s Plan state before paging and resets to page one', async (state, filter) => {
    const { wrapper } = render();
    await flushPromises();
    const controls = wrapper.findComponent(toolbar);
    controls.vm.$emit('update:active-surface', 'plans');
    controls.vm.$emit('update:plan-state-filter', state === 'all' ? 'active' : 'all');
    controls.vm.$emit('update:label-filter-ids', ['a', 'b']);
    await flushPromises();
    await wrapper.get('[data-testid="task-plan-pagination"] button:last-child').trigger('click');
    expect(mocks.listParams!.value.page).toBe(2);
    controls.vm.$emit('update:plan-state-filter', state);
    await flushPromises();
    expect(mocks.listParams!.value).toEqual({ page: 1, limit: 100, labelIdsAll: ['a', 'b'], ...filter });
    mocks.listTotal!.value = 7;
    await flushPromises();
    expect(wrapper.find('[data-testid="task-plan-pagination"]').exists()).toBe(false);
  });

  it('resets pagination when labels are selected, changed or cleared and Goal/KR scope changes', async () => {
    const { wrapper } = render();
    await flushPromises();
    const controls = wrapper.findComponent(toolbar);
    controls.vm.$emit('update:active-surface', 'plans');
    await flushPromises();
    for (const labels of [['a'], ['a', 'b'], []]) {
      await wrapper.get('[data-testid="task-plan-pagination"] button:last-child').trigger('click');
      expect(mocks.listParams!.value.page).toBe(2);
      controls.vm.$emit('update:label-filter-ids', labels);
      await flushPromises();
      expect(mocks.listParams!.value.page).toBe(1);
      expect(mocks.listParams!.value.labelIdsAll).toEqual(labels.length ? labels : undefined);
    }
    const scopes: Record<string, string>[] = [
      { goalId: 'goal-id' },
      { goalId: 'goal-id', keyResultId: 'kr-id' },
      { goalId: 'goal-id', keyResultId: 'other-kr' },
      { goalId: 'other-goal' },
      {},
    ];
    for (const scope of scopes) {
      await wrapper.get('[data-testid="task-plan-pagination"] button:last-child').trigger('click');
      expect(mocks.listParams!.value.page).toBe(2);
      mocks.route.query = scope;
      await flushPromises();
      expect(mocks.listParams!.value).toEqual({ page: 1, limit: 100, ...scope });
    }
  });

  it('ignores Plan query loading and errors on Today and includes them on Plans', async () => {
    const { wrapper } = render();
    await flushPromises();
    mocks.listLoading!.value = true;
    mocks.listError!.value = true;
    await flushPromises();
    expect(wrapper.text()).toContain('Plan outside page');
    expect(wrapper.find('[data-testid="task-loading-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-error-state"]').exists()).toBe(false);

    wrapper.findComponent(toolbar).vm.$emit('update:active-surface', 'plans');
    await flushPromises();
    expect(wrapper.find('[data-testid="task-loading-state"]').exists()).toBe(true);
    mocks.listLoading!.value = false;
    await flushPromises();
    expect(wrapper.find('[data-testid="task-error-state"]').exists()).toBe(true);
    await wrapper.get('[data-testid="task-error-state"] button').trigger('click');
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.range).toHaveBeenCalledTimes(1);
  });

  it('ignores Today detail failures on Plans', async () => {
    const { wrapper } = render(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="task-error-state"]').exists()).toBe(true);
    wrapper.findComponent(toolbar).vm.$emit('update:active-surface', 'plans');
    await flushPromises();
    expect(wrapper.find('[data-testid="task-error-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-plans-empty-state"]').exists()).toBe(true);
  });

  it('resolves readable deeplink scope and clears it to safe copy on lookup failure', async () => {
    mocks.route.query = { goalId: 'goal-id', keyResultId: 'kr-id' };
    const { wrapper, goalService } = render();
    await flushPromises();
    expect(wrapper.findComponent(toolbar).props('goalScopeLabel')).toBe(
      'Readable Goal · Readable KR',
    );
    expect(mocks.listParams!.value).toMatchObject({ goalId: 'goal-id', keyResultId: 'kr-id' });
    goalService.getGoal.mockRejectedValue(new Error('offline'));
    goalService.getKeyResults.mockRejectedValue(new Error('offline'));
    mocks.route.query = { goalId: 'missing-goal', keyResultId: 'missing-kr' };
    await flushPromises();
    const label = wrapper.findComponent(toolbar).props('goalScopeLabel');
    expect(label).not.toContain('missing-goal');
    expect(label).not.toContain('missing-kr');
    expect(label).not.toContain('Readable');
  });
});


describe('Today occurrence inspect', () => {
  it('opens local inspect instead of navigating, tracks store corrections and navigates only with View Plan', async () => {
    const { wrapper, store } = render();
    await flushPromises();
    wrapper.findComponent(occurrenceRow).vm.$emit('inspect', 'occurrence');
    await flushPromises();
    const dialog = wrapper.findComponent(TaskOccurrenceInspectDialog);
    expect(dialog.props('modelValue')).toBe(true);
    expect(dialog.props('planName')).toBe('Plan outside page');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    const updated = { ...store.instances[0], status: 'Completed' as const, version: 2 };
    store.updateInstance(updated);
    await flushPromises();
    expect(dialog.props('occurrence')).toMatchObject({ status: 'Completed', version: 2 });
    store.setInstances([]);
    await flushPromises();
    expect(dialog.props('occurrence')).toMatchObject({ status: 'Completed', version: 2 });
    expect(dialog.props('modelValue')).toBe(true);
    mocks.uncomplete.mockResolvedValueOnce({ ...updated, status: 'Pending', version: 3 });
    dialog.vm.$emit('uncomplete', 'occurrence');
    await flushPromises();
    expect(dialog.props('occurrence')).toMatchObject({ status: 'Pending', version: 3 });
    dialog.vm.$emit('view-plan', 'outside-page');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ name: 'task-detail', params: { id: 'outside-page' } });
    expect(wrapper.findComponent(TaskOccurrenceInspectDialog).exists()).toBe(false);
  });
});


it('uses the same coordinator for row and inspect intents, with selected busy state', async () => {
  const { wrapper } = render();
  await flushPromises();
  const row = wrapper.findComponent(occurrenceRow);
  row.vm.$emit('inspect', 'occurrence');
  await flushPromises();
  const dialog = wrapper.findComponent(TaskOccurrenceInspectDialog);
  let finish!: () => void;
  mocks.complete.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  row.vm.$emit('complete', 'occurrence');
  await flushPromises();
  expect(dialog.props('busy')).toBe(true);
  dialog.vm.$emit('skip', 'occurrence');
  expect(mocks.skip).not.toHaveBeenCalled();
  finish();
  await flushPromises();
  expect(dialog.props('busy')).toBe(false);
  for (const [event, operation] of [
    ['complete', mocks.complete], ['uncomplete', mocks.uncomplete],
    ['missed', mocks.missed], ['skip', mocks.skip],
  ] as const) {
    dialog.vm.$emit(event, 'occurrence');
    await flushPromises();
    expect(operation).toHaveBeenCalledWith('occurrence');
  }
  dialog.vm.$emit('checklist-change', 'occurrence', 'step', true, 9);
  await flushPromises();
  expect(mocks.checklist).toHaveBeenCalledWith('occurrence', { definitionId: 'step', completed: true, expectedVersion: 9 });
});

it.each(['row', 'inspect'])('Home %s resolves Prompt using the occurrence Plan outside the paged list', async host => {
  const { wrapper, store } = render(false, { goalId: 'goal' as never, keyResultId: 'kr' as never, contribution: null,
    progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 0 } });
  await flushPromises();
  const row = wrapper.findComponent(occurrenceRow);
  if (host === 'inspect') {
    row.vm.$emit('inspect', 'occurrence');
    await flushPromises();
    wrapper.getComponent(TaskOccurrenceInspectDialog).vm.$emit('complete', 'occurrence');
  } else row.vm.$emit('complete', 'occurrence');
  await flushPromises();
  const dialog = wrapper.getComponent(TaskCompletionMeasurementDialog);
  const coordinator = dialog.props('coordinator');
  expect(coordinator.pendingMeasurement.value).toEqual({ occurrenceId: 'occurrence', goalId: 'goal', keyResultId: 'kr', suggestedValue: 0 });
  expect(mocks.complete).not.toHaveBeenCalled();
  const completed = { ...store.instances[0], status: 'Completed' as const };
  mocks.complete.mockResolvedValue(completed);
  await coordinator.submitMeasurement(-2, 'actual');
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith('occurrence', { goalMeasurement: { value: -2, note: 'actual' } });
  // Completed overdue rows can leave Today; the dialog must still update an open Inspect.
  store.setInstances([]);
  dialog.vm.$emit('completed', completed);
  await flushPromises();
  if (host === 'inspect') expect(wrapper.getComponent(TaskOccurrenceInspectDialog).props('occurrence')).toEqual(completed);
});
