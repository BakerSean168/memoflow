/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref, toValue } from 'vue';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskOccurrenceClientDTO, TaskPlanWorkspace } from '@memoflow/contracts/task';
import enTask from '../../../../locales/en-US/task';
import TaskOccurrenceInspectDialog from './TaskOccurrenceInspectDialog.vue';

const context = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../composables/useTaskPlanWorkspaceQuery', () => ({
  useTaskPlanWorkspaceQuery: (...args: unknown[]) => context.read(...args),
}));
const workspace = ref<Partial<TaskPlanWorkspace> | null>(null);
const isPending = ref(false);
const isError = ref(false);
const day = Date.UTC(2026, 8, 29);
const occurrence: TaskOccurrenceClientDTO = {
  id: 'occurrence' as TaskOccurrenceClientDTO['id'],
  planId: 'plan' as TaskOccurrenceClientDTO['planId'],
  identityId: 'owner' as TaskOccurrenceClientDTO['identityId'],
  occurrenceKey: 'plan:2026-09-29',
  scheduleSnapshot: {
    date: '2026-09-29' as TaskOccurrenceClientDTO['scheduleSnapshot']['date'],
    timing: { kind: 'At', time: '09:30' },
  },
  importanceSnapshot: 'Moderate',
  status: 'Pending',
  actualStartAt: null,
  result: null,
  checklistState: [
    {
      definitionId: 'step',
      titleSnapshot: 'Snapshot step',
      orderSnapshot: 0,
      completed: false,
      completedAt: null,
    },
  ],
  dueAt: day,
  isOverdue: false,
  version: 7,
  createdAt: day,
  updatedAt: day,
  deletedAt: null,
};
const shell = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('div', [slots.title?.(), slots.description?.(), slots.default?.(), slots.footer?.()]),
});
function render(overrides: Partial<TaskOccurrenceClientDTO> = {}) {
  return mount(TaskOccurrenceInspectDialog, {
    props: {
      modelValue: true,
      occurrence: { ...occurrence, ...overrides },
      planName: 'Morning review',
      busy: false,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: { task: enTask } } })],
      stubs: { Dialog: shell, ProductDialogShell: shell },
    },
  });
}
function button(wrapper: ReturnType<typeof render>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text)!;
}
beforeEach(() => {
  workspace.value = { goalContext: null };
  isPending.value = false;
  isError.value = false;
  context.read.mockReset().mockReturnValue({ workspace, query: { isPending, isError } });
});

