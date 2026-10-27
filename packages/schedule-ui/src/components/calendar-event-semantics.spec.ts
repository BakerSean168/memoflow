/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import type { CalendarEventProjection } from '@memoflow/schedule-contracts';
import PlannerCalendar from '../planner/PlannerCalendar.vue';

const projection: Extract<CalendarEventProjection, { sourceType: 'schedule' }> = {
  identityId: 'identity-1',
  sourceType: 'schedule',
  sourceId: 'schedule-1',
  title: 'Design review',
  start: asInstant(new Date(2026, 7, 3, 10, 0).getTime()),
  end: asInstant(new Date(2026, 7, 3, 11, 0).getTime()),
  allDay: false,
  displayMetadata: { semantic: 'calendar-entry' },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
  revision: 1,
};

function ownerCommands() {
  return { route: vi.fn(async () => ({ status: 'unsupported' as const, message: 'unused' })) };
}

describe('Planner calendar semantic controls', () => {
  it('exposes a canonical event as a keyboard-operable named action', async () => {
    const wrapper = mount(PlannerCalendar, {
      attachTo: document.body,
      props: {
        projections: [projection],
        ownerCommands: ownerCommands(),
        view: 'day',
        initialDate: new Date(2026, 7, 3, 12).getTime(),
      },
    });

    const action = await vi.waitFor(() =>
      wrapper.get('[data-testid="schedule-event-schedule-schedule-1"]'),
    );
    expect(action.attributes('role')).toBe('button');
    expect(action.attributes('tabindex')).toBe('0');
    expect(action.attributes('aria-label')).toBe('Design review');

    await action.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('event-click')?.at(-1)).toEqual([projection]);
    wrapper.unmount();
  });

  it('preserves stable date-cell selectors in Month while FullCalendar owns grid geometry', async () => {
    const wrapper = mount(PlannerCalendar, {
      attachTo: document.body,
      props: {
        projections: [projection],
        ownerCommands: ownerCommands(),
        view: 'month',
        initialDate: new Date(2026, 7, 3, 12).getTime(),
      },
    });

    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="schedule-day-2026-08-03"]').exists()).toBe(true),
    );
    expect(wrapper.find('[data-testid="schedule-event-schedule-schedule-1"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
