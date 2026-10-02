import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { productionLocaleMessages } from '../../../../locales/production-messages';
import { clearDialogDrafts } from '../../../../layouts/shell/dialog-draft-store';
import TaskPlanDialog from './TaskPlanDialog.vue';
import TaskPlanForm from '../TaskPlanForm/TaskPlanForm.vue';
import type { TaskNativeEditSession } from '../../composables/taskNativeEditSession';
import { CreateTaskPlanSchema } from '@memoflow/contracts/task';
import { createMockTaskPlan } from '@memoflow/contracts/mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, 'TaskPlanDialog.vue'), 'utf8');

describe('TaskPlanDialog vNext', () => {
  it('uses the same stable workspace dialog shell as Goal', () => {
    expect(source).toContain('TaskPlanForm');
    expect(source).toContain('recipe="workspace"');
    expect(source).not.toContain('content-class="h-[min(88vh,760px)]"');
    for (const retired of ['DependencyManager', 'parentTaskId', 'folderId', 'TaskForDAG']) {
      expect(source).not.toContain(retired);
    }
  });

  it('separates Goal-bound create drafts from generic standalone drafts', () => {
    expect(source).toContain('props.initialGoalBinding?.goalId');
    expect(source).toContain("props.initialGoalBinding.keyResultId ?? 'goal'");
    expect(source).toContain('goalBinding: props.initialGoalBinding');
  });

  it('uses canonical occurrence statistics for blank, copy, and update-impact drafts', () => {
    expect(source).toContain('futurePendingOccurrenceCount');
    expect(source).toContain('occurrenceCount: 0');
    expect(source).toContain('completedOccurrenceCount: 0');
    expect(source).toContain('pendingOccurrenceCount: 0');
  });
});

