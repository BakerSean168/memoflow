import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import type {
  CalendarEventItem,
  ScheduleCapsuleSnapshot,
} from '../../../modules/schedule/composables/useCalendarView';
import ScheduleCapsulePreview from './ScheduleCapsulePreview.vue';

const capsuleEvents = ref<CalendarEventItem[]>([]);
const ensureTodayLoaded = vi.fn();
const getScheduleCapsuleSnapshot = vi.fn<() => ScheduleCapsuleSnapshot>();
const useCalendarView = vi.fn(() => ({
  capsuleEvents,
  ensureTodayLoaded,
  getScheduleCapsuleSnapshot,
}));

vi.mock('../../../modules/schedule/composables/useCalendarView', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../modules/schedule/composables/useCalendarView')
  >()),
  useCalendarView: () => useCalendarView(),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: { schedule: 'Schedule' },
      shell: {
        openSchedule: 'Open schedule',
        preview: { allDay: 'All day' },
        schedule: {
          today: 'Today',
          currentTitle: 'Current event',
          nextTitle: 'Next event',
          empty: 'Nothing scheduled today',
          startsIn: 'Starts in {minutes} minutes',
          upcomingTitle: 'Upcoming today',
          moreCount: '{count} more events',
        },
      },
      schedule: {
        source: { schedule: 'Schedule', task: 'Task', goal: 'Goal', routine: 'Routine' },
      },
    },
  },
});

const now = Date.UTC(2026, 8, 28, 9);
const minute = 60_000;

function event(
  id: string,
  offsetMinutes: number,
  overrides: Partial<CalendarEventItem> = {},
): CalendarEventItem {
  return {
    id,
    originalId: `owner-${id}`,
    title: `Event ${id}`,
    startTime: now + offsetMinutes * minute,
    endTime: now + (offsetMinutes + 30) * minute,
    source: 'schedule',
    displayMode: 'timed',
    ...overrides,
  };
}

function mountPreview() {
  return mount(ScheduleCapsulePreview, { global: { plugins: [i18n] } });
}

