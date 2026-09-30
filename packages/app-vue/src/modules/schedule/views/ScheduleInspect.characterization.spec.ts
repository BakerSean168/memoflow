import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import { asInstant } from '@memoflow/time';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import ScheduleCalendarView from './ScheduleCalendarView.vue';
import EventDetailSheet from '../components/EventDetailSheet.vue';

const commands = vi.hoisted(() => ({
  updateCalendarEntry: vi.fn(),
  createCalendarEntry: vi.fn(),
  rescheduleOccurrence: vi.fn(),
  completeOccurrence: vi.fn(),
  updateGoal: vi.fn(),
}));
vi.mock('../composables/useSchedule', () => ({ useSchedule: () => commands }));
vi.mock('../../task/composables/useTask', () => ({ useTask: () => commands }));
vi.mock('../composables/useCalendarView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../composables/useCalendarView')>()),
  useCalendarView: () => ({
    projections: ref([]),
    conflicts: ref([]),
    isLoading: ref(false),
    fetchForRange: vi.fn(),
    windowStart: ref(null),
    windowEnd: ref(null),
  }),
}));
vi.mock('../../../layouts/shell/usePanelSurfaceStatus', () => ({ usePanelSurfaceStatus: vi.fn() }));
enableAutoUnmount(afterEach);
beforeEach(() => {
  const profile = createDefaultUserPreferenceProfile();
  setProductTimePreferences({ ...profile, regional: { ...profile.regional, timeZone: 'UTC' } });
});
afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));

const projection: CalendarEventProjection = {
  identityId: 'owner',
  sourceType: 'schedule',
  sourceId: 'entry-1',
  title: 'Deep work',
  start: asInstant(Date.parse('2026-09-30T09:00:00Z')),
  end: asInstant(Date.parse('2026-09-30T10:00:00Z')),
  allDay: false,
  occupancy: 'blocking',
  displayMetadata: { semantic: 'calendar-entry', subtitle: 'Focus time' },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'entry-1' },
  revision: 3,
};
const planner = defineComponent({
  name: 'PlannerCalendar',
  emits: ['event-click'],
  setup:
    (_, { emit }) =>
    () =>
      h(
        'button',
        { 'data-testid': 'entry-click', onClick: () => emit('event-click', projection) },
        'Deep work',
      ),
});
const sheet = defineComponent({
  name: 'SheetStub',
  props: ['open'],
  emits: ['update:open'],
  setup:
    (props, { slots, emit }) =>
    () =>
      props.open
        ? h('aside', [
            slots.default?.(),
            h(
              'button',
              { 'data-testid': 'close-inspect', onClick: () => emit('update:open', false) },
              'Close',
            ),
          ])
        : null,
});

describe('Schedule CalendarEntry inspect — PVC-BASE-002', () => {
  it.each(['calendar', 'day-sheet'])(
    'opens read-only details from %s and closes without owner mutations',
    async (source) => {
      vi.clearAllMocks();
      const wrapper = mount(ScheduleCalendarView, {
        global: {
          plugins: [
            createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
          ],
          provide: { [GOAL_SERVICE_KEY as symbol]: { updateGoal: commands.updateGoal } },
          stubs: {
            PlannerCalendar: planner,
            DayDetailSheet: true,
            TaskEventActionPanel: true,
            CreateScheduleDialog: true,
            Sheet: sheet,
            SheetContent: { template: '<div><slot /></div>' },
            SheetTitle: { template: '<h2><slot /></h2>' },
            SheetDescription: { template: '<p><slot /></p>' },
          },
        },
      });
      expect(wrapper.getComponent(EventDetailSheet).props('open')).toBe(false);
      if (source === 'calendar') await wrapper.get('[data-testid="entry-click"]').trigger('click');
      else wrapper.getComponent({ name: 'DayDetailSheet' }).vm.$emit('event-click', projection);
      await flushPromises();
      const detail = wrapper.getComponent(EventDetailSheet);
      expect(detail.props('open')).toBe(true);
      expect(detail.props('event')).toEqual(projection);
      expect(detail.text()).toContain('Deep work');
      expect(detail.text()).toContain('Focus time');
      expect(detail.text()).toContain('09:00');
      expect(detail.text()).toContain('10:00');
      expect(detail.text()).toContain(
        productionLocaleMessages['en-US'].schedule.eventDetail.readOnlyHint,
      );
      expect(detail.findAll('input, textarea, select, [contenteditable="true"]')).toHaveLength(0);
      expect(detail.findAll('button').map((button) => button.text())).toEqual(['Close']);
      await detail.get('[data-testid="close-inspect"]').trigger('click');
      expect(detail.props('open')).toBe(false);
      for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
      expect(wrapper.getComponent({ name: 'TaskEventActionPanel' }).props('open')).toBe(false);
    },
  );
});