const mocks = vi.hoisted(() => ({ resolveNames: vi.fn(async () => ['resolved-label']) }));
vi.mock('../../../../shared/composables/useLabelCatalog', async () => {
  const { ref } = await import('vue');
  return {
    useLabelCatalog: () => ({
      labels: ref([]),
      options: ref([]),
      isLoading: ref(false),
      isCreating: ref(false),
      createLabel: vi.fn(),
      resolveNames: mocks.resolveNames,
    }),
  };
});
vi.mock('../../composables/useTaskGoalBindingOptions', async () => {
  const { ref } = await import('vue');
  return {
    useTaskGoalBindingOptions: () => ({
      goals: ref([]),
      keyResultsByGoal: ref({}),
      loadingGoals: ref(false),
      loadingKeyResults: ref({}),
      keyResultErrorsByGoal: ref({}),
      loadGoals: vi.fn(),
      loadKeyResults: vi.fn(),
      clearErrors: vi.fn(),
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
function nativeSession(wrapper: ReturnType<typeof mount>): TaskNativeEditSession {
  const events = wrapper.emitted('session-change') ?? [];
  const value = events.filter((event) => event[0]).at(-1)?.[0];
  if (!value) throw new Error('Missing native Task session');
  return value as TaskNativeEditSession;
}
function dom(id: string) {
  const element = document.querySelector(`[data-testid="${id}"]`);
  if (!element) throw new Error(`Missing ${id}`);
  return new DOMWrapper(element);
}
const wrappers: ReturnType<typeof mount>[] = [];
function render() {
  const submitOwner = vi.fn(async (_draft: unknown, context?: { onCreateAttempt: () => void }) => {
    context?.onCreateAttempt();
    return createMockTaskPlan();
  });
  const wrapper = mount(TaskPlanDialog, {
    attachTo: document.body,
    props: { modelValue: true, submitOwner },
    global: { plugins: [i18n] },
  });
  wrappers.push(wrapper);
  return { wrapper, submitOwner, session: nativeSession(wrapper) };
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  clearDialogDrafts();
  vi.clearAllMocks();
});
describe('Task full-create native session', () => {
  it('semantic patches and manual input mutate the same detached draft and publish dirty', async () => {
    const { wrapper, session } = render();
    session.patch({ title: 'Proposed', importance: 'Important' });
    await flushPromises();
    expect(dom('task-plan-title-input').element).toHaveProperty('value', 'Proposed');
    await dom('task-plan-title-input').setValue('Manual');
    await nextTick();
    const state = session.readDraftState();
    expect(state.draft.title).toBe('Manual');
    expect(state.dirty).toBe(true);
    state.draft.title = 'Detached';
    expect(session.readDraftState().draft.title).toBe('Manual');
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([true]);
  });
  it('validates native form before labels or persistence', async () => {
    const { session, submitOwner } = render();
    await flushPromises();
    const attempt = vi.fn();
    expect(
      await session.requestSubmit({
        createId: CreateTaskPlanSchema.shape.id
          .unwrap()
          .parse('ITaskPlanId_550e8400-e29b-41d4-a716-446655440001'),
        expectedDraft: session.readDraftState().draft,
        pendingLabelNames: ['new'],
        onCreateAttempt: attempt,
      }),
    ).toBeNull();
    expect(submitOwner).not.toHaveBeenCalled();
    expect(mocks.resolveNames).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
  });
  it('coordinates native Save and then invokes the owner callback with a deterministic ID', async () => {
    const { session, submitOwner } = render();
    session.patch({ title: 'Valid' });
    await flushPromises();
    const coordinator = vi.fn(async () => {});
    session.coordinateSubmit(coordinator, vi.fn());
    await dom('task-dialog-save-button').trigger('click');
    expect(coordinator).toHaveBeenCalledOnce();
    expect(submitOwner).not.toHaveBeenCalled();
    expect(() => session.requestSubmit()).toThrow('context');
    const attempt = vi.fn();
    const context = {
      createId: CreateTaskPlanSchema.shape.id
        .unwrap()
        .parse('ITaskPlanId_550e8400-e29b-41d4-a716-446655440001'),
      expectedDraft: session.readDraftState().draft,
      pendingLabelNames: ['new'],
      onCreateAttempt: attempt,
    };
    await session.requestSubmit(context);
    expect(submitOwner).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Valid', labelIds: ['resolved-label'] }),
      context,
    );
    expect(attempt).toHaveBeenCalledOnce();
    expect(mocks.resolveNames.mock.invocationCallOrder[0]).toBeLessThan(
      submitOwner.mock.invocationCallOrder[0],
    );
  });
  it('leaves normal owner Save uncoordinated', async () => {
    const { session, submitOwner } = render();
    session.patch({ title: 'Manual' });
    await flushPromises();
    await dom('task-dialog-save-button').trigger('click');
    await flushPromises();
    expect(submitOwner).toHaveBeenCalledOnce();
  });
  it('rejects stale expected snapshot before any owner or label commands', async () => {
    const { session, submitOwner } = render();
    session.patch({ title: 'First' });
    await flushPromises();
    const expectedDraft = session.readDraftState().draft;
    session.patch({ title: 'Second' });
    await flushPromises();
    await expect(
      session.requestSubmit({
        createId: CreateTaskPlanSchema.shape.id
          .unwrap()
          .parse('ITaskPlanId_550e8400-e29b-41d4-a716-446655440001'),
        expectedDraft,
        pendingLabelNames: ['new'],
        onCreateAttempt: vi.fn(),
      }),
    ).rejects.toThrow('changed');
    expect(submitOwner).not.toHaveBeenCalled();
  });
  it('blocks input, semantic patches, cancel and late form events while locked', async () => {
    const { wrapper, session } = render();
    session.patch({ title: 'Frozen' });
    session.setEditingBlocked(true);
    await flushPromises();
    expect(dom('task-plan-title-input').attributes('disabled')).toBeDefined();
    expect(() => session.patch({ title: 'Late' })).toThrow('busy');
    expect(() => session.requestCancel()).toThrow('busy');
    wrapper
      .findComponent(TaskPlanForm)
      .vm.$emit('update:modelValue', { ...session.readDraftState().draft, title: 'Late' });
    expect(session.readDraftState().draft.title).toBe('Frozen');
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([true]);
    session.setEditingBlocked(false);
    session.requestCancel();
    expect(() => session.readDraftState()).toThrow('closed');
  });
  it('publishes busy synchronously during owner persistence', async () => {
    const { wrapper, session, submitOwner } = render();
    session.patch({ title: 'Valid' });
    await flushPromises();
    let resolve!: (value: ReturnType<typeof createMockTaskPlan>) => void;
    submitOwner.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const saving = session.requestSubmit();
    expect(session.readDraftState().busy).toBe(true);
    expect(() => session.patch({ title: 'Late' })).toThrow('busy');
    await nextTick();
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([true]);
    resolve(createMockTaskPlan());
    await saving;
    expect(session.readDraftState().busy).toBe(false);
  });
  it('routes native cancel through attached coordinator and retires handle on disposal', async () => {
    const { wrapper, session } = render();
    const cancel = vi.fn(async () => {});
    session.coordinateSubmit(vi.fn(), cancel);
    await flushPromises();
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === 'Cancel',
    );
    if (!button) throw new Error('Missing cancel');
    button.click();
    await flushPromises();
    expect(cancel).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(() => session.readDraftState()).toThrow('closed');
  });
  it('retires an externally closed handle and publishes a fresh handle on reopen', async () => {
    const { wrapper, session } = render();
    await wrapper.setProps({ modelValue: false });
    expect(() => session.readDraftState()).toThrow('closed');
    await wrapper.setProps({ modelValue: true });
    const reopened = nativeSession(wrapper);
    expect(reopened).not.toBe(session);
    expect(reopened.readDraftState().draft.title).toBe('');
  });
});
