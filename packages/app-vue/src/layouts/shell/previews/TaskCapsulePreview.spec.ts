/** @vitest-environment jsdom */
import { computed, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskCapsulePreview from './TaskCapsulePreview.vue';
import { getProductTodayYmd } from '../../../shared/utils/product-time';

const instancesRef = ref<Record<string, unknown>[]>([]);
const templatesRef = ref<Record<string, unknown>[]>([]);
const errorRef = ref<string | null>(null);
const fetchInstancesByDateRange = vi.fn().mockResolvedValue(undefined);
const fetchTemplates = vi.fn().mockResolvedValue(undefined);
const completeOccurrence = vi.fn().mockResolvedValue(undefined);
const uncompleteOccurrence = vi.fn().mockResolvedValue(undefined);
const skipOccurrence = vi.fn().mockResolvedValue(undefined);
const setOccurrenceChecklistItem = vi.fn().mockResolvedValue(undefined);
const createPlanSafe = vi.fn().mockResolvedValue({ todayOccurrenceCreated: true });
const createSaving = ref(false);

vi.mock('../../../modules/task/composables/useTask', () => ({
  useTask: () => ({
    instances: computed(() => instancesRef.value),
    templates: computed(() => templatesRef.value),
    error: computed(() => errorRef.value),
    fetchInstancesByDateRange,
    fetchTemplates,
    completeOccurrence,
    uncompleteOccurrence,
    skipOccurrence,
    setOccurrenceChecklistItem,
  }),
}));

vi.mock('../../../modules/task/composables/useTaskPlanMutations', () => ({
  useTaskPlanMutations: () => ({
    createPlanSafe,
    isSaving: createSaving,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: { capsule: { task: 'Task' } },
      shell: {
        preview: { taskEmpty: 'No tasks', taskAllDone: 'All done', allDay: 'All day' },
        taskWorkspace: { today: 'Today', viewAll: 'View all' },
        home: { quickTask: 'Quick task' },
      },
      common: { retry: 'Retry', operationFailed: 'failed', add: 'Add' },
      task: {
        action: { complete: 'Complete', undoComplete: 'Undo complete', skip: 'Skip' },
        checklist: { title: 'Checklist' },
        quickTask: { placeholder: 'What needs doing?' },
      },
    },
  },
});

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    planId: 'tpl-1',
    dueAt: Date.now(),
    status: 'Pending',
    version: 1,
    checklistState: [],
    scheduleSnapshot: {
      kind: 'OneTime',
      date: '2026-09-28',
      timing: { kind: 'At', time: '09:00' },
    },
    ...overrides,
  };
}

function mountPreview() {
  return mount(TaskCapsulePreview, { global: { plugins: [i18n] } });
}

describe('TaskCapsulePreview quick workspace', () => {
  afterEach(() => {
    instancesRef.value = [];
    templatesRef.value = [];
    errorRef.value = null;
    createSaving.value = false;
    vi.clearAllMocks();
  });

  it('loads all of today and renders executable compact rows instead of a three-item preview', async () => {
    templatesRef.value = [{ id: 'tpl-1', name: 'Write tests' }];
    instancesRef.value = [occurrence()];

    const wrapper = mountPreview();
    await flushPromises();

    expect(fetchInstancesByDateRange).toHaveBeenCalled();
    expect(fetchTemplates).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="task-compact-occurrence-i1"]').text()).toContain(
      'Write tests',
    );
    expect(wrapper.get('[data-testid="task-compact-occurrence-i1"]').text()).toContain('09:00');
    expect(wrapper.get('[data-testid="task-capsule-progress"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('completes a pending occurrence directly from the capsule', async () => {
    templatesRef.value = [{ id: 'tpl-1', name: 'Ship build' }];
    instancesRef.value = [occurrence()];

    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('[data-testid="task-compact-complete-i1"]').trigger('click');
    await flushPromises();

    expect(completeOccurrence).toHaveBeenCalledWith('i1');
    wrapper.unmount();
  });

  it('expands and updates occurrence-owned checklist state without entering Task detail', async () => {
    templatesRef.value = [{ id: 'tpl-1', name: 'Ship build' }];
    instancesRef.value = [
      occurrence({
        version: 7,
        checklistState: [{ definitionId: 'check-1', titleSnapshot: 'Run tests', completed: false }],
      }),
    ];

    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('[data-testid="task-compact-checklist-toggle-i1"]').trigger('click');
    await wrapper.get('[data-testid="task-compact-checklist-item-check-1"]').trigger('click');
    await flushPromises();

    expect(setOccurrenceChecklistItem).toHaveBeenCalledWith('i1', {
      definitionId: 'check-1',
      completed: true,
      expectedVersion: 7,
    });
    wrapper.unmount();
  });

  it('creates a one-time all-day quick task for today inline', async () => {
    const wrapper = mountPreview();
    await flushPromises();

    await wrapper.get('[data-testid="task-capsule-quick-task"]').trigger('click');
    await wrapper.get('input').setValue('  Review PR  ');
    await wrapper.get('[data-testid="task-capsule-quick-create"]').trigger('submit');
    await flushPromises();

    expect(createPlanSafe).toHaveBeenCalledWith(
      {
        name: 'Review PR',
        description: null,
        schedule: {
          kind: 'OneTime',
          date: getProductTodayYmd(),
          timing: { kind: 'AllDay' },
        },
        reminderConfig: null,
        importance: 'Moderate',
        labelIds: [],
        goalBinding: null,
        checklist: [],
      },
      'quick',
    );
    expect(fetchInstancesByDateRange).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="task-capsule-quick-create"]').exists()).toBe(false);
    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the inline quick draft on failure', async () => {
    createPlanSafe.mockResolvedValueOnce(null);
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('[data-testid="task-capsule-quick-task"]').trigger('click');
    await wrapper.get('input').setValue('Retry later');
    await wrapper.get('[data-testid="task-capsule-quick-create"]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('input').element.value).toBe('Retry later');
    expect(wrapper.find('[data-testid="task-capsule-quick-create"]').exists()).toBe(true);
    expect(fetchInstancesByDateRange).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows empty state when no instances today', async () => {
    const wrapper = mountPreview();
    await flushPromises();
    expect(wrapper.find('[data-testid="task-capsule-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows and retries a failed task load', async () => {
    errorRef.value = 'Could not load task templates';
    const wrapper = mountPreview();
    await flushPromises();

    expect(wrapper.find('[data-testid="task-capsule-error"]').exists()).toBe(true);
    await wrapper.get('button').trigger('click');
    wrapper.unmount();
  });
});
