import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { instance, template } from '../components/task-quick-test-fixtures';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskCompletionMeasurementDialog from '../components/dialogs/TaskCompletionMeasurementDialog.vue';
import { ProductMoreProperties } from '../../../shared/components';
import TaskDetailView from './TaskDetailView.vue';
import enTask from '../../../locales/en-US/task';
import zhTask from '../../../locales/zh-CN/task';

const actions = vi.hoisted(() => ({
  completeOccurrence: vi.fn(),
  uncompleteOccurrence: vi.fn(),
  markOccurrenceMissed: vi.fn(),
  skipOccurrence: vi.fn(),
  setOccurrenceChecklistItem: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
const detailWorkspace = ref({ plan: template, recentOccurrences: [instance()], linkedNotes: [] });
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'plan-1' } }),
  useRouter: () => ({ push: actions.push }),
}));
vi.mock('../composables/useTaskOccurrences', () => ({ useTaskOccurrences: () => actions }));
vi.mock('../composables/useTaskPlanWorkspaceQuery', () => ({
  useTaskPlanWorkspaceQuery: () => ({
    workspace: detailWorkspace,
    query: { isPending: ref(false), isError: ref(false) },
    refetch: actions.refresh,
  }),
}));
vi.mock('../composables/useTaskPlanMutations', () => ({
  useTaskPlanMutations: () => ({ isSaving: ref(false) }),
}));
vi.mock('../composables/useTaskGoalBindingOptions', () => ({
  useTaskGoalBindingOptions: () => ({
    goals: ref([]),
    keyResultsByGoal: ref({}),
    loadingGoals: ref(false),
    loadingKeyResults: ref<Record<string, boolean>>({}),
    keyResultErrorsByGoal: ref({}),
    loadGoals: vi.fn(),
    loadGoalBinding: vi.fn(),
    loadKeyResults: vi.fn(),
  }),
}));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({ options: ref([]), isLoading: ref(false), createLabel: vi.fn() }),
}));

const source = readFileSync(resolve(__dirname, 'TaskDetailView.vue'), 'utf8');

