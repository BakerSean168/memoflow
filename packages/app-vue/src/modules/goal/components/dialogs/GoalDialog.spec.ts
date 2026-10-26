/** @vitest-environment happy-dom */

import type { WorkspaceEventStreamOptions } from '@memoflow/ai/client';
import type { AIWorkflowRunView, WorkspaceEvent } from '@memoflow/contracts/ai';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '../../../../locales/production-messages';
import {
  createMockGoal,
  createMockKeyResult,
} from '@memoflow/goal-contracts/test-support/goal.mock';
import {
  CreateGoalSchema,
  GoalDraftCheckpointContentSchema,
  type GoalDraftCheckpointSnapshot,
  GoalStatus,
  KeyResultCalculationMethod,
  ReminderTriggerType,
  type GoalReminderConfigDTO,
} from '@memoflow/goal-contracts';
import { Dialog } from '@memoflow/ui-vue-shadcn';
import { LabelPicker } from '../../../../shared/components';
import GoalReminderChip from '../GoalReminderChip.vue';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';
import GoalStatusPicker from '../GoalStatusPicker.vue';
import GoalDialog from './GoalDialog.vue';
import type { GoalNativeEditSession } from '../../composables/goalNativeEditSession';
import {
  GOAL_DRAFT_CHECKPOINT_KEY,
  GOAL_SERVICE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
} from '../../../../di/keys';
import {
  GoalDraftCheckpointConflict,
  type GoalDraftCheckpointStore,
} from '../../infrastructure/goal-draft-checkpoint.indexeddb';

const mocks = vi.hoisted(() => ({
  validationRejected: false,
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  transitionGoalStatus: vi.fn(async (goal) => goal),
  createLabel: vi.fn(),
  resolveNames: vi.fn(),
}));

vi.mock('../../composables/useGoal', async () => {
  const { ref } = await import('vue');
  return {
    useGoal: () => ({
      createGoal: mocks.createGoal,
      updateGoal: mocks.updateGoal,
      transitionGoalStatus: mocks.transitionGoalStatus,
      isSaving: ref(false),
      lastCreateRejected: {
        get value() {
          return mocks.validationRejected;
        },
      },
    }),
  };
});

vi.mock('../../../../shared/composables/useLabelCatalog', async () => {
  const { ref } = await import('vue');
  return {
    useLabelCatalog: () => ({
      options: ref([
        { id: 'label-existing', name: 'Existing', color: null },
        { id: 'label-work', name: 'Work', color: '#3366ff' },
      ]),
      isLoading: ref(false),
      createLabel: mocks.createLabel,
      resolveNames: mocks.resolveNames,
    }),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: productionLocaleMessages,
});

it('restores the same native manual draft and submits its durable create ID without workflow callbacks', async () => {
  const initial = GoalDraftCheckpointContentSchema.parse({
    createId: crypto.randomUUID(),
    workflowRunId: null,
    phase: 'editing',
    draft: {
      name: 'Preserved draft',
      summary: '',
      description: 'Human content',
      status: GoalStatus.Planned,
      start: null,
      target: null,
      reminderConfig: null,
      labelIds: [],
      keyResults: [],
    },
  });
  let current: GoalDraftCheckpointSnapshot = { scope: 'identity', version: 1, content: initial };
  const store: GoalDraftCheckpointStore = {
    scope: () => 'identity',
    load: vi.fn(async () => current),
    write: vi.fn(async (scope, version, content) => {
      if (version !== current.version) throw new GoalDraftCheckpointConflict(current);
      current = { scope, version: version + 1, content };
      return current;
    }),
  };
  const created = createMockGoal({ id: initial.createId, name: 'Edited draft' });
  mocks.createGoal.mockResolvedValue(created);
  const wrapper = mount(GoalDialog, {
    props: { open: true, presentation: 'panel' },
    attachTo: document.body,
    global: { plugins: [i18n], provide: { [GOAL_DRAFT_CHECKPOINT_KEY]: store } },
  });
  try {
    await flushPromises();
    expect(dom('goal-name-input').element).toHaveProperty('value', 'Preserved draft');
    await dom('goal-name-input').setValue('Edited draft');
    await flushPromises();
    await dom('save-goal-button').trigger('click');
    await flushPromises();
    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: initial.createId,
        name: 'Edited draft',
        description: 'Human content',
      }),
    );
    expect(mocks.createGoal.mock.calls.at(-1)![0]).not.toHaveProperty('nativeAiLease');
    expect(current.content).toBeNull();
    expect(wrapper.emitted('created')?.at(-1)?.[0]).toMatchObject({ id: initial.createId });
  } finally {
    wrapper.unmount();
    vi.clearAllMocks();
  }
});

it('keeps a rejected manual save editable while retaining the same durable create ID', async () => {
  let current: GoalDraftCheckpointSnapshot = { scope: 'identity', version: 0, content: null };
  const store: GoalDraftCheckpointStore = {
    scope: () => 'identity',
    load: async () => current,
    write: async (scope, version, content) => {
      if (version !== current.version) throw new GoalDraftCheckpointConflict(current);
      current = { scope, version: version + 1, content };
      return current;
    },
  };
  mocks.validationRejected = true;
  mocks.createGoal.mockResolvedValue(null);
  const wrapper = mount(GoalDialog, {
    props: { open: true, presentation: 'panel' },
    attachTo: document.body,
    global: { plugins: [i18n], provide: { [GOAL_DRAFT_CHECKPOINT_KEY]: store } },
  });
  try {
    await flushPromises();
    await dom('goal-name-input').setValue('Fixable goal');
    await flushPromises();
    const intent = current.content!.createId;
    await dom('save-goal-button').trigger('click');
    await flushPromises();
    expect(current.content).toMatchObject({
      createId: intent,
      phase: 'editing',
      draft: { name: 'Fixable goal' },
    });
    expect(dom('goal-name-input').attributes('disabled')).toBeUndefined();
    await dom('goal-name-input').setValue('Corrected goal');
    await flushPromises();
    expect(current.content?.createId).toBe(intent);
    expect(wrapper.emitted('created')).toBeUndefined();
  } finally {
    wrapper.unmount();
    mocks.validationRejected = false;
    vi.clearAllMocks();
  }
});

it('reconciles a committed workflow receipt by its string Goal ID without creating again', async () => {
  const created = createMockGoal({ name: 'Recovered Goal' });
  const runId = 'run-committed-goal';
  let current: GoalDraftCheckpointSnapshot = {
    scope: 'identity',
    version: 1,
    content: GoalDraftCheckpointContentSchema.parse({
      createId: created.id,
      workflowRunId: runId,
      phase: 'editing',
      draft: {
        name: created.name,
        summary: '',
        description: '',
        status: GoalStatus.Planned,
        start: null,
        target: null,
        reminderConfig: null,
        labelIds: [],
        keyResults: [],
      },
    }),
  };
  const store: GoalDraftCheckpointStore = {
    scope: () => 'identity',
    load: vi.fn(async () => current),
    write: vi.fn(async (scope, version, content) => {
      if (version !== current.version) throw new GoalDraftCheckpointConflict(current);
      current = { scope, version: version + 1, content };
      return current;
    }),
  };
  const getGoal = vi.fn(async () => ({ ok: true as const, data: { toDTO: () => created } }));
  const getRun = vi.fn(async () => ({
    kind: 'goal.create',
    runId,
    status: 'completed',
    result: { referenceMap: { goal: created.id } },
  }));
  const wrapper = mount(GoalDialog, {
    props: { open: true, presentation: 'panel' },
    attachTo: document.body,
    global: {
      plugins: [i18n],
      provide: {
        [GOAL_DRAFT_CHECKPOINT_KEY]: store,
        [GOAL_SERVICE_KEY]: { getGoal },
        [AI_WORKFLOW_RUNTIME_KEY]: { get: getRun },
      },
    },
  });
  try {
    await vi.waitFor(() => expect(getGoal).toHaveBeenCalledWith(created.id));
    await flushPromises();
    expect(getRun).toHaveBeenCalledWith({ runId });
    expect(current.content).toBeNull();
    expect(wrapper.emitted('created')?.at(-1)?.[0]).toMatchObject({ id: created.id });
    expect(mocks.createGoal).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
    vi.clearAllMocks();
  }
});

