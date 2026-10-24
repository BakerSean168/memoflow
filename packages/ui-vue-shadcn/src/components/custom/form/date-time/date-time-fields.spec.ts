import { fireEvent, render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { asHm, asYmd } from '@memoflow/time';
import DateField from './DateField.vue';
import DateTimeField from './DateTimeField.vue';
import DurationField from './DurationField.vue';
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