describe('TaskDetailView occurrence correction and plan settings', () => {
  it('is the canonical inline Task editor instead of reopening the plan dialog', () => {
    expect(source).toContain('data-testid="task-plan-workspace"');
    expect(source).toContain('data-testid="task-detail-title"');
    expect(source).toContain('data-testid="task-plan-workspace-properties"');
    expect(source).toContain('data-testid="task-detail-metadata"');
    expect(source).toContain('data-testid="task-properties-row"');
    expect(source).toContain('test-id="task-properties-more"');
    expect(source).toContain('v-if="viewModel.goalBinding || showGoalEditor"');
    expect(source).toContain('v-if="labelIds.length || showLabelsEditor"');
    expect(source).toContain('v-if="reminderTriggers.length || showReminderEditor"');
    expect(source).toContain('data-testid="task-goal-row"');
    expect(source).toContain('data-testid="task-labels-row"');
    expect(source).toContain('data-testid="task-reminders-row"');
    expect(source).toContain('data-testid="task-detail-description"');
    expect(source).toContain('task-detail-schedule-chip');
    expect(source).toContain('task-detail-recurrence-chip');
    expect(source).toContain('task-detail-goal-chip');
    expect(source).toContain('task-detail-reminder-chip');
    expect(source).toContain('task-detail-importance-chip');
    expect(source).toContain('<LabelCommandPanel');
    expect(source).toContain('reminderTriggerLabel');
    expect(source).toContain('formatTaskReminderAbsoluteTime');
    expect(source).toContain('hasMorePropertiesMenuItems');
    expect(source).toContain('<DropdownMenuSub');
    expect(source).toContain('<DropdownMenuCheckboxItem');
    expect(source).toContain('<TaskReminderMenuItems');
    expect(source).toContain('quickBindGoal');
    expect(source).toContain('toggleLabelSelection');
    expect(source).toContain('openGoalEditor');
    expect(source).toContain('openLabelsEditor');
    expect(source).toContain('openReminderEditor');
    expect(source).toContain('openCustomReminderPicker');
    expect(source).toContain('<ProductDateTimePicker');
    expect(source).not.toContain('<LabelPicker');
    expect(source).not.toContain('data-testid="task-detail-goal-context"');
    expect(source).toContain('<ChecklistSection');
    expect(source).toContain('saveInlinePlan');
    expect(source).toContain('const req: UpdateTaskPlanReq = {}');
    expect(source).not.toContain('name: vm.title');
    expect(source).not.toContain('description: vm.description');
    expect(source).not.toContain('<TaskPlanDialog');
    expect(source).not.toContain('saveEdit');
    expect(source).not.toContain('openEdit');
  });

  it('shows workspace occurrences and correction commands without inventing bounded positions', () => {
    expect(source).toContain('data-testid="task-detail-occurrences"');
    expect(source).toContain('<TaskOccurrenceRow');
    expect(source).toContain('executionSummary');
    expect(source).toContain('linkedNotes');
    expect(source).not.toContain('fetchInstances({ page: 1, limit: 500 })');
    expect(source).not.toContain('getTaskOccurrencePosition');
    for (const operation of [
      'completeOccurrence',
      'uncompleteOccurrence',
      'markOccurrenceMissed',
      'skipOccurrence',
      'setOccurrenceChecklistItem',
    ]) {
      expect(source).toContain(operation);
    }
    expect(source).toContain('refetchWorkspace');
  });

  it('uses the canonical coordinator with the existing operations instance', () => {
    expect(source).toContain('useTaskOccurrenceActionCoordinator({');
    expect(source).toContain('operations: occurrenceOperations');
    expect(source).toContain('resolveGoalBinding: () => currentTemplate.value?.goalBinding');
    expect(source).toContain('<TaskCompletionMeasurementDialog :coordinator="actionCoordinator"');
    for (const action of [
      'requestComplete',
      'requestUncomplete',
      'requestMissed',
      'requestSkip',
      'requestChecklistChange',
    ])
      expect(source).toContain(action);
    expect(source).not.toContain('runOccurrenceAction');
    expect(source).toContain('afterSuccess: () => refetchWorkspace()');
  });

  it('does not resurrect dependency or graph state', () => {
    for (const retired of ['TaskDependency', 'CriticalPath', 'parentTaskId', 'dependencyStatus']) {
      expect(source).not.toContain(retired);
    }
  });
});

describe('Task Detail runtime completion parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.completeOccurrence.mockResolvedValue(instance({ status: 'Completed' }));
  });
  it.each(['Prompt', 'Fixed', 'LinkOnly'] as const)(
    'routes %s from the current workspace Plan',
    async (mode) => {
      detailWorkspace.value = {
        plan: {
          ...template,
          goalBinding: {
            goalId: 'goal' as never,
            keyResultId: 'kr' as never,
            contribution: mode === 'Fixed' ? { trigger: 'EachCompletion', value: 5 } : null,
            progressRule:
              mode === 'LinkOnly'
                ? null
                : mode === 'Fixed'
                  ? { mode, trigger: 'EachCompletion', value: 5 }
                  : { mode, trigger: 'EachCompletion', suggestedValue: -2 },
          },
        },
        recentOccurrences: [instance()],
        linkedNotes: [],
      };
      const w = shallowMount(TaskDetailView, {
        global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: {} })] },
      });
      w.getComponent(TaskOccurrenceRow).vm.$emit('complete', 'occurrence-1');
      await flushPromises();
      const coordinator = w.getComponent(TaskCompletionMeasurementDialog).props('coordinator');
      if (mode === 'Prompt') {
        expect(actions.completeOccurrence).not.toHaveBeenCalled();
        expect(coordinator.pendingMeasurement.value).toEqual({
          occurrenceId: 'occurrence-1',
          goalId: 'goal',
          keyResultId: 'kr',
          suggestedValue: -2,
        });
        await coordinator.submitMeasurement(0, 'actual');
        expect(actions.completeOccurrence).toHaveBeenCalledExactlyOnceWith('occurrence-1', {
          goalMeasurement: { value: 0, note: 'actual' },
        });
        expect(coordinator.pendingMeasurement.value).toBeNull();
      } else expect(actions.completeOccurrence).toHaveBeenCalledExactlyOnceWith('occurrence-1');
      expect(actions.refresh).toHaveBeenCalledOnce();
      w.unmount();
    },
  );
});

