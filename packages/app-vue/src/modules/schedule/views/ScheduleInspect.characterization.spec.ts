import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import { asInstant } from '@memoflow/time';
import type {
  CalendarEntryClientDTO,
  CalendarEventProjection,
  CreateScheduleRequest,
} from '@memoflow/contracts/schedule';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import ScheduleCalendarView from './ScheduleCalendarView.vue';
import PlannerDayDialog from '../components/PlannerDayDialog.vue';
import { toast } from 'vue-sonner';
import PlannerEventDialog from '../components/PlannerEventDialog.vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  narrow: false,
  scheduleError: { value: null as string | null },
  fetchForRange: vi.fn(),
  calendarEntries: { value: [] as CalendarEntryClientDTO[] },
  updateCalendarEntry: vi.fn(),
  createCalendarEntry: vi.fn(),
  deleteCalendarEntry: vi.fn(),
  rescheduleOccurrence: vi.fn(),
  completeOccurrence: vi.fn(),
  updateGoal: vi.fn(),
}));

vi.mock('../../../layouts/shell/usePanelWidth', () => ({
  usePanelWidth: () => ({ isNarrow: ref(mocks.narrow) }),
}));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>()),
  useConfirm: mocks.confirm,
}));
vi.mock('../composables/useSchedule', () => ({
  useSchedule: () => ({
    calendarEntries: mocks.calendarEntries,
    error: mocks.scheduleError,
    updateCalendarEntry: mocks.updateCalendarEntry,
    createCalendarEntry: mocks.createCalendarEntry,
    deleteCalendarEntry: mocks.deleteCalendarEntry,
  }),
}));
vi.mock('../../task/composables/useTask', () => ({
  useTask: () => ({
    rescheduleOccurrence: mocks.rescheduleOccurrence,
    completeOccurrence: mocks.completeOccurrence,
  }),
}));
vi.mock('../composables/useCalendarView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../composables/useCalendarView')>()),
  useCalendarView: () => ({
    projections: ref([]),
    conflicts: ref([]),
    isLoading: ref(false),
    fetchForRange: mocks.fetchForRange,
    windowStart: ref(1),
    windowEnd: ref(2),
  }),
}));
vi.mock('../../../layouts/shell/usePanelSurfaceStatus', () => ({
  usePanelSurfaceStatus: vi.fn(),
}));

enableAutoUnmount(afterEach);

const entry = {
  id: 'entry-1',
  identityId: 'owner',
  title: 'Deep work',
  description: 'Focus block',
  range: {
    kind: 'Timed',
    start: asInstant(Date.parse('2026-09-30T09:00:00Z')),
    end: asInstant(Date.parse('2026-09-30T10:00:00Z')),
  },
  location: 'Desk',
  attendees: [],
  version: 3,
  createdAt: Date.parse('2026-09-29T09:00:00Z'),
  updatedAt: Date.parse('2026-09-29T09:00:00Z'),
} as unknown as CalendarEntryClientDTO;

const projection: CalendarEventProjection = {
  identityId: 'owner',
  sourceType: 'schedule',
  sourceId: 'entry-1',
  title: 'Deep work',
  start: asInstant(Date.parse('2026-09-30T09:00:00Z')),
  end: asInstant(Date.parse('2026-09-30T10:00:00Z')),
  allDay: false,
  occupancy: 'blocking',
  displayMetadata: { semantic: 'calendar-entry', subtitle: 'Desk' },
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

const shell = defineComponent({
  name: 'ProductDialogShell',
  props: ['open'],
  setup:
    (props, { slots }) =>
    () =>
      props.open
        ? h('section', [
            slots.title?.(),
            slots.description?.(),
            slots.default?.(),
            slots.footer?.(),
          ])
        : null,
});

const dialog = defineComponent({
  name: 'DialogStub',
  props: ['open'],
  emits: ['update:open'],
  setup:
    (props, { slots }) =>
    () =>
      props.open ? h('div', { 'data-testid': 'dialog-stub' }, slots.default?.()) : null,
});

const createDialog = defineComponent({
  name: 'CreateScheduleDialog',
  props: ['modelValue', 'schedule', 'initialRange', 'onSubmit'],
  emits: ['update:modelValue'],
  setup: (props) => () =>
    props.modelValue
      ? h(
          'div',
          { 'data-testid': 'create-schedule-dialog-stub' },
          props.schedule?.title ?? 'Create',
        )
      : null,
});

function mountView() {
  return mount(ScheduleCalendarView, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages })],
      provide: { [GOAL_SERVICE_KEY as symbol]: { updateGoal: mocks.updateGoal } },
      stubs: {
        PlannerCalendar: planner,
        PlannerDayDialog: true,
        TaskEventActionPanel: true,
        CreateScheduleDialog: createDialog,
        Dialog: dialog,
        Sheet: dialog,
        SheetTitle: { template: '<h2><slot /></h2>' },
        SheetDescription: { template: '<p><slot /></p>' },
        SheetContent: defineComponent({
          setup:
            (_, { slots }) =>
            () =>
              h('section', slots.default?.()),
        }),
        ProductDialogShell: shell,
      },
    },
  });
}

