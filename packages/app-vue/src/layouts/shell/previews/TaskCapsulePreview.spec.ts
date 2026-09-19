/** @vitest-environment jsdom */
import { computed, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskCapsulePreview from './TaskCapsulePreview.vue';

const instancesRef = ref<Record<string, unknown>[]>([]);
const templatesRef = ref<Record<string, unknown>[]>([]);
const errorRef = ref<string | null>(null);
const fetchInstancesByDateRange = vi.fn().mockResolvedValue(undefined);
const fetchTemplates = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../modules/task/composables/useTask', () => ({
  useTask: () => ({
    instances: computed(() => instancesRef.value),
    templates: computed(() => templatesRef.value),
    error: computed(() => errorRef.value),
    fetchInstancesByDateRange,
    fetchTemplates,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: { capsule: { task: 'Task' } },
      shell: {
        enterModule: 'Enter',
        preview: { taskEmpty: 'No tasks', taskAllDone: 'All done', allDay: 'All day' },
      },
      common: { retry: 'Retry', operationFailed: 'failed' },
    },
  },
});

function mountPreview() {
  return mount(TaskCapsulePreview, { global: { plugins: [i18n] } });
}

describe('TaskCapsulePreview', () => {
  afterEach(() => {
    instancesRef.value = [];
    templatesRef.value = [];
    errorRef.value = null;
    vi.clearAllMocks();
  });

  it('loads today instances and resolves titles from templates', async () => {
    const today = Date.now();
    templatesRef.value = [{ id: 'tpl-1', name: 'Write tests' }];
    instancesRef.value = [
      {
        id: 'i1',
        planId: 'tpl-1',
        dueAt: today,
        status: 'Pending',
        scheduleSnapshot: { date: '2026-09-13', timing: { kind: 'At', time: '09:00' } },
      },
    ];
    const wrapper = mountPreview();
    await flushPromises();
    expect(fetchInstancesByDateRange).toHaveBeenCalled();
    expect(fetchTemplates).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="task-capsule-item-i1"]').text()).toContain('Write tests');
    expect(wrapper.get('[data-testid="task-capsule-item-i1"]').text()).toContain('09:00');
    wrapper.unmount();
  });

  it('shows empty state when no instances today', async () => {
    const wrapper = mountPreview();
    await flushPromises();
    expect(wrapper.find('[data-testid="task-capsule-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the retry state when the template list fetch fails (P2-2)', async () => {
    errorRef.value = 'Could not load task templates';
    const wrapper = mountPreview();
    await flushPromises();
    expect(wrapper.find('[data-testid="task-capsule-error"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-capsule-retry"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('re-runs the load when retry is clicked (P2-2)', async () => {
    errorRef.value = 'Could not load task templates';
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('[data-testid="task-capsule-retry"]').trigger('click');
    await flushPromises();
    expect(fetchInstancesByDateRange).toHaveBeenCalledTimes(2);
    expect(fetchTemplates).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