describe('restored transient BYOA ownership', () => {
  it.each(['editing', 'pending-missing', 'pending-found', 'pending-offline'] as const)(
    'reconciles %s without querying a transient local run as a Mastra workflow',
    async (scenario) => {
      const record = GoalDraftCheckpointContentSchema.parse({
        createId: crypto.randomUUID(),
        workflowRunId: 'local-agent:conversation:terminated-run',
        phase: scenario === 'editing' ? 'editing' : 'submit_pending',
        draft: {
          name: 'Recovered BYOA draft',
          summary: '',
          description: '',
          status: GoalStatus.Planned,
          start: null,
          target: null,
          reminderConfig: null,
          labelIds: [],
          keyResults: [],
        },
      });
      let current: GoalDraftCheckpointSnapshot = { scope: 'identity', version: 1, content: record };
      const store: GoalDraftCheckpointStore = {
        scope: () => 'identity',
        load: async () => current,
        write: async (scope, version, content) => {
          if (version !== current.version) throw new GoalDraftCheckpointConflict(current);
          current = { scope, version: version + 1, content };
          return current;
        },
      };
      const saved = createMockGoal({ id: record.createId, name: record.draft.name });
      const getGoal = vi.fn(async () =>
        scenario === 'pending-found'
          ? { ok: true, data: { toDTO: () => saved } }
          : {
              ok: false,
              error: { code: scenario === 'pending-offline' ? 'UNAVAILABLE' : 'NOT_FOUND' },
            },
      );
      const get = vi.fn(async () => {
        throw new Error('No durable workflow exists for a transient BYOA run');
      });
      const wrapper = mount(GoalDialog, {
        props: { open: true, presentation: 'panel' },
        attachTo: document.body,
        global: {
          plugins: [i18n],
          provide: {
            [GOAL_DRAFT_CHECKPOINT_KEY]: store,
            [GOAL_SERVICE_KEY]: { getGoal },
            [AI_WORKFLOW_RUNTIME_KEY]: { get, streamWorkspaceEvents: () => Promise.resolve() },
          },
        },
      });
      try {
        await flushPromises();
        expect(get).not.toHaveBeenCalled();
        expect(mocks.createGoal).not.toHaveBeenCalled();
        if (scenario === 'pending-found') {
          expect(current.content).toBeNull();
          expect(wrapper.emitted('created')?.at(-1)?.[0]).toMatchObject({ id: record.createId });
        } else {
          expect(current.content?.createId).toBe(record.createId);
          expect(current.content?.draft.name).toBe(record.draft.name);
          expect(current.content?.phase).toBe(record.phase);
          expect(current.content?.workflowRunId).toBe(
            scenario === 'pending-offline' ? record.workflowRunId : null,
          );
          if (scenario === 'editing')
            expect(dom('goal-name-input').attributes('disabled')).toBeUndefined();
          else expect(dom('goal-name-input').attributes('disabled')).toBeDefined();
        }
      } finally {
        wrapper.unmount();
        vi.clearAllMocks();
      }
    },
  );
});

describe('restored workflow checkpoint calibration', () => {
  it.each(['workflow.updated', 'stream.ready', 'stream.reset_required'] as const)(
    'reconciles %s after an older running snapshot without freezing the draft',
    async (type) => {
      const f = restoredCheckpointFixture();
      try {
        await vi.waitFor(() => expect(f.resolveInitial).toBeDefined());
        const event: WorkspaceEvent =
          type === 'workflow.updated'
            ? {
                type,
                eventId: 'run:2',
                cursor: 'terminal',
                resourceVersion: 2,
                data: f.failed,
                actions: [],
                baseActionSequence: 0,
                lastActionSequence: 0,
              }
            : type === 'stream.ready'
              ? { type, cursor: 'ready' }
              : { type, cursor: 'reset', reason: 'expired' };
        const calibration = f.receive(event);
        f.resolveInitial!(f.running);
        await calibration;
        await flushPromises();
        expect(dom('goal-name-input').attributes('disabled')).toBeUndefined();
        expect(dom('goal-name-input').element).toHaveProperty('value', 'Human draft');
        expect(f.current().content?.workflowRunId).toBeNull();
        expect(mocks.createGoal).not.toHaveBeenCalled();
      } finally {
        f.wrapper.unmount();
        vi.clearAllMocks();
      }
    },
  );

  it('does not ACK a completed run before its Goal receipt is available', async () => {
    const created = createMockGoal({ name: 'Saved Goal' });
    const getGoal = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'NOT_FOUND' } })
      .mockResolvedValue({ ok: true, data: { toDTO: () => created } });
    const f = restoredCheckpointFixture(getGoal);
    try {
      await vi.waitFor(() => expect(f.resolveInitial).toBeDefined());
      f.resolveInitial!(f.running);
      await flushPromises();
      f.get.mockResolvedValue({
        ...f.running,
        status: 'completed',
        result: { referenceMap: { goal: created.id } },
      });
      await expect(f.receive({ type: 'stream.ready', cursor: 'missing-receipt' })).rejects.toThrow(
        'Goal receipt unavailable',
      );
      expect(f.current().content).not.toBeNull();
      await f.receive({ type: 'stream.ready', cursor: 'receipt-visible' });
      expect(f.current().content).toBeNull();
      expect(f.wrapper.emitted('created')?.at(-1)?.[0]).toMatchObject({ id: created.id });
      expect(mocks.createGoal).not.toHaveBeenCalled();
    } finally {
      f.wrapper.unmount();
      vi.clearAllMocks();
    }
  });

  it('rejects failed ready calibration and recovers on a subsequent ready', async () => {
    const f = restoredCheckpointFixture();
    try {
      await vi.waitFor(() => expect(f.resolveInitial).toBeDefined());
      f.resolveInitial!(f.running);
      await flushPromises();
      f.get.mockRejectedValueOnce(new Error('Workflow snapshot unavailable'));
      await expect(f.receive({ type: 'stream.ready', cursor: 'offline' })).rejects.toThrow(
        'Workflow snapshot unavailable',
      );
      expect(dom('goal-name-input').attributes('disabled')).toBeDefined();
      await f.receive({ type: 'stream.ready', cursor: 'recovered' });
      expect(f.current().content?.workflowRunId).toBeNull();
      expect(mocks.createGoal).not.toHaveBeenCalled();
    } finally {
      f.wrapper.unmount();
      vi.clearAllMocks();
    }
  });
});

function restoredCheckpointFixture(getGoal = vi.fn()) {
  const running: AIWorkflowRunView = {
    kind: 'goal.create',
    runId: 'restored-run',
    conversationId: 'conversation',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
  };
  const failed: AIWorkflowRunView = { ...running, status: 'failed', updatedAt: 2 };
  let current: GoalDraftCheckpointSnapshot = {
    scope: 'identity',
    version: 1,
    content: GoalDraftCheckpointContentSchema.parse({
      createId: crypto.randomUUID(),
      workflowRunId: running.runId,
      phase: 'editing',
      draft: {
        name: 'Human draft',
        summary: '',
        description: '',
        status: GoalStatus.Planned,
        start: null,
        target: null,
        reminderConfig: null,
        labelIds: [],
        keyResults: [],
      },
    }),
  };
  const store: GoalDraftCheckpointStore = {
    scope: () => 'identity',
    load: async () => current,
    write: async (scope, version, content) => {
      if (version !== current.version) throw new GoalDraftCheckpointConflict(current);
      current = { scope, version: version + 1, content };
      return current;
    },
  };
  let resolveInitial: ((run: AIWorkflowRunView) => void) | undefined;
  let receive!: WorkspaceEventStreamOptions['onEvent'];
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<AIWorkflowRunView>((resolve) => {
          resolveInitial = resolve;
        }),
    )
    .mockResolvedValue(failed);
  const wrapper = mount(GoalDialog, {
    props: { open: true, presentation: 'panel' },
    attachTo: document.body,
    global: {
      plugins: [i18n],
      provide: {
        [GOAL_DRAFT_CHECKPOINT_KEY]: store,
        [GOAL_SERVICE_KEY]: { getGoal },
        [AI_WORKFLOW_RUNTIME_KEY]: {
          get,
          streamWorkspaceEvents: (options: WorkspaceEventStreamOptions) => {
            receive = options.onEvent;
            return new Promise<void>((resolve) =>
              options.signal.addEventListener('abort', () => resolve(), { once: true }),
            );
          },
        },
      },
    },
  });
  return {
    wrapper,
    get,
    running,
    failed,
    current: () => current,
    get resolveInitial() {
      return resolveInitial;
    },
    receive: (event: WorkspaceEvent) => receive(event),
  };
}

