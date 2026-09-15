import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { asInstant } from '@memoflow/time';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import PlannerCalendar from './PlannerCalendar.vue';
import { setProductTimePreferences } from '../../../shared/utils/product-time';

const scheduleProjection: Extract<CalendarEventProjection, { sourceType: 'schedule' }> = {
  identityId: 'identity-1',
  sourceType: 'schedule',
  sourceId: 'calendar-entry-1',
  title: 'Deep work',
  start: asInstant(Date.parse('2026-08-27T02:00:00.000Z')),
  end: asInstant(Date.parse('2026-08-27T03:00:00.000Z')),
  allDay: false,
  displayMetadata: { semantic: 'calendar-entry' },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'calendar-entry-1' },
  revision: 3,
};

describe('PlannerCalendar production renderer (PLAN-4304)', () => {
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));
  it('renders canonical projections and emits the FullCalendar-owned visible range', async () => {
    const wrapper = mount(PlannerCalendar, {
      attachTo: document.body,
      props: {
        projections: [scheduleProjection],
        ownerCommands: {
          route: vi.fn(async () => ({ status: 'unsupported' as const, message: 'unused' })),
        },
        view: 'week',
        initialDate: Date.parse('2026-08-27T12:00:00.000Z'),
      },
    });

    await vi.waitFor(() => expect(wrapper.emitted('range-change')?.length).toBeGreaterThan(0));
    expect(wrapper.find('[data-testid="schedule-fullcalendar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schedule-event-schedule-calendar-entry-1"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain('Deep work');
    expect(wrapper.emitted('range-change')?.at(-1)?.[0]).toEqual(
      expect.objectContaining({ view: 'week' }),
    );

    wrapper.unmount();
  });

  it('emits one semantic range even when projection updates make FullCalendar refresh its options', async () => {
    const wrapper = mount(PlannerCalendar, {
      attachTo: document.body,
      props: {
        projections: [],
        ownerCommands: {
          route: vi.fn(async () => ({ status: 'unsupported' as const, message: 'unused' })),
        },
        view: 'week',
        initialDate: Date.parse('2026-08-27T12:00:00.000Z'),
      },
    });
    await vi.waitFor(() => expect(wrapper.emitted('range-change')?.length).toBeGreaterThan(0));
    const initialRangeEvents = wrapper.emitted('range-change')?.length ?? 0;

    await wrapper.setProps({ projections: [scheduleProjection] });
    await vi.waitFor(() => expect(wrapper.text()).toContain('Deep work'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(wrapper.emitted('range-change')).toHaveLength(initialRangeEvents);
    wrapper.unmount();
  });

  it('switches Day/Week/Month through FullCalendar and reports the new product-visible range', async () => {
    const wrapper = mount(PlannerCalendar, {
      attachTo: document.body,
      props: {
        projections: [],
        ownerCommands: {
          route: vi.fn(async () => ({ status: 'unsupported' as const, message: 'unused' })),
        },
        view: 'week',
        initialDate: Date.parse('2026-08-27T12:00:00.000Z'),
      },
    });
    await vi.waitFor(() => expect(wrapper.emitted('range-change')?.length).toBeGreaterThan(0));

    await wrapper.setProps({ view: 'month' });
    await vi.waitFor(() =>
      expect(wrapper.emitted('range-change')?.at(-1)?.[0]).toEqual(
        expect.objectContaining({ view: 'month' }),
      ),
    );

    await wrapper.setProps({ view: 'day' });
    await vi.waitFor(() =>
      expect(wrapper.emitted('range-change')?.at(-1)?.[0]).toEqual(
        expect.objectContaining({ view: 'day' }),
      ),
    );

    wrapper.unmount();
  });

  it('binds FullCalendar day boundaries to the session IANA timezone across DST', async () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York', weekStartsOn: 0 },
    });

    const wrapper = mount(PlannerCalendar, {
      attachTo: document.body,
      props: {
        projections: [],
        ownerCommands: {
          route: vi.fn(async () => ({ status: 'unsupported' as const, message: 'unused' })),
        },
        view: 'day',
        initialDate: Date.parse('2026-03-08T16:00:00.000Z'),
      },
    });

    await vi.waitFor(() => expect(wrapper.emitted('range-change')?.length).toBeGreaterThan(0));
    const range = wrapper.emitted('range-change')?.at(-1)?.[0] as { start: number; end: number };
    expect(range.start).toBe(Date.parse('2026-03-08T05:00:00.000Z'));
    expect(range.end).toBe(Date.parse('2026-03-09T03:59:59.999Z'));
    wrapper.unmount();
  });

  it('keeps the MemoFlow loading state outside FullCalendar timing ownership', () => {
    const wrapper = mount(PlannerCalendar, {
      props: {
        projections: [],
        ownerCommands: {
          route: vi.fn(async () => ({ status: 'unsupported' as const, message: 'unused' })),
        },
        view: 'week',
        loading: true,
      },
    });

    expect(wrapper.find('[data-testid="schedule-fullcalendar"]').attributes('aria-busy')).toBe(
      'true',
    );
    expect(wrapper.find('[data-testid="schedule-calendar-loading"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
