import { defineComponent, h, nextTick, reactive, type Component } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyResultBindingOption, TaskPlanViewModel } from '../../types';
import KeyResultLinksSection from './KeyResultLinksSection.vue';

const SelectStub = defineComponent({
  name: 'TestSelect',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'select-stub' }, slots.default?.());
  },
});

const SwitchStub = defineComponent({
  name: 'TestSwitch',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': String(Boolean(props.modelValue)),
        onClick: () => emit('update:modelValue', !props.modelValue),
      });
  },
});

const passThrough = (name: string, tag = 'div'): Component =>
  defineComponent({
    name,
    setup(_props, { slots, attrs }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      task: {
        krLinks: {
          title: 'Key result link',
          linkedCount: 'Linked',
          hint: 'Link completion to a key result.',
          enable: 'Enable key result link',
          selectGoal: 'Select goal',
          selectGoalPlaceholder: 'Choose a goal',
          selectKR: 'Select key result',
          selectGoalFirst: 'Choose a goal first',
          loadingKeyResults: 'Loading key results',
          loadError: 'Could not load key results',
          retry: 'Retry',
          emptyKeyResults: 'This goal has no key results',
          progressValue: 'Progress value',
          progressPlaceholder: 'Value',
          points: 'points',
          progressText: 'Progress increases after completion.',
          contributionEnable: 'Automatically contribute progress',
          contributionHint: 'Leave this off for a link-only relationship.',
          weight: 'Weight {value}',
          configPreview: 'Preview',
          trigger: {
            label: 'Trigger',
            placeholder: 'Choose a trigger',
            perInstance: 'Each instance',
            perInstanceDesc: 'Apply once per completed instance.',
            allInstancesCompleted: 'Whole plan',
            allInstancesCompletedDesc: 'Apply once when the whole plan is complete.',
            finitePlanOnly: 'Available only for plans with an end date or occurrence limit.',
          },
          previewText: {
            EachCompletion: 'Increase by {value}',
            PlanCompletion: 'Increase once by {value}',
          },
        },
      },
    },
  },
});

function makeTemplate(): TaskPlanViewModel {
  return {
    id: '',
    title: 'Keep this title',
    description: 'Keep this description',
    status: 'ACTIVE',
    timeConfig: { timeType: 'AllDay', startDate: Date.now() },
    goalBinding: null,
  };
}