function dom(testId: string): DOMWrapper<Element> {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing DOM element ${testId}`);
  return new DOMWrapper(element);
}

function timeframePicker(wrapper: ReturnType<typeof mount>, testId: string) {
  const picker = wrapper
    .findAllComponents(GoalTimeframePicker)
    .find((component) => component.props('testId') === testId);
  if (!picker) throw new Error(`Missing GoalTimeframePicker ${testId}`);
  return picker;
}

describe('GoalDialog vNext surface (GOAL-5101)', () => {
  it('keeps the draft and a readable inline failure when persistence throws', async () => {
    mocks.createGoal.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create', presentation: 'panel' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await dom('goal-name-input').setValue('Keep failed goal');
    await dom('save-goal-button').trigger('click');
    await flushPromises();
    expect(dom('goal-name-input').element).toHaveProperty('value', 'Keep failed goal');
    expect(dom('goal-submit-error').attributes('title')).toBeTruthy();
    expect(wrapper.emitted('created')).toBeUndefined();
    wrapper.unmount();
  });

  it('saves through the scoped owner capability once and rejects a concurrent save', async () => {
    const created = createMockGoal({ name: 'Scoped Goal' });
    let complete!: () => void;
    mocks.createGoal.mockReturnValue(
      new Promise((resolve) => {
        complete = () => resolve(created);
      }),
    );
    const wrapper = mount(GoalDialog, {
      props: { open: true, presentation: 'panel' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const ai = nativeSession(wrapper).claimControl('run-save');
    ai.patch({ name: 'Scoped Goal' });
    const context = {
      createId: created.id,
      nativeAiLease: {
        runId: 'run-save',
        token: '11111111-1111-4111-8111-111111111111',
        fence: 4,
      },
      keyResultIds: [],
      pendingLabelNames: [],
      expectedDraft: ai.readDraftState().draft,
    };
    const saving = ai.requestSubmit(context);
    expect(() => ai.detachWorkflow()).toThrow('busy');
    await expect(ai.requestSubmit(context)).rejects.toThrow('busy');
    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        nativeAiLease: context.nativeAiLease,
      }),
    );
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    complete();
    expect(await saving).toEqual(created);
    expect(() => ai.patch({ name: 'After save' })).toThrow('closed');
    wrapper.unmount();
  });

  it('renders the same native form in a pane-local modeless dialog', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, presentation: 'panel' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    expect(wrapper.find('[data-testid="goal-panel-form"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="goal-panel-form"]').attributes('aria-modal')).toBe('false');
    expect(wrapper.get('[data-testid="pane-scoped-dialog-backdrop"]').exists()).toBe(true);
    await dom('goal-name-input').setValue('Panel Goal');
    await dom('goal-form').trigger('submit');
    expect(mocks.createGoal).toHaveBeenCalledWith(expect.objectContaining({ name: 'Panel Goal' }));
    wrapper.unmount();
  });

  it('enforces exclusive control in owner commands and releases stale handles', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, presentation: 'panel' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const user = nativeSession(wrapper);
    const ai = user.claimControl('run-1');
    expect(() => user.patch({ name: 'User overwrite' })).toThrow();
    expect(() => user.claimControl('run-2')).toThrow();
    ai.patch({ name: 'AI Goal' });
    expect(() =>
      ai.patch({ name: 'Bad batch', target: { kind: 'day', date: '2026-02-30' } }),
    ).toThrow();
    expect(ai.readDraftState().draft.name).toBe('AI Goal');
    expect(() => ai.patch({ name: 'x'.repeat(81) })).toThrow();
    await nextTick();
    expect((dom('goal-name-input').element as HTMLTextAreaElement).value).toBe('AI Goal');
    await dom('goal-form').trigger('submit');
    expect(mocks.createGoal).not.toHaveBeenCalled();
    ai.releaseControl();
    user.patch({ name: 'Manual Goal' });
    expect(() => ai.patch({ name: 'Stale AI' })).toThrow();
    expect(user.readDraftState().draft.name).toBe('Manual Goal');
    wrapper.unmount();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    for (const mock of [
      mocks.createGoal,
      mocks.updateGoal,
      mocks.transitionGoalStatus,
      mocks.createLabel,
      mocks.resolveNames,
    ])
      mock.mockReset();
    mocks.validationRejected = false;
    mocks.transitionGoalStatus.mockImplementation(async (goal) => goal);
  });

  it('hides Reminder in create mode and submits a valid request without reminderConfig', async () => {
    mocks.createGoal.mockResolvedValue(createMockGoal({ name: 'New Goal' }));
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(wrapper.findComponent(GoalReminderChip).exists()).toBe(false);
    expect(document.querySelector('[data-testid="goal-reminder-chip"]')).toBeNull();
    expect(dom('goal-property-chips').text()).not.toContain('Reminder');

    await dom('goal-name-input').setValue('New Goal');
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.createGoal).toHaveBeenCalledOnce();
    const request = mocks.createGoal.mock.calls[0][0];
    expect(request).not.toHaveProperty('reminderConfig');
    expect(CreateGoalSchema.safeParse(request).success).toBe(true);
    expect(mocks.updateGoal).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('validates and persists semantic create reminders through the canonical create request', async () => {
    const created = createMockGoal({ name: 'New Goal', status: GoalStatus.Planned });
    mocks.createGoal.mockResolvedValue(created);
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    const reminderConfig: GoalReminderConfigDTO = {
      enabled: true,
      triggers: [{ type: ReminderTriggerType.RemainingDays, value: 1, enabled: true }],
    };
    session.patch({ name: 'New Goal', reminderConfig });
    await session.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(session.readDraftState().error).toBeTruthy();
    session.patch({ target: { kind: 'year', year: 2027 } });
    await session.requestSubmit();
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(mocks.createGoal.mock.calls[0][0].reminderConfig).toEqual(reminderConfig);
    expect(CreateGoalSchema.safeParse(mocks.createGoal.mock.calls[0][0]).success).toBe(true);
    expect(wrapper.emitted('created')?.at(-1)).toEqual([created]);
    expect(wrapper.findComponent(GoalReminderChip).exists()).toBe(false);
    wrapper.unmount();
  });

  it.each(['preserve', 'add', 'change', 'remove'] as const)(
    'keeps the edit reminder chip available to %s a reminder',
    async (action) => {
      const reminderConfig: GoalReminderConfigDTO = {
        enabled: true,
        triggers: [{ type: ReminderTriggerType.RemainingDays, value: 1, enabled: true }],
      };
      const goal = createMockGoal({
        name: 'Existing Goal',
        start: null,
        target: { kind: 'quarter', year: 2027, quarter: 4 },
        reminderConfig: action === 'add' ? null : reminderConfig,
      });
      mocks.updateGoal.mockResolvedValue(goal);
      const wrapper = mount(GoalDialog, {
        props: { open: true, mode: 'edit', goal },
        attachTo: document.body,
        global: { plugins: [i18n] },
      });
      await nextTick();

      const chip = wrapper.getComponent(GoalReminderChip);
      expect(dom('goal-reminder-chip').isVisible()).toBe(true);
      expect(chip.props('modelValue')).toEqual(goal.reminderConfig);
      const expectedConfig =
        action === 'remove'
          ? null
          : {
              ...reminderConfig,
              triggers: [{ ...reminderConfig.triggers[0], value: action === 'change' ? 3 : 1 }],
            };
      if (action !== 'preserve') chip.vm.$emit('update:modelValue', expectedConfig);
      await nextTick();
      await dom('save-goal-button').trigger('click');
      await flushPromises();

      expect(mocks.updateGoal).toHaveBeenCalledOnce();
      expect(mocks.updateGoal).toHaveBeenCalledWith(
        String(goal.id),
        expect.objectContaining({
          expectedVersion: goal.version,
          reminderConfig: expectedConfig,
        }),
      );
      expect(goal.reminderConfig).toEqual(action === 'add' ? null : reminderConfig);
      expect(mocks.createGoal).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it.each([
    { type: ReminderTriggerType.RemainingDays, missing: 'target' },
    { type: ReminderTriggerType.TimeProgressPercentage, missing: 'start' },
    { type: ReminderTriggerType.TimeProgressPercentage, missing: 'target' },
  ] as const)('blocks edit with $type reminders missing $missing', async ({ type, missing }) => {
    const goal = createMockGoal({
      name: 'Existing Goal',
      start: missing === 'start' ? null : { kind: 'quarter', year: 2027, quarter: 1 },
      target: missing === 'target' ? null : { kind: 'quarter', year: 2027, quarter: 4 },
      reminderConfig: { enabled: true, triggers: [{ type, value: 1, enabled: true }] },
    });
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.updateGoal).not.toHaveBeenCalled();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      type === ReminderTriggerType.RemainingDays
        ? 'Remaining-days reminders require a target date.'
        : 'Time-progress reminders require both a start date and a target date.',
    );
    wrapper.unmount();
  });

  it.each(['switch while open', 'reopen'] as const)(
    'resets edit state when entering create via %s, even if the previous Goal prop remains',
    async (transition) => {
      const reminderConfig: GoalReminderConfigDTO = {
        enabled: true,
        triggers: [{ type: ReminderTriggerType.RemainingDays, value: 1, enabled: true }],
      };
      const goal = createMockGoal({
        name: 'Existing Goal',
        summary: 'Existing summary',
        description: 'Existing description',
        status: GoalStatus.InProgress,
        start: null,
        target: { kind: 'quarter', year: 2027, quarter: 4 },
        reminderConfig,
        labels: [{ id: 'label-existing', name: 'Existing', color: null }],
        keyResults: [createMockKeyResult({ title: 'Existing KR' })],
      });
      const created = createMockGoal({ name: 'Fresh Goal', status: GoalStatus.Planned });
      mocks.createGoal.mockResolvedValue(created);
      const wrapper = mount(GoalDialog, {
        props: { open: true, mode: 'edit', goal },
        attachTo: document.body,
        global: { plugins: [i18n] },
      });
      await nextTick();
      wrapper.getComponent(GoalReminderChip).vm.$emit('update:modelValue', {
        enabled: true,
        triggers: [{ type: ReminderTriggerType.TimeProgressPercentage, value: 50, enabled: true }],
      });
      await nextTick();
      await dom('save-goal-button').trigger('click');
      expect(document.body.textContent).toContain(
        'Time-progress reminders require both a start date and a target date.',
      );
      await dom('goal-key-result-draft-row').find('button').trigger('click');
      await dom('draft-kr-title-input').setValue('Unsaved edit KR');

      if (transition === 'reopen') await wrapper.setProps({ open: false });
      await wrapper.setProps({ mode: 'create' });
      if (transition === 'reopen') await wrapper.setProps({ open: true });
      await flushPromises();

      expect(nativeSession(wrapper).readDraftState().goalId).toBeNull();
      expect(wrapper.findComponent(GoalReminderChip).exists()).toBe(false);
      expect((dom('goal-name-input').element as HTMLTextAreaElement).value).toBe('');
      expect((dom('goal-summary-input').element as HTMLTextAreaElement).value).toBe('');
      expect((dom('goal-description-input').element as HTMLTextAreaElement).value).toBe('');
      expect(wrapper.getComponent(GoalStatusPicker).props('baseStatus')).toBe(GoalStatus.Planned);
      expect(wrapper.getComponent(GoalStatusPicker).props('modelValue')).toBe(GoalStatus.Planned);
      expect(timeframePicker(wrapper, 'goal-start-chip').props('modelValue')).toBeNull();
      expect(timeframePicker(wrapper, 'goal-target-chip').props('modelValue')).toBeNull();
      expect(wrapper.getComponent(LabelPicker).props('modelValue')).toEqual([]);
      expect(document.querySelector('[data-testid="goal-key-result-draft-row"]')).toBeNull();
      expect(document.querySelector('[data-testid="key-result-draft-form"]')).toBeNull();
      expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([false]);
      expect(document.body.textContent).not.toContain(
        'Time-progress reminders require both a start date and a target date.',
      );
      await dom('goal-name-input').setValue('Fresh Goal');
      await dom('save-goal-button').trigger('click');
      await flushPromises();

      expect(mocks.createGoal).toHaveBeenCalledOnce();
      expect(mocks.createGoal.mock.calls[0][0]).toEqual({
        name: 'Fresh Goal',
        summary: undefined,
        description: undefined,
        start: undefined,
        target: undefined,
        labelIds: [],
        initialKeyResults: [],
      });
      expect(CreateGoalSchema.safeParse(mocks.createGoal.mock.calls[0][0]).success).toBe(true);
      expect(mocks.transitionGoalStatus).toHaveBeenCalledWith(created, GoalStatus.Planned);
      expect(wrapper.emitted('created')?.at(-1)).toEqual([created]);
      expect(mocks.updateGoal).not.toHaveBeenCalled();

      await wrapper.setProps({ open: false });
      await wrapper.setProps({ open: true, mode: 'edit' });
      await flushPromises();
      expect(wrapper.getComponent(GoalReminderChip).props('modelValue')).toEqual(reminderConfig);
      expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([false]);
      wrapper.unmount();
    },
  );

  it('keeps Goal identity fields borderless, wrapping, and hard-truncated to product limits', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const name = dom('goal-name-input');
    expect(name.attributes('aria-describedby')).toBeUndefined();
    expect(name.element.nextElementSibling?.classList.contains('min-h-4')).toBe(true);
    await name.setValue('x'.repeat(81));
    await nextTick();
    expect((name.element as HTMLTextAreaElement).value).toHaveLength(80);
    expect(name.attributes('aria-describedby')).toBe('goal-name-limit-feedback');
    expect(name.attributes('aria-invalid')).toBe('true');
    expect(dom('goal-name-limit-error').attributes('role')).toBe('alert');
    expect(dom('goal-name-limit-error').classes()).toContain('truncate');

    const summary = dom('goal-summary-input');
    expect(summary.attributes('aria-describedby')).toBeUndefined();
    expect(summary.element.nextElementSibling?.classList.contains('min-h-4')).toBe(true);
    await summary.setValue('y'.repeat(256));
    await nextTick();
    expect((summary.element as HTMLTextAreaElement).value).toHaveLength(255);
    expect(summary.attributes('aria-describedby')).toBe('goal-summary-limit-feedback');
    expect(summary.attributes('aria-invalid')).toBe('true');
    expect(dom('goal-summary-limit-error').attributes('role')).toBe('alert');
    expect(summary.classes()).toContain('focus-visible:ring-2');

    const description = dom('goal-description-input');
    expect(description.attributes('aria-describedby')).toBeUndefined();
    expect(description.element.nextElementSibling?.classList.contains('min-h-4')).toBe(true);
    await description.setValue('z'.repeat(10001));
    await nextTick();
    expect((description.element as HTMLTextAreaElement).value).toHaveLength(10000);
    expect(description.attributes('aria-describedby')).toBe('goal-description-limit-feedback');
    expect(description.attributes('aria-invalid')).toBe('true');
    expect(dom('goal-description-limit-error').attributes('role')).toBe('alert');
    expect(description.classes()).toContain('focus-visible:ring-2');

    expect(name.classes()).toContain('resize-none');
    expect(name.classes()).toContain('border-0');
    expect(name.classes()).toContain('focus-visible:ring-2');
    wrapper.unmount();
  });

  it('edits an existing Goal key result through the same trajectory card instead of the retired KR form', async () => {
    const keyResult = createMockKeyResult({
      title: 'Reduce support backlog',
      description: 'Move the queue down without losing SLA quality.',
      progress: {
        aggregationMethod: 'Last',
        initialValue: 120,
        currentValue: 95,
        targetValue: 40,
        unit: 'tickets',
      },
      target: { kind: 'day', date: '2026-10-31' },
      weight: 4,
    });
    const goal = createMockGoal({
      name: 'Support quality',
      start: { kind: 'day', date: '2026-09-01' },
      target: { kind: 'day', date: '2026-12-31' },
      version: 6,
      keyResults: [keyResult],
    });
    mocks.updateGoal.mockResolvedValue(goal);

    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(document.querySelectorAll('[data-testid="goal-key-result-draft-row"]')).toHaveLength(1);
    await dom('goal-key-result-draft-row').find('button').trigger('click');
    await nextTick();

    expect(document.querySelector('[data-testid="kr-card-editor"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="kr-trajectory-editor"]')).not.toBeNull();
    expect((dom('draft-kr-initial-input').element as HTMLInputElement).value).toBe('120');
    expect((dom('draft-kr-current-input').element as HTMLInputElement).value).toBe('95');
    expect((dom('draft-kr-target-input').element as HTMLInputElement).value).toBe('40');
    expect((dom('draft-kr-unit-input').element as HTMLInputElement).value).toBe('tickets');

    await dom('draft-kr-current-input').setValue('80');
    await dom('save-key-result-draft').trigger('click');
    await nextTick();
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.updateGoal).toHaveBeenCalledWith(
      String(goal.id),
      expect.objectContaining({
        expectedVersion: 6,
        keyResults: [
          expect.objectContaining({
            id: keyResult.id,
            title: 'Reduce support backlog',
            initialValue: 120,
            currentValue: 80,
            targetValue: 40,
            unit: 'tickets',
            weight: 4,
          }),
        ],
      }),
    );
    wrapper.unmount();
  });

  it('preserves a broader target precision when edit does not change the precision picker', async () => {
    const goal = createMockGoal({
      name: 'Ship in Q4',
      summary: 'Preserve quarter precision',
      target: { kind: 'quarter', year: 2027, quarter: 4 },
      version: 7,
      keyResults: [],
    });
    mocks.updateGoal.mockResolvedValue(goal);

    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(document.body.textContent).toContain('2027 Q4');
    expect(timeframePicker(wrapper, 'goal-target-chip').props('modelValue')).toEqual({
      kind: 'quarter',
      year: 2027,
      quarter: 4,
    });

    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.updateGoal).toHaveBeenCalledOnce();
    expect(mocks.updateGoal).toHaveBeenCalledWith(
      String(goal.id),
      expect.objectContaining({
        expectedVersion: 7,
        target: { kind: 'quarter', year: 2027, quarter: 4 },
      }),
    );
    wrapper.unmount();
  });

  it('preserves a coarse semantic start when creating a Goal', async () => {
    mocks.createGoal.mockResolvedValue({ id: 'goal-created', name: 'Semantic start' });

    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await dom('goal-name-input').setValue('Semantic start');
    timeframePicker(wrapper, 'goal-start-chip').vm.$emit('update:modelValue', {
      kind: 'quarter',
      year: 2027,
      quarter: 2,
    });
    await nextTick();
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        start: { kind: 'quarter', year: 2027, quarter: 2 },
      }),
    );
    wrapper.unmount();
  });

  it('wires bidirectional planning bounds and refuses an invalid start-after-target window before submit', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    await dom('goal-name-input').setValue('Bounded planning window');

    timeframePicker(wrapper, 'goal-target-chip').vm.$emit('update:modelValue', {
      kind: 'day',
      date: '2026-09-30',
    });
    await nextTick();
    expect(timeframePicker(wrapper, 'goal-start-chip').props('maxStartBoundary')).toBe(
      '2026-09-30',
    );

    timeframePicker(wrapper, 'goal-start-chip').vm.$emit('update:modelValue', {
      kind: 'day',
      date: '2026-10-30',
    });
    await nextTick();
    expect(timeframePicker(wrapper, 'goal-target-chip').props('minEndBoundary')).toBe('2026-10-30');

    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'Start time cannot begin after the target timeframe ends.',
    );
    wrapper.unmount();
  });

  it('replaces a broader target when the precision picker emits a day target', async () => {
    const goal = createMockGoal({
      name: 'Ship in Q4',
      target: { kind: 'quarter', year: 2027, quarter: 4 },
      version: 8,
      keyResults: [],
    });
    mocks.updateGoal.mockResolvedValue(goal);

    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    timeframePicker(wrapper, 'goal-target-chip').vm.$emit('update:modelValue', {
      kind: 'day',
      date: '2027-11-15',
    });
    await nextTick();
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.updateGoal).toHaveBeenCalledOnce();
    expect(mocks.updateGoal).toHaveBeenCalledWith(
      String(goal.id),
      expect.objectContaining({
        expectedVersion: 8,
        target: { kind: 'day', date: '2027-11-15' },
      }),
    );
    wrapper.unmount();
  });

  it('persists an edited lifecycle status through legal domain transitions', async () => {
    const goal = createMockGoal({
      name: 'Status editable',
      status: GoalStatus.Planned,
      version: 9,
      keyResults: [],
    });
    const updated = createMockGoal({ ...goal, name: 'Status editable', version: 10 });
    const completed = createMockGoal({
      ...updated,
      status: GoalStatus.InProgress,
      version: 11,
    });
    mocks.updateGoal.mockResolvedValue(updated);
    mocks.transitionGoalStatus.mockResolvedValue(completed);

    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    wrapper.getComponent(GoalStatusPicker).vm.$emit('update:modelValue', GoalStatus.InProgress);
    await nextTick();
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.transitionGoalStatus).toHaveBeenCalledWith(updated, GoalStatus.InProgress);
    expect(wrapper.emitted('updated')?.at(-1)).toEqual([completed]);
    wrapper.unmount();
  });

  it('scrolls the dialog body to the bottom when the expanded KR form would be clipped', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const dialogBody = dom('product-dialog-body').element as HTMLElement;
    Object.defineProperty(dialogBody, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(dialogBody, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(dialogBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 100,
    });
    const scrollTo = vi.fn();
    Object.defineProperty(dialogBody, 'scrollTo', { configurable: true, value: scrollTo });

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    await dom('add-key-result-entry').trigger('click');
    await flushPromises();

    expect(scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: 'smooth',
    });

    rafSpy.mockRestore();
    wrapper.unmount();
  });

  it('does not move the dialog body when the expanded KR form already fits', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const dialogBody = dom('product-dialog-body').element as HTMLElement;
    Object.defineProperty(dialogBody, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(dialogBody, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(dialogBody, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    const scrollTo = vi.fn();
    Object.defineProperty(dialogBody, 'scrollTo', { configurable: true, value: scrollTo });

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    await dom('add-key-result-entry').trigger('click');
    await flushPromises();

    expect(scrollTo).not.toHaveBeenCalled();

    rafSpy.mockRestore();
    wrapper.unmount();
  });

  it('keeps the KR surface compact and bordered before editing, then renders saved KRs as rows', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const editor = dom('goal-key-results-editor');
    expect(editor.classes()).toContain('bg-[hsl(var(--surface-raised)/0.24)]');
    expect(editor.classes()).toContain('shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.48)]');
    expect(document.querySelector('[data-testid="goal-key-results-empty"]')).toBeNull();

    timeframePicker(wrapper, 'goal-target-chip').vm.$emit('update:modelValue', {
      kind: 'quarter',
      year: 2026,
      quarter: 4,
    });
    await nextTick();

    await dom('add-key-result-entry').trigger('click');
    await nextTick();
    await dom('draft-kr-title-input').setValue('Reach 50 active users');
    await dom('draft-kr-target-input').setValue('50');
    await dom('save-key-result-draft').trigger('click');
    await nextTick();

    expect(document.querySelectorAll('[data-testid="goal-key-result-draft-row"]')).toHaveLength(1);
    expect(dom('goal-key-result-draft-calculation').text()).toContain('Cumulative');
    expect(dom('goal-key-result-draft-target').text()).toContain('2026 Q4');
    expect(dom('goal-key-result-draft-target').text()).not.toContain('Target');
    expect(dom('add-key-result-entry').text()).toBe('Add Key Result');

    wrapper.unmount();
  });

  it('hard-limits KR name and description with the same transient feedback pattern as Goal fields', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await dom('add-key-result-entry').trigger('click');
    await nextTick();

    const title = dom('draft-kr-title-input');
    await title.setValue('x'.repeat(51));
    await nextTick();
    expect((title.element as HTMLTextAreaElement).value).toHaveLength(50);
    expect(document.querySelector('[data-testid="draft-kr-title-limit-error"]')).not.toBeNull();

    const description = dom('draft-kr-description-input');
    await description.setValue('y'.repeat(201));
    await nextTick();
    expect((description.element as HTMLTextAreaElement).value).toHaveLength(200);
    expect(
      document.querySelector('[data-testid="draft-kr-description-limit-error"]'),
    ).not.toBeNull();

    wrapper.unmount();
  });

  it('keeps a new KR current value synced with initial value until current is edited', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await dom('add-key-result-entry').trigger('click');
    await nextTick();

    await dom('draft-kr-initial-input').setValue('20');
    await nextTick();
    expect((dom('draft-kr-current-input').element as HTMLInputElement).value).toBe('20');

    await dom('draft-kr-current-input').setValue('25');
    await nextTick();
    await dom('draft-kr-initial-input').setValue('22');
    await nextTick();
    expect((dom('draft-kr-current-input').element as HTMLInputElement).value).toBe('25');

    wrapper.unmount();
  });

  it('creates a label and submits labels plus locally drafted KRs in one Goal aggregate command', async () => {
    mocks.createLabel.mockResolvedValue({
      id: 'label-work',
      name: 'Work',
      color: '#3366ff',
      normalizedName: 'work',
      createdAt: 1,
      updatedAt: 1,
    });
    mocks.createGoal.mockResolvedValue({ id: 'goal-created', name: 'Ship MemoFlow vNext' });

    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await dom('goal-name-input').setValue('Ship MemoFlow vNext');
    await dom('goal-description-input').setValue(
      'Why this goal matters and how success will be judged.',
    );
    wrapper.getComponent(LabelPicker).vm.$emit('create', 'Work');
    await flushPromises();

    await dom('add-key-result-entry').trigger('click');
    await nextTick();
    await dom('draft-kr-title-input').setValue('Reach 50 active users');
    await dom('draft-kr-current-input').setValue('40');
    await dom('draft-kr-target-input').setValue('50');
    await dom('draft-kr-unit-input').setValue('users');
    await dom('save-key-result-draft').trigger('click');
    await nextTick();
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.createLabel).toHaveBeenCalledWith('Work');
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(mocks.createGoal).toHaveBeenCalledWith({
      name: 'Ship MemoFlow vNext',
      summary: undefined,
      description: 'Why this goal matters and how success will be judged.',
      start: undefined,
      target: undefined,
      labelIds: ['label-work'],
      initialKeyResults: [
        {
          title: 'Reach 50 active users',
          description: null,
          calculationMethod: 'Sum',
          initialValue: 0,
          currentValue: 40,
          targetValue: 50,
          target: null,
          unit: 'users',
          weight: 3,
        },
      ],
    });
    expect(mocks.updateGoal).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

function nativeSession(wrapper: ReturnType<typeof mount>): GoalNativeEditSession {
  const session = wrapper.emitted<[GoalNativeEditSession | null]>('session-change')?.at(-1)?.[0];
  if (!session) throw new Error('Missing native session');
  return session;
}

describe('Goal owner native edit session (PVC-AI-8001)', () => {
  it('detaches a failed workflow in place and saves through the native owner', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, presentation: 'panel' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const user = nativeSession(wrapper);
    const ai = user.claimControl('failed-run');
    const submit = vi.fn(async () => {});
    const cancel = vi.fn(async () => {});
    ai.coordinateSubmit(submit, cancel);
    ai.patch({ name: 'Preserved Goal', description: 'Keep this content' });
    ai.addChild({
      title: 'Preserved KR',
      calculationMethod: KeyResultCalculationMethod.Sum,
      initialValue: 0,
      currentValue: 0,
      targetValue: 12,
      weight: 3,
    });
    const before = ai.readDraftState();
    expect(() => user.detachWorkflow()).toThrow('controlled by AI');
    ai.detachWorkflow();
    await nextTick();
    expect(user.readDraftState()).toEqual({ ...before, busy: false });
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(() => ai.patch({ name: 'Late AI patch' })).toThrow('closed');
    await expect(ai.requestSubmit()).rejects.toThrow('closed');
    user.patch({ name: 'Manually edited Goal' });
    mocks.createGoal.mockResolvedValue(createMockGoal({ name: 'Manually edited Goal' }));
    await dom('goal-form').trigger('submit');
    await flushPromises();
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Manually edited Goal',
        description: 'Keep this content',
        initialKeyResults: [expect.objectContaining({ title: 'Preserved KR' })],
      }),
    );
    expect(mocks.createGoal.mock.calls[0][0]).not.toHaveProperty('nativeAiLease');
    wrapper.unmount();
  });

  it('clears stale callbacks after an already released handoff and retains native validation', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const user = nativeSession(wrapper);
    const ai = user.claimControl('failed-review');
    const submit = vi.fn(async () => {});
    const cancel = vi.fn(async () => {});
    ai.coordinateSubmit(submit, cancel);
    ai.patch({ name: 'Draft' });
    ai.releaseControl();
    user.detachWorkflow();
    user.patch({ start: { kind: 'year', year: 2028 }, target: { kind: 'year', year: 2027 } });
    await user.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(user.readDraftState().error).toBeTruthy();
    user.patch({ start: null, target: null });
    // Clearing the dirty content allows user dismissal without the dirty-close prompt.
    user.patch({ name: '' });
    await wrapper.getComponent(Dialog).vm.$emit('update:open', false);
    await flushPromises();
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('coordinates native Save/Enter and resolves pending labels only after validation on typed owner submit', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    const session = nativeSession(wrapper);
    const coordinator = vi.fn(async () => {});
    const cancelCoordinator = vi.fn(async () => {});
    session.coordinateSubmit(coordinator, cancelCoordinator);
    session.patch({
      name: 'Native review',
      keyResults: [
        {
          title: 'Measure',
          description: null,
          calculationMethod: 'Sum',
          initialValue: 0,
          currentValue: 0,
          targetValue: 2,
          unit: '',
          weight: 3,
        },
      ],
    });
    await new DOMWrapper(document.querySelector('#goal-form')!).trigger('submit');
    expect(coordinator).toHaveBeenCalledOnce();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(mocks.resolveNames).not.toHaveBeenCalled();
    await expect(session.requestSubmit()).rejects.toThrow('requires owner context');
    const beforeRejectedPatch = session.readDraftState();
    expect(() =>
      session.patch({
        name: 'Must not mutate',
        keyResults: [],
        keyResult: { index: 0, changes: { title: 'Invalid position' } },
      }),
    ).toThrow('position');
    expect(session.readDraftState()).toEqual(beforeRejectedPatch);
    const onCreateAttempt = vi.fn();
    const context = () => ({
      nativeAiLease: {
        runId: 'review-run',
        token: '11111111-1111-4111-8111-111111111111',
        fence: 2,
      },
      onCreateAttempt,
      createId:
        'GoalId_550e8400-e29b-41d4-a716-446655440001' as import('../../composables/goalNativeEditSession').GoalNativeSubmitContext['createId'],
      keyResultIds: [
        'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
      ] as import('../../composables/goalNativeEditSession').GoalNativeSubmitContext['keyResultIds'],
      pendingLabelNames: ['New proposed label'],
      expectedDraft: session.readDraftState().draft,
    });
    session.patch({ name: '' });
    expect(await session.requestSubmit(context())).toBeNull();
    expect(mocks.resolveNames).not.toHaveBeenCalled();
    expect(onCreateAttempt).not.toHaveBeenCalled();
    session.patch({ name: 'Native review' });
    const stale = context();
    session.patch({ summary: 'Changed while saving review' });
    expect(await session.requestSubmit(stale)).toBeNull();
    expect(mocks.resolveNames).not.toHaveBeenCalled();
    mocks.resolveNames.mockResolvedValue(['label-canonical']);
    mocks.createGoal.mockResolvedValue(createMockGoal({ id: context().createId }));
    expect(onCreateAttempt).not.toHaveBeenCalled();
    const approvedContext = context();
    const saved = await session.requestSubmit(approvedContext);
    expect(saved?.id).toBe(approvedContext.createId);
    expect(onCreateAttempt).toHaveBeenCalledOnce();
    expect(onCreateAttempt.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createGoal.mock.invocationCallOrder[0],
    );
    expect(mocks.resolveNames).toHaveBeenCalledWith(['New proposed label']);
    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: approvedContext.createId,
        labelIds: ['label-canonical'],
        initialKeyResults: [expect.objectContaining({ id: approvedContext.keyResultIds[0] })],
      }),
    );
    wrapper.unmount();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mocks.createGoal.mockReset();
    mocks.updateGoal.mockReset();
    mocks.transitionGoalStatus.mockReset();
    mocks.transitionGoalStatus.mockImplementation(async (goal) => goal);
  });

  it('shares manual edits, semantic fields, KR rows and dirty state in one detached draft', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    const session = nativeSession(wrapper);
    expect(session.readDraftState().dirty).toBe(false);
    await dom('goal-name-input').setValue('Manual Goal');
    expect(session.readDraftState().draft.name).toBe('Manual Goal');
    const target = { kind: 'quarter' as const, year: 2027, quarter: 4 as const };
    const labels = ['label-work'];
    session.patch({ name: 'Semantic Goal', summary: 'Summary', target, labelIds: labels });
    target.year = 2030;
    labels.push('external');
    await nextTick();
    expect((dom('goal-name-input').element as HTMLTextAreaElement).value).toBe('Semantic Goal');
    expect(session.readDraftState().draft.target?.year).toBe(2027);
    expect(session.readDraftState().draft.labelIds).toEqual(['label-work']);
    const snapshot = session.readDraftState();
    snapshot.draft.name = 'Detached';
    snapshot.draft.labelIds.push('detached');
    expect(session.readDraftState().draft.name).toBe('Semantic Goal');
    expect(session.readDraftState().draft.labelIds).toEqual(['label-work']);
    const child = {
      title: 'Native KR',
      calculationMethod: KeyResultCalculationMethod.Sum,
      initialValue: 0,
      currentValue: 0,
      targetValue: 12,
      weight: 3,
    };
    session.addChild(child);
    child.title = 'Detached child';
    await nextTick();
    expect(dom('goal-key-result-draft-row').text()).toContain('Native KR');
    session.patch({ keyResult: { index: 0, changes: { title: 'Patched KR' } } });
    await nextTick();
    expect(dom('goal-key-result-draft-row').text()).toContain('Patched KR');
    // Manual row deletion updates the very same session snapshot.
    const row = dom('goal-key-result-draft-row');
    await row.get('button[aria-label="Delete"]').trigger('click');
    expect(session.readDraftState().draft.keyResults).toEqual([]);
    session.addChild({ ...child, title: 'Another KR' });
    session.removeChild(0);
    await nextTick();
    expect(document.querySelector('[data-testid="goal-key-result-draft-row"]')).toBeNull();
    expect(session.readDraftState().dirty).toBe(true);
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([true]);
    wrapper.unmount();
    expect(() => session.patch({ name: 'Stale' })).toThrow('closed');
  });

  it('keeps semantic invalid edits on the owner form and submits valid edits through create', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    session.patch({
      name: 'Goal',
      start: { kind: 'year', year: 2028 },
      target: { kind: 'year', year: 2027 },
    });
    await session.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(session.readDraftState().error).toBeTruthy();
    session.patch({ start: null, name: 'x'.repeat(81) });
    await session.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    session.patch({ name: 'Valid Goal', labelIds: [''] });
    await session.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    session.patch({ labelIds: [] });
    session.addChild({
      title: 'KR',
      calculationMethod: KeyResultCalculationMethod.Sum,
      initialValue: 0,
      targetValue: 0,
      weight: 3,
    });
    await session.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    session.patch({ keyResult: { index: 0, changes: { targetValue: 12, weight: 9 } } });
    await session.requestSubmit();
    expect(mocks.createGoal).not.toHaveBeenCalled();
    session.patch({ keyResult: { index: 0, changes: { weight: 3 } } });
    mocks.createGoal.mockResolvedValue(createMockGoal({ name: 'Valid Goal' }));
    await session.requestSubmit();
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Valid Goal',
        initialKeyResults: [expect.objectContaining({ title: 'KR', targetValue: 12 })],
      }),
    );
    expect(wrapper.emitted('created')).toHaveLength(1);
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(() => session.readDraftState()).toThrow('closed');
    wrapper.unmount();
  });

  it('retains edit aggregate version, reminder validation and status transition', async () => {
    const goal = createMockGoal({
      name: 'Existing',
      version: 7,
      keyResults: [createMockKeyResult({ title: 'Existing KR' })],
    });
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    session.patch({
      target: null,
      reminderConfig: {
        enabled: true,
        triggers: [{ type: ReminderTriggerType.RemainingDays, value: 1, enabled: true }],
      },
    });
    await session.requestSubmit();
    expect(mocks.updateGoal).not.toHaveBeenCalled();
    expect(session.readDraftState().error).toBeTruthy();
    session.patch({ name: 'Updated', reminderConfig: null, status: GoalStatus.InProgress });
    const updated = createMockGoal({ ...goal, name: 'Updated', version: 8 });
    const finalGoal = createMockGoal({ ...updated, status: GoalStatus.InProgress, version: 9 });
    mocks.updateGoal.mockResolvedValue(updated);
    mocks.transitionGoalStatus.mockResolvedValue(finalGoal);
    await session.requestSubmit();
    expect(mocks.updateGoal).toHaveBeenCalledWith(
      String(goal.id),
      expect.objectContaining({
        name: 'Updated',
        expectedVersion: 7,
        keyResults: [expect.objectContaining({ id: goal.keyResults![0].id })],
      }),
    );
    expect(mocks.transitionGoalStatus).toHaveBeenCalledWith(updated, GoalStatus.InProgress);
    expect(wrapper.emitted('updated')?.at(-1)).toEqual([finalGoal]);
    wrapper.unmount();
  });

  it('detaches inbound nested KR targets and returned snapshots', async () => {
    const goal = createMockGoal({
      keyResults: [createMockKeyResult({ target: { kind: 'year', year: 2027 } })],
    });
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    const sourceTarget = goal.keyResults![0].target!;
    sourceTarget.year = 2030;
    expect(session.readDraftState().draft.keyResults[0].target?.year).toBe(2027);
    const state = wrapper.vm as unknown as {
      draft: { keyResults: { target: { year: number } }[] };
    };
    state.draft.keyResults[0].target.year = 2028;
    expect(sourceTarget.year).toBe(2030);
    const snapshot = session.readDraftState();
    snapshot.draft.keyResults[0].target!.year = 2040;
    expect(session.readDraftState().draft.keyResults[0].target?.year).toBe(2028);
    wrapper.unmount();
  });

  it('rejects combined patches atomically for invalid KR positions and active native editors', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    const before = session.readDraftState();
    expect(() =>
      session.patch({ name: 'Partial', keyResult: { index: -1, changes: { title: 'KR' } } }),
    ).toThrow('position');
    expect(session.readDraftState()).toEqual(before);
    await nextTick();
    await dom('add-key-result-entry').trigger('click');
    const editing = session.readDraftState();
    expect(() =>
      session.patch({ summary: 'Partial', keyResult: { index: 0, changes: { title: 'KR' } } }),
    ).toThrow('editor');
    expect(session.readDraftState()).toEqual(editing);
    wrapper.unmount();
  });

  it.each(['edit', 'create'] as const)(
    'rejects illegal %s lifecycle intent before any persistence',
    async (mode) => {
      const goal = createMockGoal({ status: GoalStatus.Planned, keyResults: [] });
      const wrapper = mount(GoalDialog, {
        props: { open: true, mode, goal },
        attachTo: document.body,
        global: { plugins: [i18n] },
      });
      const session = nativeSession(wrapper);
      session.patch({ name: 'Changed', status: GoalStatus.Completed });
      await session.requestSubmit();
      expect(mocks.updateGoal).not.toHaveBeenCalled();
      expect(mocks.createGoal).not.toHaveBeenCalled();
      expect(mocks.transitionGoalStatus).not.toHaveBeenCalled();
      expect(session.readDraftState().error).toBe('This status transition is not allowed.');
      expect(document.body.textContent).toContain(session.readDraftState().error);
      expect(wrapper.emitted('update:open')).toBeUndefined();
      wrapper.unmount();
    },
  );

  it('emits the saved edit and retires the session when the status transition fails', async () => {
    const goal = createMockGoal({ status: GoalStatus.Planned, version: 7, keyResults: [] });
    const updated = createMockGoal({ ...goal, version: 8 });
    mocks.updateGoal.mockResolvedValue(updated);
    mocks.transitionGoalStatus.mockResolvedValue(null);
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    session.patch({ status: GoalStatus.InProgress });
    await session.requestSubmit();
    expect(mocks.updateGoal).toHaveBeenCalledOnce();
    expect(mocks.updateGoal).toHaveBeenCalledWith(
      String(goal.id),
      expect.objectContaining({ expectedVersion: 7 }),
    );
    expect(mocks.createGoal).not.toHaveBeenCalled();
    expect(mocks.transitionGoalStatus).toHaveBeenCalledOnce();
    expect(mocks.transitionGoalStatus).toHaveBeenCalledWith(updated, GoalStatus.InProgress);
    expect(wrapper.emitted('updated')).toEqual([[updated]]);
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    expect(wrapper.emitted('session-change')?.at(-1)).toEqual([null]);
    expect(() => session.readDraftState()).toThrow('closed');
    await expect(session.requestSubmit()).rejects.toThrow('closed');
    expect(mocks.updateGoal).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('emits the saved create and retires the session when the status transition fails', async () => {
    const saved = createMockGoal({ name: 'Created Goal', status: GoalStatus.Planned });
    mocks.createGoal.mockResolvedValue(saved);
    mocks.transitionGoalStatus.mockResolvedValue(null);
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    session.patch({ name: 'Created Goal', status: GoalStatus.InProgress });
    await session.requestSubmit();
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Created Goal' }),
    );
    expect(mocks.updateGoal).not.toHaveBeenCalled();
    expect(mocks.transitionGoalStatus).toHaveBeenCalledOnce();
    expect(mocks.transitionGoalStatus).toHaveBeenCalledWith(saved, GoalStatus.InProgress);
    expect(wrapper.emitted('created')).toEqual([[saved]]);
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    expect(wrapper.emitted('session-change')?.at(-1)).toEqual([null]);
    expect(() => session.readDraftState()).toThrow('closed');
    await expect(session.requestSubmit()).rejects.toThrow('closed');
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('guards native dismissal through update and deferred transition and snapshots lifecycle intent', async () => {
    const goal = createMockGoal({ status: GoalStatus.Planned, version: 7, keyResults: [] });
    const updated = createMockGoal({ ...goal, version: 8 });
    const finalGoal = createMockGoal({ ...updated, status: GoalStatus.InProgress, version: 9 });
    let resolveUpdate!: (goal: typeof updated) => void;
    let resolveTransition!: (goal: typeof finalGoal) => void;
    mocks.updateGoal.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveUpdate = done;
        }),
    );
    mocks.transitionGoalStatus.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveTransition = done;
        }),
    );
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'edit', goal },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    session.patch({ status: GoalStatus.InProgress });
    const submitting = session.requestSubmit();
    await nextTick();
    wrapper.getComponent(Dialog).vm.$emit('update:open', false);
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(session.readDraftState().busy).toBe(true);
    for (const id of ['goal-name-input', 'goal-summary-input', 'goal-description-input']) {
      expect((dom(id).element as HTMLTextAreaElement).disabled).toBe(true);
    }
    expect(timeframePicker(wrapper, 'goal-start-chip').props('disabled')).toBe(true);
    expect(timeframePicker(wrapper, 'goal-target-chip').props('disabled')).toBe(true);
    expect(wrapper.getComponent(GoalReminderChip).props('disabled')).toBe(true);
    // Fault injection proves completion uses the captured submission intent.
    const state = wrapper.vm as unknown as { draft: { status: typeof GoalStatus.Completed } };
    state.draft.status = GoalStatus.Completed;
    resolveUpdate(updated);
    await flushPromises();
    expect(mocks.transitionGoalStatus).toHaveBeenCalledWith(updated, GoalStatus.InProgress);
    wrapper.getComponent(Dialog).vm.$emit('update:open', false);
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(session.readDraftState().busy).toBe(true);
    expect(() => session.requestCancel()).toThrow('busy');
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([true]);
    resolveTransition(finalGoal);
    await submitting;
    expect(wrapper.emitted('updated')?.at(-1)).toEqual([finalGoal]);
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('retires handles on KeepAlive deactivation and republishes the preserved native draft', async () => {
    const visible = ref(true);
    const Empty = defineComponent({ setup: () => () => h('div') });
    const Host = defineComponent({
      setup: () => () =>
        h(
          KeepAlive,
          {},
          {
            default: () => (visible.value ? h(GoalDialog, { open: true }) : h(Empty)),
          },
        ),
    });
    const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [i18n] } });
    await nextTick();
    const dialog = wrapper.findComponent(GoalDialog);
    const session = nativeSession(dialog);
    session.patch({ name: 'Preserved draft' });
    visible.value = false;
    await nextTick();
    expect(() => session.readDraftState()).toThrow('closed');
    visible.value = true;
    await nextTick();
    const restored = nativeSession(wrapper.findComponent(GoalDialog));
    expect(restored).not.toBe(session);
    expect(restored.readDraftState().draft.name).toBe('Preserved draft');
    expect(restored.readDraftState().dirty).toBe(true);
    wrapper.unmount();
  });

  it('keeps the canonical submit busy and rejects edits/cancel/repeated submission until it settles', async () => {
    let resolve!: (goal: ReturnType<typeof createMockGoal>) => void;
    mocks.createGoal.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const session = nativeSession(wrapper);
    session.patch({ name: 'Saving Goal' });
    const saved = session.requestSubmit();
    expect(session.readDraftState().busy).toBe(true);
    expect(() => session.patch({ name: 'Race' })).toThrow('busy');
    expect(() => session.requestCancel()).toThrow('busy');
    await expect(session.requestSubmit()).rejects.toThrow('busy');
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([true]);
    resolve(createMockGoal({ name: 'Saving Goal' }));
    await saved;
    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('focuses by owner refs and cancels through native close, retiring old handles on reopen', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    const session = nativeSession(wrapper);
    const element = dom('goal-summary-input').element;
    const selectorSpy = vi.spyOn(document, 'querySelector');
    await session.focus('summary');
    expect(document.activeElement).toBe(element);
    expect(selectorSpy).not.toHaveBeenCalled();
    selectorSpy.mockRestore();
    session.patch({ name: 'Unsaved' });
    session.requestCancel();
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([false]);
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    expect(nativeSession(wrapper).readDraftState().draft.name).toBe('');
    expect(() => session.requestCancel()).toThrow('closed');
    wrapper.unmount();
  });
  it('blocks native draft mutation until an unresolved owner attempt is reconciled', async () => {
    const wrapper = mount(GoalDialog, { props: { open: true }, global: { plugins: [i18n] } });
    await nextTick();
    const session = nativeSession(wrapper);
    session.patch({ name: 'Frozen owner draft' });
    session.setEditingBlocked(true);
    await nextTick();
    expect(session.readDraftState().busy).toBe(true);
    expect(() => session.patch({ name: 'Second draft' })).toThrow('busy');
    expect(() => session.removeChild(0)).toThrow('busy');
    expect(() => session.requestCancel()).toThrow('busy');
    expect(session.readDraftState().draft.name).toBe('Frozen owner draft');
    session.setEditingBlocked(false);
    session.patch({ name: 'Reconciled editable draft' });
    expect(session.readDraftState().draft.name).toBe('Reconciled editable draft');
    wrapper.unmount();
  });
});