describe('ScheduleCapsulePreview owner workspace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'UTC' },
    });
    capsuleEvents.value = [];
    ensureTodayLoaded.mockResolvedValue(undefined);
    getScheduleCapsuleSnapshot.mockReturnValue({
      kind: 'empty',
      event: null,
      minutesUntilStart: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    setProductTimePreferences(createDefaultUserPreferenceProfile());
  });

  it('waits for the Calendar owner before taking a snapshot and preserves loading/empty identity', async () => {
    let finishLoading!: () => void;
    ensureTodayLoaded.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishLoading = resolve;
      }),
    );
    const wrapper = mountPreview();
    await wrapper.vm.$nextTick();

    expect(useCalendarView).toHaveBeenCalledTimes(1);
    expect(ensureTodayLoaded).toHaveBeenCalledTimes(1);
    expect(getScheduleCapsuleSnapshot).not.toHaveBeenCalled();
    const shell = wrapper.get('[data-testid="schedule-capsule-preview"]');
    expect(shell.attributes('data-capsule-workspace')).toBe('schedule');
    expect(shell.attributes('data-capsule-preview-shell')).toBe('');
    expect(shell.attributes('style')).toContain('max-height: 30rem');
    expect(wrapper.get('[data-capsule-preview-header]').text()).toContain('Schedule');
    expect(wrapper.get('[data-capsule-preview-header]').text()).toContain('Today');
    const loading = wrapper.get('[data-testid="schedule-capsule-loading"]');
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.findAll('.animate-pulse')).toHaveLength(3);
    expect(wrapper.find('[data-testid="schedule-capsule-empty"]').exists()).toBe(false);
    await wrapper.get('[data-testid="schedule-capsule-view-all"]').trigger('click');
    expect(wrapper.emitted('view-all')).toEqual([[]]);

    finishLoading();
    await flushPromises();
    expect(getScheduleCapsuleSnapshot).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="schedule-capsule-loading"]').exists()).toBe(false);
    const empty = wrapper.get('[data-testid="schedule-capsule-empty"]');
    expect(empty.attributes('data-capsule-preview-state')).toBe('empty');
    expect(empty.text()).toBe('Nothing scheduled today');
    expect(empty.find('svg').exists()).toBe(true);
    expect(wrapper.find('[data-testid="schedule-capsule-primary"]').exists()).toBe(false);
    await wrapper.get('[data-capsule-preview-footer] button').trigger('click');
    expect(wrapper.emitted('view-all')).toEqual([[], []]);
    wrapper.unmount();
  });

  it.each([
    {
      kind: 'current' as const,
      displayMode: 'timed' as const,
      title: 'Current event',
      time: '08:50–09:20',
      minutes: null,
    },
    {
      kind: 'upcoming' as const,
      displayMode: 'timed' as const,
      title: 'Next event',
      time: '09:25–09:55',
      minutes: 25,
    },
    {
      kind: 'current' as const,
      displayMode: 'all-day' as const,
      title: 'Current event',
      time: 'All day',
      minutes: null,
    },
  ])(
    'preserves $kind / $displayMode primary display and owner selection',
    async ({ kind, displayMode, title, time, minutes }) => {
      const primary = event('primary', kind === 'current' ? -10 : 25, {
        displayMode,
        source: 'task',
        taskPlanId: 'plan-1',
      });
      getScheduleCapsuleSnapshot.mockReturnValue({
        kind,
        event: primary,
        minutesUntilStart: minutes,
      });
      const wrapper = mountPreview();
      await flushPromises();

      expect(wrapper.get('[data-testid="schedule-capsule-summary"]').text()).toContain(title);
      const button = wrapper.get('[data-testid="schedule-capsule-primary"]');
      expect(button.text()).toContain(primary.title);
      expect(button.text()).toContain(time);
      expect(button.text()).toContain('Task');
      if (minutes === null) expect(button.text()).not.toContain('Starts in');
      else expect(button.text()).toContain('Starts in 25 minutes');
      await button.trigger('click');
      expect(wrapper.emitted('select')).toEqual([[primary]]);
      await wrapper.get('[data-testid="schedule-capsule-view-all"]').trigger('click');
      expect(wrapper.emitted('view-all')).toEqual([[]]);
      wrapper.unmount();
    },
  );

  it('uses Product Time for event times and the upcoming day boundary', async () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'Asia/Tokyo' },
    });
    const primary = event('primary', 25);
    const sameProductDay = event('same-product-day', 5 * 60);
    const nextProductDay = event('next-product-day', 6 * 60);
    capsuleEvents.value = [nextProductDay, sameProductDay, primary];
    getScheduleCapsuleSnapshot.mockReturnValue({
      kind: 'upcoming',
      event: primary,
      minutesUntilStart: 25,
    });
    const wrapper = mountPreview();
    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-capsule-primary"]').text()).toContain('18:25–18:55');
    expect(wrapper.get('[data-testid="schedule-capsule-event-same-product-day"]').text()).toContain(
      '23:00',
    );
    expect(wrapper.find('[data-testid="schedule-capsule-event-next-product-day"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it('filters to later timed events today, orders and limits them, and selects the owner event', async () => {
    const primary = event('primary', 25);
    const later = [
      event('one', 40, { source: 'goal' }),
      event('two', 50, { source: 'routine' }),
      event('three', 60, { source: 'task' }),
      event('four', 70),
      event('five', 80),
      event('six', 90),
    ];
    capsuleEvents.value = [
      ...later.toReversed(),
      primary,
      event('duplicate', 100, { id: primary.id }),
      event('earlier', 10),
      event('same-start', 25),
      event('all-day', 110, { displayMode: 'all-day' }),
      event('tomorrow', 24 * 60),
      event('yesterday', -24 * 60),
    ];
    getScheduleCapsuleSnapshot.mockReturnValue({
      kind: 'upcoming',
      event: primary,
      minutesUntilStart: 25,
    });
    const wrapper = mountPreview();
    await flushPromises();

    const upcoming = wrapper.get('[data-testid="schedule-capsule-upcoming"]');
    expect(upcoming.findAll('button').map((button) => button.attributes('data-testid'))).toEqual([
      'schedule-capsule-event-one',
      'schedule-capsule-event-two',
      'schedule-capsule-event-three',
      'schedule-capsule-event-four',
    ]);
    expect(upcoming.text()).toContain('Upcoming today');
    expect(wrapper.get('[data-testid="schedule-capsule-more"]').text()).toBe('2 more events');
    const first = wrapper.get('[data-testid="schedule-capsule-event-one"]');
    expect(first.text()).toContain('09:40');
    expect(first.text()).toContain('Event one');
    expect(first.text()).toContain('Goal');
    expect(upcoming.text()).toContain('Routine');
    expect(upcoming.text()).toContain('Task');
    expect(upcoming.text()).toContain('Schedule');
    await first.trigger('click');
    expect(wrapper.emitted('select')).toEqual([[later[0]]]);

    capsuleEvents.value = [primary, later[0]!];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="schedule-capsule-more"]').exists()).toBe(false);
    capsuleEvents.value = [primary];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="schedule-capsule-upcoming"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
