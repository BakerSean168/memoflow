import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import GoalKeyResultTrajectoryPlot from './GoalKeyResultTrajectoryPlot.vue';

enableAutoUnmount(afterEach);

function mountPlot(
  initialValue: number,
  currentValue: number,
  targetValue: number | '',
  readonly = true,
) {
  return mount(GoalKeyResultTrajectoryPlot, {
    props: {
      initialValue,
      currentValue,
      targetValue,
      readonly,
      unit: 'kg',
      startLabel: 'Sep 2026',
      currentLabel: 'Sep 30, 2026',
      targetLabel: 'Q4 2026',
      checkInLabel: 'Add record: Weight',
      checkInTestId: 'check-in',
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
    },
  });
}

describe('Goal-owned read-only trajectory', () => {
  it.each([
    { name: 'increasing', initial: 10, current: 30, target: 50, direction: 'up' },
    { name: 'decreasing', initial: 100, current: 60, target: 20, direction: 'down' },
    { name: 'unchanged', initial: 10, current: 10, target: 10, direction: 'flat' },
    { name: 'negative', initial: -50, current: -30, target: -10, direction: 'up' },
    { name: 'overshoot', initial: 10, current: 60, target: 50, direction: 'up' },
  ])('uses the editor geometry for $name values', ({ initial, current, target, direction }) => {
    const summary = mountPlot(initial, current, target);
    const editor = mountPlot(initial, current, target, false);
    const actual = summary.findAll('svg line')[1]!;
    const remaining = summary.findAll('svg line')[2]!;
    expect(actual.attributes()).toEqual(editor.findAll('svg line')[1]!.attributes());
    expect(remaining.attributes()).toEqual(editor.findAll('svg line')[2]!.attributes());
    const initialY = Number(actual.attributes('y1'));
    const currentY = Number(actual.attributes('y2'));
    if (direction === 'up') expect(currentY).toBeLessThan(initialY);
    if (direction === 'down') expect(currentY).toBeGreaterThan(initialY);
    if (direction === 'flat') expect(currentY).toBe(initialY);
    if (target > current) expect(Number(remaining.attributes('y2'))).toBeLessThan(currentY);
    if (target < current) expect(Number(remaining.attributes('y2'))).toBeGreaterThan(currentY);
    expect(remaining.attributes('stroke-dasharray')).toBe('4.5 4.5');
    expect(summary.find('input').exists()).toBe(false);
    expect(summary.get('svg').attributes('aria-hidden')).toBe('true');
    expect(summary.findAll('dt').map((label) => label.text())).toEqual([
      'Initial',
      'Current',
      'Target',
    ]);
  });

  it('keeps Current as the only plot action and emits check-in without value updates', async () => {
    const wrapper = mountPlot(10, 30, 50);
    const button = wrapper.get('button');
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe('Add record: Weight: 30 kg');
    expect(button.text()).toBe('30 kg');
    await button.trigger('click');
    expect(wrapper.emitted('check-in')).toEqual([[]]);
    expect(wrapper.emitted('update:currentValue')).toBeUndefined();
    expect(wrapper.emitted('update:initialValue')).toBeUndefined();
    expect(wrapper.emitted('update:targetValue')).toBeUndefined();
  });

  it('shows unset target and empty unit without a placeholder unit', async () => {
    const wrapper = mountPlot(0, 0, '');
    await wrapper.setProps({ unit: '' });
    expect(wrapper.get('[data-testid="kr-target-value"]').text()).toBe('—');
    expect(wrapper.get('[data-testid="kr-initial-value"]').text()).toBe('0');
    expect(wrapper.get('button').text()).toBe('0');
    expect(wrapper.find('[data-testid="kr-trajectory-unit"]').exists()).toBe(false);
    expect(wrapper.findAll('svg circle').at(-1)!.attributes('fill')).toBe('none');
  });

  it('preserves the default editable plot and its value update contract', async () => {
    const wrapper = mountPlot(10, 30, 50, false);
    expect(wrapper.find('[data-testid="kr-trajectory-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kr-trajectory-summary"]').exists()).toBe(false);
    expect(wrapper.findAll('input')).toHaveLength(3);
    await wrapper.get('[data-testid="draft-kr-current-input"]').setValue('35');
    expect(wrapper.emitted('update:currentValue')).toEqual([[35]]);
    expect(wrapper.emitted('check-in')).toBeUndefined();
  });
});