describe('TaskOccurrenceInspectDialog', () => {
  it('renders snapshot facts and reads only the selected canonical workspace', () => {
    const wrapper = render({ actualStartAt: day });
    expect(wrapper.text()).toContain('Morning review');
    expect(wrapper.text()).toContain('Pending');
    expect(wrapper.text()).toContain('09:30');
    expect(wrapper.text()).toContain('Actual start');
    expect(wrapper.text()).toContain('Snapshot step');
    expect(toValue(context.read.mock.calls[0][0])).toBe('plan');
    expect(context.read.mock.calls[0][1]).toEqual({ recentLimit: 1 });
  });

  it.each(['Pending', 'InProgress', 'Missed', 'Skipped'] as const)(
    'allows Complete correction for %s, with Missed/Skip only while open',
    async (status) => {
      const wrapper = render({ status });
      await button(wrapper, enTask.action.complete).trigger('click');
      expect(wrapper.emitted('complete')).toEqual([['occurrence']]);
      const open = status === 'Pending' || status === 'InProgress';
      expect(Boolean(button(wrapper, enTask.occurrence.markMissed))).toBe(open);
      expect(Boolean(button(wrapper, enTask.action.skip))).toBe(open);
      if (open) {
        await button(wrapper, enTask.occurrence.markMissed).trigger('click');
        await button(wrapper, enTask.action.skip).trigger('click');
        expect(wrapper.emitted('missed')).toEqual([['occurrence']]);
        expect(wrapper.emitted('skip')).toEqual([['occurrence']]);
      }
    },
  );

  it('renders Completed result and reacts to correction without closing; checklist uses latest version', async () => {
    const wrapper = render();
    await wrapper.setProps({
      occurrence: {
        ...occurrence,
        status: 'Completed',
        version: 8,
        result: {
          kind: 'Completed',
          recordedAt: day,
          actualDurationMinutes: 25,
          rating: 4,
          note: 'Recorded evidence',
        },
      },
    });
    expect(wrapper.text()).toContain('25 min');
    expect(wrapper.text()).toContain('Rating');
    expect(wrapper.text()).toContain('Recorded evidence');
    expect(button(wrapper, enTask.action.complete)).toBeUndefined();
    await button(wrapper, enTask.action.undoComplete).trigger('click');
    expect(wrapper.emitted('uncomplete')).toEqual([['occurrence']]);
    await wrapper.get('[role="checkbox"]').trigger('click');
    expect(wrapper.emitted('checklist-change')).toEqual([['occurrence', 'step', true, 8]]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.setProps({ occurrence });
    expect(wrapper.text()).not.toContain('Recorded evidence');
    expect(button(wrapper, enTask.action.complete)).toBeTruthy();
  });

  it.each(['Missed', 'Skipped'] as const)('renders %s recorded time and reason', (status) => {
    const wrapper = render({
      status,
      result: { kind: status, recordedAt: day, reason: 'Travel delay' },
    });
    expect(wrapper.text()).toContain('Recorded');
    expect(wrapper.text()).toContain('Travel delay');
    expect(wrapper.text()).not.toContain('Rating');
  });

  it('renders readable Goal and KR and safe missing KR copy', async () => {
    workspace.value = {
      goalContext: {
        availability: 'Available',
        goalId: 'secret-goal',
        keyResultId: 'secret-kr',
        goal: { name: 'Learn deeply' },
        keyResult: { title: 'Practice weekly' },
      } as TaskPlanWorkspace['goalContext'],
    };
    const wrapper = render();
    expect(wrapper.text()).toContain('Learn deeply');
    expect(wrapper.text()).toContain('Practice weekly');
    expect(wrapper.text()).not.toContain('secret-');
    workspace.value = { goalContext: { ...workspace.value.goalContext!, keyResult: null } };
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain(enTask.inspect.krMissing);
  });

  it.each(['Missing', 'Unavailable'] as const)('bounds %s context without IDs', (availability) => {
    workspace.value = {
      goalContext: {
        availability,
        goalId: 'secret-goal',
        keyResultId: 'secret-kr',
        goal: null,
        keyResult: null,
      } as TaskPlanWorkspace['goalContext'],
    };
    const wrapper = render();
    expect(wrapper.text()).toContain(enTask.detail[`goalContext${availability}`]);
    expect(wrapper.text()).not.toContain('secret-');
  });

  it('bounds loading, errors and absent context while preserving actions', async () => {
    isPending.value = true;
    const wrapper = render();
    expect(wrapper.text()).toContain(enTask.inspect.contextLoading);
    isPending.value = false;
    isError.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain(enTask.detail.goalContextUnavailable);
    isError.value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain(enTask.detail.goalBindingNone);
    await wrapper.get('[data-testid="task-inspect-view-plan"]').trigger('click');
    expect(wrapper.emitted('view-plan')).toEqual([['plan']]);
    await wrapper.setProps({ modelValue: false });
    expect(toValue(context.read.mock.calls[0][0])).toBeNull();
  });

  it('disables all mutation controls while busy, including terminal checklist correction', async () => {
    const wrapper = render({ status: 'Completed' });
    await wrapper.setProps({ busy: true });
    expect(wrapper.get('[role="checkbox"]').attributes('disabled')).toBeDefined();
    expect(button(wrapper, enTask.action.undoComplete).attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('[data-testid="task-inspect-view-plan"]').attributes('disabled'),
    ).toBeUndefined();
  });
});