function makeKeyResult(id: string, title: string): KeyResultBindingOption {
  return {
    id,
    title,
    weight: 1,
    progress: { current: 0, target: 10, percentage: 0 },
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mountSection(options: {
  request: (goalId: string, force?: boolean) => Promise<KeyResultBindingOption[]>;
  template?: TaskPlanViewModel;
  keyResultsByGoal?: Record<string, KeyResultBindingOption[]>;
  loadingKeyResults?: Record<string, boolean>;
  keyResultErrorsByGoal?: Record<string, string | null>;
}) {
  return mount(KeyResultLinksSection, {
    props: {
      modelValue: options.template ?? makeTemplate(),
      goals: [
        { id: 'goal-a', title: 'Goal A' },
        { id: 'goal-b', title: 'Goal B' },
      ],
      keyResultsByGoal: options.keyResultsByGoal ?? {},
      loadingKeyResults: options.loadingKeyResults,
      keyResultErrorsByGoal: options.keyResultErrorsByGoal,
      onRequestKeyResults: options.request,
    },
    global: {
      plugins: [i18n],
      stubs: {
        Select: SelectStub,
        Switch: SwitchStub,
        Card: passThrough('Card'),
        CardHeader: passThrough('CardHeader'),
        CardTitle: passThrough('CardTitle'),
        CardContent: passThrough('CardContent'),
        Alert: passThrough('Alert'),
        AlertDescription: passThrough('AlertDescription'),
        Label: passThrough('Label', 'label'),
        SelectTrigger: passThrough('SelectTrigger', 'button'),
        SelectValue: true,
        SelectContent: passThrough('SelectContent'),
        SelectItem: passThrough('SelectItem'),
        Input: true,
        Badge: passThrough('Badge'),
        Button: passThrough('Button', 'button'),
        Target: true,
        CheckCircle: true,
        Info: true,
        Flag: true,
        PlusCircle: true,
        Link2: true,
        LoaderCircle: true,
        RotateCw: true,
      },
    },
  });
}

function mountSectionWithRealSelect(options: {
  request: (goalId: string, force?: boolean) => Promise<KeyResultBindingOption[]>;
  template?: TaskPlanViewModel;
  keyResultsByGoal?: Record<string, KeyResultBindingOption[]>;
}) {
  return mount(KeyResultLinksSection, {
    attachTo: document.body,
    props: {
      modelValue: options.template ?? makeTemplate(),
      goals: [{ id: 'goal-a', title: 'Goal A', description: 'A current goal' }],
      keyResultsByGoal: options.keyResultsByGoal ?? {},
      onRequestKeyResults: options.request,
    },
    global: {
      plugins: [i18n],
      stubs: {
        Switch: SwitchStub,
        Card: passThrough('Card'),
        CardHeader: passThrough('CardHeader'),
        CardTitle: passThrough('CardTitle'),
        CardContent: passThrough('CardContent'),
        Alert: passThrough('Alert'),
        AlertDescription: passThrough('AlertDescription'),
        Label: passThrough('Label', 'label'),
        Input: true,
        Badge: passThrough('Badge'),
        Button: passThrough('Button', 'button'),
        Target: true,
        CheckCircle: true,
        Info: true,
        Flag: true,
        PlusCircle: true,
        Link2: true,
        LoaderCircle: true,
        RotateCw: true,
      },
    },
  });
}

async function enableLink(wrapper: ReturnType<typeof mountSection>) {
  await wrapper.get('[role="switch"]').trigger('click');
  await nextTick();
}

async function toggleContribution(wrapper: ReturnType<typeof mountSection>) {
  const switches = wrapper.findAll('[role="switch"]');
  if (switches.length < 2) throw new Error('Contribution switch not mounted');
  await switches[1].trigger('click');
  await nextTick();
}

describe('KeyResultLinksSection', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('disables whole-plan progress for an unlimited recurring plan', async () => {
    const template = makeTemplate();
    template.taskType = 'RECURRING';
    template.recurrenceRule = {
      frequency: 'DAILY',
      interval: 1,
      daysOfWeek: [],
      endDate: null,
      occurrences: null,
    };

    template.goalBinding = {
      goalId: 'goal-a',
      keyResultId: 'kr-a',
      contribution: { value: 1, trigger: 'EachCompletion' },
    };
    const wrapper = mountSection({
      request: vi.fn(),
      template,
      keyResultsByGoal: { 'goal-a': [makeKeyResult('kr-a', 'Result A')] },
    });
    await nextTick();

    const wholePlanOption = wrapper.get(
      '[data-testid="kr-progress-trigger-PlanCompletion"]',
    );
    expect(wholePlanOption.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain(
      'Available only for plans with an end date or occurrence limit.',
    );
  });

  it('preserves a link-only Goal/KR relationship without synthesizing contribution', async () => {
    const template = makeTemplate();
    template.goalBinding = { goalId: 'goal-a', keyResultId: 'kr-a' };
    const wrapper = mountSection({
      request: vi.fn(),
      template,
      keyResultsByGoal: { 'goal-a': [makeKeyResult('kr-a', 'Result A')] },
    });
    await nextTick();

    const switches = wrapper.findAll('[role="switch"]');
    expect(switches).toHaveLength(2);
    expect(switches[1].attributes('aria-checked')).toBe('false');

    await toggleContribution(wrapper);
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      goalBinding: {
        goalId: 'goal-a',
        keyResultId: 'kr-a',
        contribution: { value: 1, trigger: 'EachCompletion' },
      },
    });

    await toggleContribution(wrapper);
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0];
    expect(emitted).toMatchObject({ goalBinding: { goalId: 'goal-a', keyResultId: 'kr-a' } });
    expect(emitted.goalBinding).not.toHaveProperty('contribution');
  });

  it('selects a key result added after its goal without a Select focus crash', async () => {
    const wrapper = mountSectionWithRealSelect({
      request: vi.fn(),
      keyResultsByGoal: {
        'goal-a': [makeKeyResult('kr-new', 'Newly added key result')],
      },
    });
    await enableLink(wrapper);

    await wrapper
      .get('[data-testid="task-goal-select-trigger"]')
      .trigger('pointerdown', { button: 0, ctrlKey: false });
    await flushPromises();
    const goalOption = document.body.querySelector<HTMLElement>('[role="option"]');
    expect(goalOption?.textContent).toContain('Goal A');
    goalOption?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    await flushPromises();

    await wrapper
      .get('[data-testid="task-key-result-select-trigger"]')
      .trigger('pointerdown', { button: 0, ctrlKey: false });
    await flushPromises();
    const keyResultOption = [
      ...document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((option) => option.textContent?.includes('Newly added key result'));
    expect(keyResultOption).toBeTruthy();
    keyResultOption?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    await flushPromises();

    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0];
    expect(emitted).toMatchObject({
      title: 'Keep this title',
      goalBinding: { goalId: 'goal-a', keyResultId: 'kr-new' },
    });
    expect(emitted.goalBinding).not.toHaveProperty('goalTitle');
    expect(emitted.goalBinding).not.toHaveProperty('keyResultTitle');
  });

  it('ignores a stale A response after the user switches to goal B', async () => {
    const a = deferred<KeyResultBindingOption[]>();
    const b = deferred<KeyResultBindingOption[]>();
    const cache = reactive<Record<string, KeyResultBindingOption[]>>({});
    const request = vi.fn(async (goalId: string) => {
      const result = await (goalId === 'goal-a' ? a.promise : b.promise);
      cache[goalId] = result;
      return result;
    });
    const wrapper = mountSection({ request, keyResultsByGoal: cache });
    await enableLink(wrapper);

    const goalSelect = wrapper.findAllComponents(SelectStub)[0];
    goalSelect.vm.$emit('update:modelValue', 'goal-a');
    await nextTick();
    goalSelect.vm.$emit('update:modelValue', 'goal-b');
    await nextTick();

    b.resolve([makeKeyResult('kr-b', 'Result B')]);
    await flushPromises();
    a.resolve([makeKeyResult('kr-a', 'Stale result A')]);
    await flushPromises();

    expect(request).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Result B');
    expect(wrapper.text()).not.toContain('Stale result A');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      title: 'Keep this title',
      description: 'Keep this description',
      goalBinding: { goalId: 'goal-b', keyResultId: null },
    });
  });

  it('shows a recoverable section error without replacing the form', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const errors = reactive<Record<string, string | null>>({});
    const request = vi.fn(async (goalId: string) => {
      errors[goalId] = 'Could not load key results';
      throw new Error('network down');
    });
    const wrapper = mountSection({ request, keyResultErrorsByGoal: errors });
    await enableLink(wrapper);

    wrapper.findAllComponents(SelectStub)[0].vm.$emit('update:modelValue', 'goal-a');
    await flushPromises();

    expect(wrapper.text()).toContain('Could not load key results');
    expect(wrapper.text()).toContain('Retry');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      title: 'Keep this title',
      description: 'Keep this description',
      goalBinding: { goalId: 'goal-a' },
    });
  });

  it('retries the selected goal with force after a recoverable error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cache = reactive<Record<string, KeyResultBindingOption[]>>({});
    const errors = reactive<Record<string, string | null>>({});
    const request = vi.fn(async (goalId: string, force?: boolean) => {
      if (!force) {
        errors[goalId] = 'Could not load key results';
        throw new Error('network down');
      }

      errors[goalId] = null;
      cache[goalId] = [makeKeyResult('kr-a', 'Recovered result')];
      return cache[goalId];
    });
    const wrapper = mountSection({
      request,
      keyResultsByGoal: cache,
      keyResultErrorsByGoal: errors,
    });
    await enableLink(wrapper);

    wrapper.findAllComponents(SelectStub)[0].vm.$emit('update:modelValue', 'goal-a');
    await flushPromises();
    const retryButton = wrapper.findAll('button').find((button) => button.text().includes('Retry'));
    expect(retryButton).toBeDefined();
    await retryButton!.trigger('click');
    await flushPromises();

    expect(request).toHaveBeenNthCalledWith(1, 'goal-a', false);
    expect(request).toHaveBeenNthCalledWith(2, 'goal-a', true);
    expect(wrapper.text()).toContain('Recovered result');
    expect(wrapper.text()).not.toContain('Could not load key results');
  });

  it('keeps the key-result select mounted while loading and after success', async () => {
    const pending = deferred<KeyResultBindingOption[]>();
    const cache = reactive<Record<string, KeyResultBindingOption[]>>({});
    const loading = reactive<Record<string, boolean>>({});
    const request = vi.fn(async (goalId: string) => {
      loading[goalId] = true;
      const result = await pending.promise;
      cache[goalId] = result;
      loading[goalId] = false;
      return result;
    });
    const wrapper = mountSection({
      request,
      keyResultsByGoal: cache,
      loadingKeyResults: loading,
    });
    await enableLink(wrapper);

    const goalSelect = wrapper.findAllComponents(SelectStub)[0];
    const keyResultSelectElement = wrapper.findAllComponents(SelectStub)[1].element;
    goalSelect.vm.$emit('update:modelValue', 'goal-a');
    await nextTick();

    expect(wrapper.text()).toContain('Loading key results');
    expect(wrapper.findAllComponents(SelectStub)[1].element).toBe(keyResultSelectElement);

    pending.resolve([makeKeyResult('kr-a', 'Result A')]);
    await flushPromises();

    expect(wrapper.findAllComponents(SelectStub)[1].element).toBe(keyResultSelectElement);
    expect(wrapper.text()).toContain('Result A');
  });

  it('survives 20 association toggle and goal-switch cycles without duplicate requests', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cache = reactive<Record<string, KeyResultBindingOption[]>>({});
    const request = vi.fn(async (goalId: string) => {
      const result = [makeKeyResult(`kr-${goalId}`, `Result ${goalId}`)];
      cache[goalId] = result;
      return result;
    });
    const wrapper = mountSection({ request, keyResultsByGoal: cache });

    for (let index = 0; index < 20; index += 1) {
      await enableLink(wrapper);
      const goalId = index % 2 === 0 ? 'goal-a' : 'goal-b';
      wrapper.findAllComponents(SelectStub)[0].vm.$emit('update:modelValue', goalId);
      await flushPromises();
      await wrapper.get('[role="switch"]').trigger('click');
      await nextTick();
    }

    expect(request).toHaveBeenCalledTimes(2);
    expect(consoleError).not.toHaveBeenCalled();
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
  });

  it('shows an explicit empty state when the selected goal has no key results', async () => {
    const cache = reactive<Record<string, KeyResultBindingOption[]>>({});
    const request = vi.fn(async (goalId: string) => {
      cache[goalId] = [];
      return [];
    });
    const wrapper = mountSection({ request, keyResultsByGoal: cache });
    await enableLink(wrapper);

    wrapper.findAllComponents(SelectStub)[0].vm.$emit('update:modelValue', 'goal-a');
    await flushPromises();

    expect(wrapper.text()).toContain('This goal has no key results');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
  });
});
