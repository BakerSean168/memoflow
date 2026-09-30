import { createApp, defineComponent, h } from 'vue';
import { createI18n } from 'vue-i18n';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { DEFAULT_USER_PREFERENCE_PROFILE } from '@memoflow/contracts/setting';
import { asInstant, asYmd } from '@memoflow/time';
import PlannerCalendar, {
  type PlannerCalendarView,
} from '@memoflow/app-vue/modules/schedule/planner/PlannerCalendar.vue';
import DayDetailSheet from '@memoflow/app-vue/modules/schedule/components/DayDetailSheet.vue';
import EventDetailSheet from '@memoflow/app-vue/modules/schedule/components/EventDetailSheet.vue';
import ScheduleCapsulePreview from '@memoflow/app-vue/layouts/shell/previews/ScheduleCapsulePreview.vue';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import { setProductTimePreferences } from '@memoflow/app-vue/shared/utils/product-time';
import '../../../src/styles/index.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const surface = params.get('surface') ?? 'calendar';
const view = (params.get('view') ?? 'week') as PlannerCalendarView;
const selectedSource = params.get('source') ?? 'goal';

document.documentElement.lang = locale;
document.documentElement.classList.toggle('dark', theme === 'dark');
setProductTimePreferences({
  ...DEFAULT_USER_PREFERENCE_PROFILE,
  presentation: {
    ...DEFAULT_USER_PREFERENCE_PROFILE.presentation,
    language: locale,
  },
  regional: {
    ...DEFAULT_USER_PREFERENCE_PROFILE.regional,
    timeZone: 'UTC',
  },
});

const projections: CalendarEventProjection[] = [
  {
    identityId: 'acceptance',
    sourceType: 'schedule',
    sourceId: 'entry-1',
    title: 'Deep work / 深度工作',
    start: asInstant(Date.parse('2026-10-01T09:00:00Z')),
    end: asInstant(Date.parse('2026-10-01T10:00:00Z')),
    allDay: false,
    occupancy: 'blocking',
    displayMetadata: { semantic: 'calendar-entry', subtitle: 'Focus block / 专注时间' },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'entry-1' },
    revision: 1,
  },
  {
    identityId: 'acceptance',
    sourceType: 'task',
    sourceId: 'task-occurrence-1',
    title: 'Review task / 复盘任务',
    start: asInstant(Date.parse('2026-10-01T10:30:00Z')),
    end: asInstant(Date.parse('2026-10-01T11:00:00Z')),
    allDay: false,
    occupancy: 'blocking',
    displayMetadata: {
      semantic: 'task-occurrence',
      status: 'Pending',
      subtitle: 'Plan-owned occurrence / 计划实例',
    },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'task-occurrence-1' },
    revision: 1,
  },
  {
    identityId: 'acceptance',
    sourceType: 'goal',
    sourceId: 'goal-1:target',
    title: 'Goal target / 目标节点',
    start: asYmd('2026-10-01'),
    end: null,
    allDay: true,
    occupancy: 'marker',
    displayMetadata: { semantic: 'goal-target', subtitle: 'Goal milestone / 目标里程碑' },
    editableCapabilities: { move: true, resize: false },
    ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-1' },
    revision: 1,
  },
  {
    identityId: 'acceptance',
    sourceType: 'routine',
    sourceId: 'routine-1@2026-10-01T12:30',
    title: 'Routine / 例行',
    start: asInstant(Date.parse('2026-10-01T12:30:00Z')),
    end: asInstant(Date.parse('2026-10-01T13:00:00Z')),
    allDay: false,
    occupancy: 'marker',
    displayMetadata: {
      semantic: 'routine-wall-clock',
      subtitle: 'Wall-clock routine / 墙钟例行',
    },
    editableCapabilities: { move: false, resize: false },
    ownerCommandTarget: { ownerType: 'routine.routine', ownerId: 'routine-1' },
    revision: 1,
  },
];

const selectedEvent =
  projections.find((projection) => projection.sourceType === selectedSource) ?? projections[0]!;

const ownerCommands = {
  async route() {
    return { status: 'unsupported' as const, message: 'acceptance fixture is read-only' };
  },
};

const Root = defineComponent({
  setup() {
    return () =>
      h(
        'main',
        {
          class: 'min-h-screen bg-background text-foreground p-4 sm:p-6',
          'data-testid': 'schedule-presentation-acceptance',
          'data-surface': surface,
          'data-view': view,
        },
        [
          surface === 'calendar'
            ? h('section', { class: 'h-[760px] min-w-0 rounded-xl border bg-card p-3' }, [
                h(PlannerCalendar, {
                  projections,
                  conflicts: [],
                  ownerCommands: ownerCommands as never,
                  view,
                  initialDate: Date.parse('2026-10-01T12:00:00Z'),
                }),
              ])
            : null,
          surface === 'day-detail'
            ? h(DayDetailSheet, {
                open: true,
                date: new Date('2026-10-01T12:00:00Z'),
                events: projections,
                conflicts: [],
              })
            : null,
          surface === 'event-detail'
            ? h(EventDetailSheet, {
                open: true,
                event: selectedEvent,
                hasConflict: false,
              })
            : null,
          surface === 'capsule'
            ? h(
                'section',
                {
                  class: 'mx-auto w-full max-w-sm rounded-xl border bg-popover p-3 shadow-sm',
                  'data-testid': 'capsule-host',
                },
                [h(ScheduleCapsulePreview)],
              )
            : null,
        ],
      );
  },
});

const app = createApp(Root);
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en-US',
    messages: productionLocaleMessages,
  }),
);
app.mount('#app');

Object.assign(window, {
  schedulePresentationEvidence: () => ({
    locale,
    theme,
    surface,
    view,
    selectedSource,
  }),
});
