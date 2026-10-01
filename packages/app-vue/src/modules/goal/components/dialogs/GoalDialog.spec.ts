/** @vitest-environment happy-dom */

import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { productionLocaleMessages } from '../../../../locales/production-messages';
import { createMockGoal, createMockKeyResult } from '@memoflow/contracts/mocks';
import {
  CreateGoalSchema,
  GoalStatus,
  ReminderTriggerType,
  type GoalReminderConfigDTO,
} from '@memoflow/contracts/goal';
import { LabelPicker } from '../../../../shared/components';
import GoalReminderChip from '../GoalReminderChip.vue';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';
import GoalStatusPicker from '../GoalStatusPicker.vue';
import GoalDialog from './GoalDialog.vue';

const mocks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  transitionGoalStatus: vi.fn(async (goal) => goal),
  createLabel: vi.fn(),
}));

vi.mock('../../composables/useGoal', async () => {
  const { ref } = await import('vue');
  return {
    useGoal: () => ({
      createGoal: mocks.createGoal,
      updateGoal: mocks.updateGoal,
      transitionGoalStatus: mocks.transitionGoalStatus,
      isSaving: ref(false),
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
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
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

  it('ignores non-null reminder draft state when creating a Goal', async () => {
    const created = createMockGoal({ name: 'New Goal', status: GoalStatus.Planned });
    mocks.createGoal.mockResolvedValue(created);
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    // Fault injection: a hidden stale reminder must neither block create nor enter its request.
    const state = wrapper.vm as unknown as { draft: { reminderConfig: GoalReminderConfigDTO } };
    state.draft.reminderConfig = {
      enabled: true,
      triggers: [{ type: ReminderTriggerType.RemainingDays, value: 1, enabled: true }],
    };
    await dom('goal-name-input').setValue('New Goal');
    await dom('save-goal-button').trigger('click');
    await flushPromises();

    expect(mocks.createGoal).toHaveBeenCalledOnce();
    expect(mocks.createGoal.mock.calls[0][0]).not.toHaveProperty('reminderConfig');
    expect(wrapper.emitted('created')?.at(-1)).toEqual([created]);
    expect(document.body.textContent).not.toContain(
      'Remaining-days reminders require a target date.',
    );
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

  it('edits only vNext Direction + Measurement fields without retired taxonomy or motivation forms', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../dialogs/GoalDialog.vue'), 'utf8');
    expect(source).toContain('GoalTimeframePicker');
    expect(source).toContain('goal-property-chips');
    expect(source).toContain('GoalReminderChip');
    expect(source).toContain('LabelPicker');
    expect(source).toContain('initialKeyResults');
    expect(source).toContain('keyResults');
    expect(source).toContain('ProductDialogShell');
    expect(source).toContain('recipe="workspace"');
    expect(source).toContain('ProductAutoTextarea');
    expect(source).toContain('class="flex min-h-full flex-col gap-6"');
    expect(source).toContain('GoalKeyResultDraftEditor');
    expect(source).toContain('class="mt-auto"');
    expect(source).toContain('GoalStatusPicker');

    const keyResultEditorSource = fs.readFileSync(
      path.resolve(__dirname, '../GoalKeyResultDraftEditor.vue'),
      'utf8',
    );
    expect(keyResultEditorSource).toContain('<Transition name="kr-editor-reveal"');
    expect(keyResultEditorSource).toContain('border-[hsl(var(--border-subtle))]');
    expect(keyResultEditorSource).toContain('transform-origin: bottom');
    expect(keyResultEditorSource).toContain('grid-template-rows 220ms');
    expect(keyResultEditorSource).toContain('prefers-reduced-motion');
    expect(keyResultEditorSource).toContain('GoalKeyResultCardEditor');
    expect(keyResultEditorSource).not.toContain('Collapsible');

    const keyResultCardSource = fs.readFileSync(
      path.resolve(__dirname, '../GoalKeyResultCardEditor.vue'),
      'utf8',
    );
    expect(keyResultCardSource).toContain('GoalKeyResultTrajectoryPlot');
    expect(keyResultCardSource).toContain('draft-kr-description-input');
    expect(keyResultCardSource).toContain('draft-kr-calculation-method');
    expect(keyResultCardSource).toContain('draft-kr-weight');
    expect(keyResultCardSource).toContain('draft-kr-target-timeframe');
    expect(keyResultCardSource).not.toContain('krTrajectoryHint');
    expect(source).not.toContain('goal.dialog.vNextDescription');
    expect(source).not.toContain('goal.dialog.keyResultsHint');
    expect(source).not.toContain('goal.dialog.krEmptyDesc');
    expect(source).toContain('draft.description');
    for (const retired of [
      'dueDate',
      'folderId',
      'parentGoalId',
      'category',
      'importance',
      'draft.motivation',
      'draft.feasibilityAnalysis',
    ]) {
      expect(source).not.toContain(retired);
    }
  });

  it('keeps Goal identity fields borderless, wrapping, and hard-truncated to product limits', async () => {
    const wrapper = mount(GoalDialog, {
      props: { open: true, mode: 'create' },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const name = dom('goal-name-input');
    await name.setValue('x'.repeat(81));
    await nextTick();
    expect((name.element as HTMLTextAreaElement).value).toHaveLength(80);
    expect(document.querySelector('[data-testid="goal-name-limit-error"]')).not.toBeNull();

    const summary = dom('goal-summary-input');
    await summary.setValue('y'.repeat(256));
    await nextTick();
    expect((summary.element as HTMLTextAreaElement).value).toHaveLength(255);
    expect(document.querySelector('[data-testid="goal-summary-limit-error"]')).not.toBeNull();

    expect(name.classes()).toContain('resize-none');
    expect(name.classes()).toContain('border-0');
    expect(name.classes()).toContain('focus-visible:ring-0');
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
    expect(editor.classes()).toContain(
      'shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.48)]',
    );
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