describe('Task Detail optional property grammar', () => {
  function mountDetail() {
    return shallowMount(TaskDetailView, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: {} })],
        renderStubDefaultSlot: true,
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    detailWorkspace.value = {
      plan: { ...template },
      recentOccurrences: [instance()],
      linkedNotes: [],
    };
  });

  it('keeps empty optional rows hidden and More discoverable', () => {
    const wrapper = mountDetail();
    for (const row of ['goal', 'labels', 'reminders']) {
      expect(wrapper.find(`[data-testid="task-${row}-row"]`).exists()).toBe(false);
    }
    const moreProperties = wrapper.getComponent(ProductMoreProperties);
    expect(moreProperties.props('testId')).toBe('task-properties-more');
    wrapper.unmount();
  });

  it('puts values on edit chips and keeps owner routing separate', async () => {
    detailWorkspace.value.plan = {
      ...template,
      labels: [{ id: 'label-1', name: 'Focus', color: '#5588aa' }] as typeof template.labels,
      goalBinding: {
        goalId: 'goal' as never,
        keyResultId: null,
        contribution: null,
        progressRule: null,
      },
      reminderConfig: {
        enabled: true,
        triggers: [
          { type: 'Relative', relativeValue: 15, relativeUnit: 'Minutes', absoluteTime: null },
        ],
      },
    };
    Object.assign(detailWorkspace.value, {
      goalContext: {
        availability: 'Available',
        goalId: 'goal',
        goal: { name: 'Owner Goal' },
        keyResult: null,
      },
    });
    const wrapper = mountDetail();
    expect(wrapper.get('[data-testid="task-detail-labels-chip"]').text()).toBe('Focus');
    expect(wrapper.get('[data-testid="task-detail-reminder-chip"]').text()).toContain(
      'task.detail.reminderRelative',
    );
    expect(wrapper.get('[data-testid="task-detail-goal-chip"]').text()).toBe(
      'task.detail.editGoalBinding',
    );
    await wrapper.get('[data-testid="task-detail-goal-chip"]').trigger('click');
    expect(actions.push).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="task-goal-owner-navigation"]').trigger('click');
    expect(actions.push).toHaveBeenCalledExactlyOnceWith({
      name: 'goal-detail',
      params: { id: 'goal' },
    });
    wrapper.unmount();
  });
});

describe('Task Detail bounded recent activity copy', () => {
  it.each([
    ['en-US', enTask, 'Recent activity', 'not the full history'],
    ['zh-CN', zhTask, '最近执行', '并非完整历史'],
  ] as const)(
    'labels the recent workspace slice truthfully in %s',
    (locale, task, heading, limitCopy) => {
      detailWorkspace.value = {
        plan: { ...template, occurrenceCount: 10000 },
        recentOccurrences: Array.from({ length: 5 }, (_, index) =>
          instance({ id: `recent-${index}` as ReturnType<typeof instance>['id'] }),
        ),
        linkedNotes: [],
      };
      const wrapper = shallowMount(TaskDetailView, {
        global: {
          plugins: [createI18n({ legacy: false, locale, messages: { [locale]: { task } } })],
          renderStubDefaultSlot: true,
        },
      });
      const recent = wrapper.get('[data-testid="task-detail-occurrences"]');
      expect(recent.get('h2').text()).toBe(heading);
      expect(recent.get('p').text()).toBe(task.detail.occurrencesDescription);
      expect(recent.get('p').text()).toContain(limitCopy);
      expect(wrapper.findAllComponents(TaskOccurrenceRow)).toHaveLength(5);
      wrapper.unmount();
    },
  );
});
