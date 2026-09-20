// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LabelCommandPanel from './LabelCommandPanel.vue';
import LabelPicker from './LabelPicker.vue';
import type { LabelPickerOption } from './label-selection.types';

const options: LabelPickerOption[] = [
  { id: 'work', name: 'Work', color: '#3b82f6' },
  { id: 'deep', name: 'Deep Work', color: '#8b5cf6' },
  { id: 'health', name: 'Health', color: '#22c55e' },
];

const popoverStubs = {
  Popover: { template: '<div data-stub="popover"><slot /></div>' },
  PopoverTrigger: { template: '<div data-stub="trigger"><slot /></div>' },
  PopoverContent: { template: '<div data-stub="content"><slot /></div>' },
};

describe('LabelPicker (UI-5101)', () => {
  it('renders a narrow controlled summary without leaking domain DTOs', () => {
    const wrapper = mount(LabelPicker, {
      props: {
        modelValue: ['work', 'deep', 'health'],
        options,
        compact: true,
      },
      global: { stubs: popoverStubs },
    });

    const trigger = wrapper.get('[data-testid="label-picker-trigger"]');
    expect(trigger.attributes('role')).toBe('combobox');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.text()).toContain('Work');
    expect(trigger.text()).toContain('+2');
    expect(trigger.text()).not.toContain('Deep Work');
    expect(trigger.classes()).toContain('rounded-md');
    expect(trigger.classes()).toContain('bg-muted/40');
    expect(trigger.classes()).not.toContain('rounded-full');
  });

  it('forwards controlled multi-select changes and create intent without mutating options', async () => {
    const wrapper = mount(LabelPicker, {
      props: { modelValue: ['work'], options },
      global: { stubs: popoverStubs },
    });
    const panel = wrapper.getComponent(LabelCommandPanel);

    panel.vm.$emit('update:modelValue', ['work', 'deep']);
    panel.vm.$emit('create', 'New Label');

    expect(wrapper.emitted('update:modelValue')).toEqual([[['work', 'deep']]]);
    expect(wrapper.emitted('create')).toEqual([['New Label']]);
    expect(wrapper.props('options')).toEqual(options);
  });
});
