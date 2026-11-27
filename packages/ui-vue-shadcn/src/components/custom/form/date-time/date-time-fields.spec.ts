import { fireEvent, render } from '@testing-library/vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { asHm, asYmd } from '@memoflow/time';
import DateField from './DateField.vue';
import DateTimeField from './DateTimeField.vue';
import DurationField from './DurationField.vue';
import SegmentedTimeInput from './SegmentedTimeInput.vue';
import TimeField from './TimeField.vue';

function lastModelUpdate<T>(emitted: Record<string, unknown[]>): T {
  const events = emitted['update:modelValue'] as unknown[][];
  return events[events.length - 1]?.[0] as T;
}

describe('shared date/time form composites', () => {
  it('exposes a labelled keyboard-focusable date trigger and opens the calendar popover', async () => {
    const view = render(DateField, {
      props: { label: 'Due date', placeholder: 'Choose date', locale: 'en-US' },
    });

    const trigger = view.getByLabelText('Due date');
    expect(trigger.tagName).toBe('BUTTON');
    await fireEvent.click(trigger);
    expect(document.body.textContent).toContain('2026');
  });

  it('emits product Hm values from the native time control', async () => {
    const view = render(TimeField, { props: { label: 'Start time', modelValue: null } });
    const input = view.getByLabelText('Start time') as HTMLInputElement;

    await fireEvent.update(input, '09:30');

    expect(lastModelUpdate(view.emitted())).toBe(asHm('09:30'));
  });

  it('clears wall-clock time when the all-day switch is enabled', async () => {
    const view = render(DateTimeField, {
      props: {
        modelValue: { date: asYmd('2026-08-25'), time: asHm('12:30'), allDay: false },
        allDayLabel: 'All day',
      },
    });

    await fireEvent.click(view.getByLabelText('All day'));

    expect(lastModelUpdate(view.emitted())).toEqual({
      date: asYmd('2026-08-25'),
      time: null,
      allDay: true,
    });
  });

  it('keeps duration generic and reports validation errors through aria-describedby', async () => {
    const view = render(DurationField, {
      props: { label: 'Focus duration', modelValue: null, error: 'Duration is required' },
    });
    const input = view.getByLabelText('Focus duration') as HTMLInputElement;

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(view.getByRole('alert').textContent).toBe('Duration is required');
    await fireEvent.update(input, '40');
    expect(lastModelUpdate(view.emitted())).toBe(40);
  });
});

describe('SegmentedTimeInput', () => {
  function mountControlled(initial = '07:45', withSeconds = false) {
    const Host = defineComponent({
      components: { SegmentedTimeInput },
      setup() {
        const value = ref(initial);
        return { value, withSeconds };
      },
      template: '<SegmentedTimeInput v-model="value" :with-seconds="withSeconds" />',
    });
    return mount(Host, { attachTo: document.body });
  }

  it('isolates draft from controlled writeback for 1 -> 13 and 2 -> 23 -> 13:23', async () => {
    const wrapper = mountControlled('07:45');
    const hour = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-hour"]');
    const minute = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-minute"]');

    await hour.trigger('focus');
    await hour.setValue('1');
    expect(hour.element.value).toBe('1');
    expect(wrapper.vm.value).toBe('07:45');

    await hour.setValue('13');
    await nextTick();
    expect(wrapper.vm.value).toBe('13:45');
    expect(document.activeElement).toBe(minute.element);

    await minute.setValue('2');
    expect(minute.element.value).toBe('2');
    expect(wrapper.vm.value).toBe('13:45');

    await minute.setValue('23');
    expect(wrapper.vm.value).toBe('13:23');
    expect(document.activeElement).toBe(minute.element);
    wrapper.unmount();
  });

  it('pads single-digit values on blur and supports optional seconds mode', async () => {
    const wrapper = mountControlled('07:45:10', true);
    const hour = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-hour"]');
    const minute = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-minute"]');
    const second = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-second"]');

    await hour.setValue('8');
    expect(wrapper.vm.value).toBe('07:45:10');
    await hour.trigger('blur');
    expect(hour.element.value).toBe('08');
    expect(wrapper.vm.value).toBe('08:45:10');

    await minute.setValue('59');
    await nextTick();
    expect(document.activeElement).toBe(second.element);

    await second.setValue('30');
    expect(wrapper.vm.value).toBe('08:59:30');
    expect(document.activeElement).toBe(second.element);
    wrapper.unmount();
  });

  it('supports arrow wrapping, boundary navigation, backspace and full time paste', async () => {
    const wrapper = mountControlled('23:59:59', true);
    const hour = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-hour"]');
    const minute = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-minute"]');
    const second = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-second"]');

    await hour.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.vm.value).toBe('00:59:59');
    await minute.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.vm.value).toBe('00:00:59');
    await second.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.vm.value).toBe('00:00:00');
    await hour.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.vm.value).toBe('23:00:00');

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

    await hour.trigger('paste', {
      clipboardData: { getData: () => '14:05:09' },
    });
    expect(wrapper.vm.value).toBe('14:05:09');
    wrapper.unmount();
  });

  it('keeps normal cursor movement inside a segment when not at edge', async () => {
    const wrapper = mountControlled('12:34');
    const hour = wrapper.get<HTMLInputElement>('[data-testid="segmented-time-input-hour"]');
    hour.element.focus();
    hour.element.setSelectionRange(1, 1);
    await hour.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(hour.element);
    await hour.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(hour.element);
    wrapper.unmount();
  });
});
