import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMockKeyResult } from '@memoflow/contracts/mocks';
import { productionLocaleMessages } from '../../../locales/production-messages';
import GoalKeyResultDirectControls from './GoalKeyResultDirectControls.vue';
import GoalTimeframePicker from './GoalTimeframePicker.vue';
import { Select } from '@memoflow/ui-vue-shadcn';

enableAutoUnmount(afterEach);

function mountControls(disabled = false) {
  const onSave = vi.fn().mockResolvedValue(false);
  const wrapper = mount(GoalKeyResultDirectControls, {
    attachTo: document.body,
    props: {
      keyResult: createMockKeyResult({
        id: 'kr-1' as never,
        title: 'Distance',
        description: null,
        weight: 2,
        target: null,
        progress: {
          aggregationMethod: 'Sum',
          initialValue: 0,
          currentValue: 2,
          targetValue: 10,
          unit: 'km',
        },
      }),
      goalTarget: { kind: 'quarter', year: 2026, quarter: 4 },
      disabled,
      onSave,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
    },
  });
  return { wrapper, onSave };
}

describe('Goal-owned KR property controls with real primitives', () => {
  it('provides named native controls and inherits the Goal timeframe', () => {
    const { wrapper } = mountControls();
    const title = wrapper.get('[data-testid="goal-kr-title-kr-1"]');
    expect(title.element.tagName).toBe('TEXTAREA');
    expect(title.attributes('aria-label')).toBeTruthy();
    expect(
      wrapper.get('[data-testid="goal-kr-description-kr-1"]').attributes('aria-label'),
    ).toBeTruthy();
    for (const property of ['method', 'weight', 'timeframe']) {
      const trigger = wrapper.get(`[data-testid="goal-kr-${property}-kr-1"]`);
      expect(trigger.element.tagName).toBe('BUTTON');
      expect(trigger.attributes('aria-label')).toBeTruthy();
    }
    expect(wrapper.get('[data-testid="goal-kr-timeframe-kr-1"]').text()).toBe('2026 Q4');
    expect(wrapper.find('input[type="number"]').exists()).toBe(false);
  });

  it('opens the real method menu with Enter and renders the five canonical options', async () => {
    const { wrapper } = mountControls();
    const trigger = wrapper.get('[data-testid="goal-kr-method-kr-1"]');
    await trigger.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    const options = Array.from(document.body.querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Cumulative',
      'Average',
      'Maximum',
      'Minimum',
      'Latest',
    ]);
  });

  it('selects weight in the real popover without retaining a failed value', async () => {
    const { wrapper, onSave } = mountControls();
    await wrapper.get('[data-testid="goal-kr-weight-kr-1"]').trigger('click');
    await flushPromises();
    const option = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="goal-kr-weight-kr-1-option-5"]',
    )!;
    expect(option.tagName).toBe('BUTTON');
    option.click();
    await flushPromises();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ weight: 5 });
    expect(wrapper.get('[data-testid="goal-kr-weight-kr-1"]').text()).toBe('2');
  });

  it('retains authoritative method/timeframe after failed changes', async () => {
    const { wrapper, onSave } = mountControls();
    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'Last');
    await flushPromises();
    expect(onSave).toHaveBeenLastCalledWith({ calculationMethod: 'Last' });
    expect(wrapper.get('[data-testid="goal-kr-method-kr-1"]').text()).toBe('Cumulative');
    wrapper
      .findComponent(GoalTimeframePicker)
      .vm.$emit('update:modelValue', { kind: 'year', year: 2027 });
    await flushPromises();
    expect(onSave).toHaveBeenLastCalledWith({ target: { kind: 'year', year: 2027 } });
    expect(wrapper.get('[data-testid="goal-kr-timeframe-kr-1"]').text()).toBe('2026 Q4');
  });

  it('blocks every property while busy and rejects synthetic updates', async () => {
    const { wrapper, onSave } = mountControls(true);
    for (const field of ['title', 'description', 'method', 'weight', 'timeframe']) {
      expect(
        wrapper.get(`[data-testid="goal-kr-${field}-kr-1"]`).attributes('disabled'),
      ).toBeDefined();
    }
    wrapper.findComponent(Select).vm.$emit('update:modelValue', 'Last');
    wrapper.findComponent(GoalTimeframePicker).vm.$emit('update:modelValue', null);
    await flushPromises();
    expect(onSave).not.toHaveBeenCalled();
  });
});