describe('Schedule CalendarEntry inspect — SCHED-4201', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.narrow = false;
    mocks.scheduleError.value = null;
    mocks.fetchForRange.mockResolvedValue(undefined);
    mocks.calendarEntries.value = [entry];
    mocks.confirm.mockResolvedValue(true);
    mocks.deleteCalendarEntry.mockResolvedValue(true);
    mocks.updateCalendarEntry.mockResolvedValue({ ok: true, data: { ...entry, version: 4 } });
    mocks.createCalendarEntry.mockResolvedValue(entry);
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({ ...profile, regional: { ...profile.regional, timeZone: 'UTC' } });
  });

  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));

  it.each(['calendar', 'day-dialog'])(
    'opens the shared dialog from %s without owner mutation',
    async (source) => {
      const wrapper = mountView();
      expect(wrapper.getComponent(PlannerEventDialog).props('open')).toBe(false);

      if (source === 'calendar') await wrapper.get('[data-testid="entry-click"]').trigger('click');
      else wrapper.getComponent({ name: 'PlannerDayDialog' }).vm.$emit('event-click', projection);
      await flushPromises();

      const detail = wrapper.getComponent(PlannerEventDialog);
      expect(detail.props('open')).toBe(true);
      expect(detail.props('event')).toEqual(projection);
      expect(detail.text()).toContain('Deep work');
      expect(detail.text()).toContain('09:00');
      expect(detail.text()).toContain('10:00');
      expect(detail.find('[data-testid="planner-event-edit"]').exists()).toBe(true);
      expect(detail.find('[data-testid="planner-event-delete"]').exists()).toBe(true);
      expect(mocks.updateCalendarEntry).not.toHaveBeenCalled();
      expect(mocks.deleteCalendarEntry).not.toHaveBeenCalled();
      expect(wrapper.getComponent({ name: 'TaskEventActionPanel' }).props('open')).toBe(false);
    },
  );

  it('reuses CreateScheduleDialog edit mode and sends the current version to the owner command', async () => {
    const wrapper = mountView();
    await wrapper.get('[data-testid="entry-click"]').trigger('click');
    await flushPromises();

    wrapper.getComponent(PlannerEventDialog).vm.$emit('edit', projection);
    await flushPromises();

    const editor = wrapper.getComponent({ name: 'CreateScheduleDialog' });
    expect(editor.props('modelValue')).toBe(true);
    expect(editor.props('schedule')).toEqual(entry);

    const request: CreateScheduleRequest = {
      name: 'Deep work updated',
      description: 'Focus block',
      range: entry.range,
      location: 'Library',
      attendees: [],
      autoDetectConflicts: true,
    };
    await expect(editor.props('onSubmit')(request)).resolves.toBe(true);

    expect(mocks.updateCalendarEntry).toHaveBeenCalledWith('entry-1', {
      name: 'Deep work updated',
      description: 'Focus block',
      range: entry.range,
      location: 'Library',
      attendees: [],
      expectedVersion: 3,
    });
    await editor.props('onSubmit')({
      ...request,
      description: undefined,
      location: undefined,
      attendees: undefined,
    });
    expect(mocks.updateCalendarEntry).toHaveBeenLastCalledWith(
      'entry-1',
      expect.objectContaining({ description: '', location: '', attendees: [], expectedVersion: 3 }),
    );
    expect(mocks.createCalendarEntry).not.toHaveBeenCalled();
  });

  it('confirms and deletes a CalendarEntry through the Schedule owner command', async () => {
    const wrapper = mountView();
    await wrapper.get('[data-testid="entry-click"]').trigger('click');
    await flushPromises();

    wrapper.getComponent(PlannerEventDialog).vm.$emit('delete', projection);
    await flushPromises();

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(mocks.deleteCalendarEntry).toHaveBeenCalledWith('entry-1', 3);
    expect(wrapper.getComponent(PlannerEventDialog).props('open')).toBe(false);
  });
  it.each(['missing', 'stale'])(
    'rejects %s inspect actions with deterministic feedback',
    async (kind) => {
      mocks.calendarEntries.value = kind === 'missing' ? [] : [{ ...entry, version: 4 }];
      mocks.fetchForRange.mockRejectedValue(new Error('owner refresh failed'));
      const wrapper = mountView();
      const detail = wrapper.getComponent(PlannerEventDialog);
      detail.vm.$emit('edit', projection);
      detail.vm.$emit('delete', projection);
      await flushPromises();
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no longer available'));
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringContaining('latest schedule could not'),
      );
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.updateCalendarEntry).not.toHaveBeenCalled();
      expect(mocks.deleteCalendarEntry).not.toHaveBeenCalled();
    },
  );

  it('preserves inspect after cancellation and failed delete', async () => {
    const wrapper = mountView();
    await wrapper.get('[data-testid="entry-click"]').trigger('click');
    const detail = wrapper.getComponent(PlannerEventDialog);
    mocks.confirm.mockResolvedValueOnce(false);
    detail.vm.$emit('delete', projection);
    await flushPromises();
    expect(mocks.deleteCalendarEntry).not.toHaveBeenCalled();
    mocks.deleteCalendarEntry.mockResolvedValueOnce(false);
    detail.vm.$emit('delete', projection);
    await flushPromises();
    expect(detail.props('open')).toBe(true);
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('rechecks the version after destructive confirmation', async () => {
    mocks.confirm.mockImplementation(async () => {
      mocks.calendarEntries.value = [{ ...entry, version: 4 }];
      return true;
    });
    const wrapper = mountView();
    wrapper.getComponent(PlannerEventDialog).vm.$emit('delete', projection);
    await flushPromises();
    expect(mocks.deleteCalendarEntry).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it.each(['create', 'update', 'delete'])(
    'reports committed %s plus refresh warning without false failure',
    async (command) => {
      mocks.fetchForRange.mockRejectedValue(new Error('refresh failed'));
      const wrapper = mountView();
      const detail = wrapper.getComponent(PlannerEventDialog);
      if (command === 'delete') {
        detail.vm.$emit('delete', projection);
        await flushPromises();
        expect(detail.props('open')).toBe(false);
      } else {
        if (command === 'update') detail.vm.$emit('edit', projection);
        await flushPromises();
        const saved = await wrapper
          .getComponent({ name: 'CreateScheduleDialog' })
          .props('onSubmit')({ name: entry.title, range: entry.range });
        expect(saved).toBe(true);
      }
      expect(toast.success).toHaveBeenCalledOnce();
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('could not refresh'));
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it('warns when the Schedule owner read reports a refresh failure without rejecting', async () => {
    mocks.fetchForRange.mockImplementation(async () => {
      mocks.scheduleError.value = 'Owner read failed';
    });
    const wrapper = mountView();
    const saved = await wrapper.getComponent({ name: 'CreateScheduleDialog' }).props('onSubmit')({
      name: entry.title,
      range: entry.range,
    });
    expect(saved).toBe(true);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('could not refresh'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps an edit draft on owner rejection or owner facts changing during editing', async () => {
    const wrapper = mountView();
    wrapper.getComponent(PlannerEventDialog).vm.$emit('edit', projection);
    await flushPromises();
    const editor = wrapper.getComponent({ name: 'CreateScheduleDialog' });
    const request = { name: entry.title, range: entry.range };
    mocks.updateCalendarEntry.mockResolvedValueOnce({
      ok: false,
      error: { code: 'VERSION_CONFLICT' },
    });
    expect(await editor.props('onSubmit')(request)).toBe(false);
    expect(editor.props('modelValue')).toBe(true);
    mocks.calendarEntries.value = [{ ...entry, version: 4 }];
    expect(await editor.props('onSubmit')(request)).toBe(false);
    expect(mocks.updateCalendarEntry).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each(['goal', 'routine', 'task'] as const)(
    'preserves %s inspect routing without Schedule CRUD',
    async (sourceType) => {
      const wrapper = mountView();
      const event = { ...projection, sourceType };
      wrapper.getComponent({ name: 'PlannerDayDialog' }).vm.$emit('event-click', event);
      await flushPromises();
      const detail = wrapper.getComponent(PlannerEventDialog);
      if (sourceType === 'task') {
        expect(wrapper.getComponent({ name: 'TaskEventActionPanel' }).props('open')).toBe(true);
        wrapper
          .getComponent({ name: 'TaskEventActionPanel' })
          .vm.$emit('complete-task', 'occurrence-1');
        await flushPromises();
        expect(mocks.completeOccurrence).toHaveBeenCalledWith('occurrence-1');
      } else {
        expect(detail.props('open')).toBe(true);
        expect(detail.find('[data-testid="planner-event-edit"]').exists()).toBe(false);
        expect(detail.find('[data-testid="planner-event-delete"]').exists()).toBe(false);
      }
      expect(mocks.updateCalendarEntry).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])('shares day/event bodies and actions in narrow=%s', async (narrow) => {
    mocks.narrow = narrow;
    const wrapper = mountView();
    await wrapper.get('[data-testid="entry-click"]').trigger('click');
    expect(wrapper.get('[data-testid="event-detail-properties"]').text()).toContain('09:00');
    await wrapper.get('[data-testid="planner-event-edit"]').trigger('click');
    expect(wrapper.getComponent({ name: 'CreateScheduleDialog' }).props('schedule')).toEqual(entry);
    const day = mount(PlannerDayDialog, {
      props: { open: true, date: new Date(projection.start), events: [projection] },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
        ],
        stubs: {
          Dialog: dialog,
          Sheet: dialog,
          SheetTitle: { template: '<h2><slot /></h2>' },
          SheetDescription: { template: '<p><slot /></p>' },
          ProductDialogShell: shell,
          SheetContent: defineComponent({
            setup:
              (_, { slots }) =>
              () =>
                h('section', slots.default?.()),
          }),
        },
      },
    });
    await day.get('[data-testid="planner-day-event-list"] button').trigger('click');
    expect(day.emitted('event-click')?.[0]).toEqual([projection]);
    expect(day.text()).toContain('09:00');
  });
});
