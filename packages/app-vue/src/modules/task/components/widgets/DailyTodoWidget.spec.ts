import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { useTask } from '../../composables/useTask';
import DailyTodoWidget from './DailyTodoWidget.vue';

vi.mock('../../composables/useTask', () => ({
  useTask: vi.fn(),
}));

const PassThroughStub = defineComponent({
  template: '<div><slot /></div>',
});

function createInstance(status: TaskOccurrenceClientDTO['status']): TaskOccurrenceClientDTO {
  return {
    id: 'TaskOccurrenceId_today',
    templateId: 'TaskPlanId_today',
    instanceDate: Date.now(),
    status,
    timeConfig: { timeType: 'AllDay', startDate: null, timePoint: null, timeRange: null },
  } as TaskOccurrenceClientDTO;
}

describe('DailyTodoWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes the home progress and completed statistics after completing today\'s task', async () => {
    const instances = ref<TaskOccurrenceClientDTO[]>([createInstance('Pending')]);
    const templates = ref<TaskPlanClientDTO[]>([
      {
        id: 'TaskPlanId_today',
        name: 'Close the daily loop',
      } as TaskPlanClientDTO,
    ]);
    const completeInstance = vi.fn(async (id: string) => {
      instances.value = instances.value.map((instance) =>
        instance.id === id ? { ...instance, status: 'Completed' } : instance,
      );
      return instances.value.find((instance) => instance.id === id) ?? null;
    });
    const uncompleteInstance = vi.fn(async (id: string) => {
      instances.value = instances.value.map((instance) =>
        instance.id === id ? { ...instance, status: 'Pending' } : instance,
      );
      return instances.value.find((instance) => instance.id === id) ?? null;
    });

    vi.mocked(useTask).mockReturnValue({
      instances,
      templates,
      isLoading: ref(false),
      fetchInstancesByDateRange: vi.fn().mockResolvedValue(undefined),
      fetchTemplates: vi.fn().mockResolvedValue(undefined),
      completeInstance,
      uncompleteInstance,
    } as unknown as ReturnType<typeof useTask>);

    const wrapper = mount(DailyTodoWidget, {
      global: {
        stubs: {
          Card: PassThroughStub,
          CardHeader: PassThroughStub,
          CardTitle: PassThroughStub,
          CardContent: PassThroughStub,
          ScrollArea: PassThroughStub,
          Button: PassThroughStub,
          Skeleton: true,
          ListTodo: true,
          ArrowRight: true,
          CheckCircle2: true,
          Check: true,
          Loader2: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('0/1');
    expect(wrapper.get('.h-full.rounded-full.bg-emerald-500').attributes('style')).toContain(
      'width: 0%',
    );

    await wrapper.get('button[title="标记完成"]').trigger('click');
    await flushPromises();

    expect(completeInstance).toHaveBeenCalledWith('TaskOccurrenceId_today');
    expect(wrapper.emitted('completed')).toEqual([
      [expect.objectContaining({ id: 'TaskOccurrenceId_today', status: 'Completed' })],
    ]);
    expect(wrapper.text()).toContain('1/1');
    expect(wrapper.get('.h-full.rounded-full.bg-emerald-500').attributes('style')).toContain(
      'width: 100%',
    );
    const undoButton = wrapper.get('button[title="撤销完成"]');
    expect(undoButton.attributes('disabled')).toBeUndefined();

    await undoButton.trigger('click');
    await flushPromises();

    expect(uncompleteInstance).toHaveBeenCalledWith('TaskOccurrenceId_today');
    expect(wrapper.text()).toContain('0/1');
    expect(wrapper.get('.h-full.rounded-full.bg-emerald-500').attributes('style')).toContain(
      'width: 0%',
    );
  });

  it('refreshes today data when the kept-alive Home surface becomes active again', async () => {
    const fetchInstancesByDateRange = vi.fn().mockResolvedValue(undefined);
    const fetchTemplates = vi.fn().mockResolvedValue(undefined);

    vi.mocked(useTask).mockReturnValue({
      instances: ref<TaskOccurrenceClientDTO[]>([]),
      templates: ref<TaskPlanClientDTO[]>([]),
      isLoading: ref(false),
      fetchInstancesByDateRange,
      fetchTemplates,
      completeInstance: vi.fn(),
      uncompleteInstance: vi.fn(),
    } as unknown as ReturnType<typeof useTask>);

    const wrapper = mount(DailyTodoWidget, {
      props: { active: false },
      global: {
        stubs: {
          Card: PassThroughStub,
          CardHeader: PassThroughStub,
          CardTitle: PassThroughStub,
          CardContent: PassThroughStub,
          ScrollArea: PassThroughStub,
          Button: PassThroughStub,
          Skeleton: true,
          ListTodo: true,
          ArrowRight: true,
          CheckCircle2: true,
          Check: true,
          Loader2: true,
        },
      },
    });
    await flushPromises();

    expect(fetchInstancesByDateRange).not.toHaveBeenCalled();
    expect(fetchTemplates).not.toHaveBeenCalled();

    await wrapper.setProps({ active: true });
    await flushPromises();

    expect(fetchInstancesByDateRange).toHaveBeenCalledOnce();
    expect(fetchTemplates).toHaveBeenCalledWith({ page: 1, limit: 200 });

    await wrapper.setProps({ active: false });
    await wrapper.setProps({ active: true });
    await flushPromises();

    expect(fetchInstancesByDateRange).toHaveBeenCalledTimes(2);
    expect(fetchTemplates).toHaveBeenCalledTimes(2);
  });
});
