import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductTimePicker from './ProductTimePicker.vue';

function mountPicker(modelValue = '07:45', disabled = false) {
  return mount(ProductTimePicker, { props: { modelValue, disabled }, attachTo: document.body });
}

function mountControlledPicker(initial = '07:45') {
  const ControlledParent = defineComponent({
    components: { ProductTimePicker },
    setup() {
      const time = ref(initial);
      return { time };
    },
    template: '<ProductTimePicker v-model="time" />',
  });
  return mount(ControlledParent, { attachTo: document.body });
}

describe('ProductTimePicker wall clock', () => {
  it('renders and updates controlled Hm without emitting on mount or prop changes', async () => {
    const wrapper = mountPicker();
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('07');
    expect(wrapper.findAll('input')[1]!.element.value).toBe('45');
    await wrapper.setProps({ modelValue: '23:59' });
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('23');
    expect(wrapper.findAll('input')[1]!.element.value).toBe('59');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('pads single-digit draft only on blur/commit rather than immediately while typing', async () => {
    const wrapper = mountPicker();
    const hour = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-hour"]');
    const minute = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-minute"]');

    await hour.setValue('8');
    expect(hour.element.value).toBe('8');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    await hour.trigger('blur');
    expect(hour.element.value).toBe('08');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['08:45']);

    await wrapper.setProps({ modelValue: '08:45' });
    await minute.setValue('3');
    expect(minute.element.value).toBe('3');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['08:45']);

    await minute.trigger('blur');
    expect(minute.element.value).toBe('03');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['08:03']);
    wrapper.unmount();
  });

  it('allows typing 1 -> 13 and 2 -> 23 with controlled v-model writeback to produce 13:23', async () => {
    const wrapper = mountControlledPicker('07:45');
    const hour = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-hour"]');
    const minute = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-minute"]');

    await hour.trigger('focus');
    await hour.setValue('1');
    expect(hour.element.value).toBe('1');
    expect(wrapper.vm.time).toBe('07:45');

    await hour.setValue('13');
    await nextTick();
    expect(wrapper.vm.time).toBe('13:45');
    expect(document.activeElement).toBe(minute.element);

    await minute.setValue('2');
    expect(minute.element.value).toBe('2');
    expect(wrapper.vm.time).toBe('13:45');

    await minute.setValue('23');
    expect(wrapper.vm.time).toBe('13:23');
    expect(document.activeElement).toBe(minute.element);
    wrapper.unmount();
  });

  it('handles 00:00 and 23:59 boundaries, pasting HH:mm, and Enter/commitDraft', async () => {
    const wrapper = mountControlledPicker('07:45');
    const hour = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-hour"]');

    await hour.trigger('paste', {
      clipboardData: { getData: () => '00:00' },
    });
    expect(wrapper.vm.time).toBe('00:00');

    await hour.setValue('23');
    await wrapper.findAll('input')[1]!.setValue('59');
    expect(wrapper.vm.time).toBe('23:59');

    await hour.setValue('9');
    await hour.trigger('keydown', { key: 'Enter' });
    expect(wrapper.vm.time).toBe('09:59');
    wrapper.unmount();
  });

  it.each(['', '24', '-1', 'ab', '1.5', '123'])('rejects invalid hour draft %j', async (draft) => {
    const wrapper = mountPicker();
    await wrapper.get('input').setValue(draft);
    await wrapper.findAll('input')[1]!.setValue('10');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
    wrapper.unmount();
  });

  it('rejects invalid minutes and second precision', async () => {
    const wrapper = mountPicker();
    for (const draft of ['60', '45:30', 'x', '']) {
      await wrapper.findAll('input')[1]!.setValue(draft);
    }
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
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
      wrapper.unmount();
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
    wrapper.unmount();
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
      wrapper.unmount();
    },
  );

  it('steps and wraps each wall-clock part with arrow keys', async () => {
    const wrapper = mountPicker('23:59');
    await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['00:59']);
    await wrapper.setProps({ modelValue: '00:59' });
    await wrapper.findAll('input')[1]!.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['00:00']);
    await wrapper.setProps({ modelValue: '00:00' });
    await wrapper.findAll('input')[1]!.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['00:59']);
    wrapper.unmount();
  });

  it('supports ArrowLeft, ArrowRight, and Backspace navigation between segments', async () => {
    const wrapper = mountControlledPicker('07:45');
    const hour = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-hour"]');
    const minute = wrapper.get<HTMLInputElement>('[data-testid="product-time-picker-minute"]');

    hour.element.focus();
    hour.element.setSelectionRange(2, 2);
    await hour.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(minute.element);

    minute.element.setSelectionRange(0, 0);
    await minute.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(hour.element);

    await minute.setValue('');
    await minute.trigger('keydown', { key: 'Backspace' });
    expect(document.activeElement).toBe(hour.element);
    wrapper.unmount();
  });

  it('disables editing, stepping, and pasting', async () => {
    const wrapper = mountPicker('07:45', true);
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    await wrapper.get('input').trigger('keydown', { key: 'ArrowUp' });
    await wrapper.get('input').trigger('paste', {
      clipboardData: { getData: () => '12:30' },
    });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});
