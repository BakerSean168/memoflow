import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductTimePicker from './ProductTimePicker.vue';

function mountPicker(modelValue = '07:45', disabled = false) {
  return mount(ProductTimePicker, { props: { modelValue, disabled } });
}

describe('ProductTimePicker wall clock', () => {
  it('renders and updates controlled Hm without emitting on mount or prop changes', async () => {
    const wrapper = mountPicker();
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('07');
    expect(wrapper.findAll('input')[1]!.element.value).toBe('45');
    await wrapper.setProps({ modelValue: '23:59' });
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('23');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('emits exact padded Hm when editing either part', async () => {
    const wrapper = mountPicker();
    await wrapper.get('input').setValue('8');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['08:45']);
    await wrapper.findAll('input')[1]!.setValue('3');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['08:03']);
    await wrapper.findAll('input')[1]!.trigger('blur');
    expect(wrapper.findAll('input')[1]!.element.value).toBe('03');
  });

  it.each(['', '24', '-1', 'ab', '1.5', '123'])('rejects invalid hour draft %j', async (draft) => {
    const wrapper = mountPicker();
    await wrapper.get('input').setValue(draft);
    await wrapper.findAll('input')[1]!.setValue('10');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
  });

  it('rejects invalid minutes and second precision', async () => {
    const wrapper = mountPicker();
    for (const draft of ['60', '45:30', 'x', '']) {
      await wrapper.findAll('input')[1]!.setValue(draft);
    }
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it.each([
    ['hour', 0, '24', '07'],
    ['hour', 0, '', '07'],
    ['minute', 1, '60', '45'],
    ['minute', 1, 'x', '45'],
  ] as const)(
    'restores invalid %s draft %j on blur without emitting',
    async (_, index, draft, committed) => {
      const wrapper = mountPicker();
      const input = wrapper.findAll('input')[index]!;
      await input.setValue(draft);
      expect(input.attributes('aria-invalid')).toBe('true');
      await input.trigger('blur');
      expect(input.element.value).toBe(committed);
      expect(input.attributes('aria-invalid')).toBe('false');
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    },
  );

  it('restores invalid drafts from the latest controlled value without emitting', async () => {
    const wrapper = mountPicker();
    await wrapper.setProps({ modelValue: '18:20' });
    await wrapper.get('input').setValue('24');
    await wrapper.findAll('input')[1]!.setValue('60');
    await wrapper.get('input').trigger('blur');
    await wrapper.findAll('input')[1]!.trigger('blur');
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('18');
    expect(wrapper.findAll('input')[1]!.element.value).toBe('20');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it.each([
    [0, '24', 'ArrowUp', '08:45'],
    [1, '60', 'ArrowDown', '07:44'],
  ] as const)(
    'steps invalid part %s from its committed value',
    async (index, draft, key, expected) => {
      const wrapper = mountPicker();
      const input = wrapper.findAll('input')[index]!;
      await input.setValue(draft);
      await input.trigger('keydown', { key });
      expect(wrapper.emitted('update:modelValue')).toEqual([[expected]]);
    },
  );

  it('steps and wraps each wall-clock part with arrow keys', async () => {
    const wrapper = mountPicker('23:59');
    await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['00:59']);
    await wrapper.findAll('input')[1]!.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['00:00']);
    await wrapper.findAll('input')[1]!.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['00:59']);
  });

  it('disables editing and stepping', async () => {
    const wrapper = mountPicker('07:45', true);
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
