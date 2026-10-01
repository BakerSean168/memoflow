import { createApp, defineComponent, h, onMounted, onUnmounted } from 'vue';
import { createI18n } from 'vue-i18n';
import type {
  CalendarEntryClientDTO,
  CalendarEventProjection,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '@memoflow/contracts/schedule';
import { DEFAULT_USER_PREFERENCE_PROFILE } from '@memoflow/contracts/setting';
import { asInstant, asYmd } from '@memoflow/time';
import PlannerCalendar, {
  type PlannerCalendarView,
} from '@memoflow/app-vue/modules/schedule/planner/PlannerCalendar.vue';
import PlannerDayDialog from '@memoflow/app-vue/modules/schedule/components/PlannerDayDialog.vue';
import PlannerEventDialog from '@memoflow/app-vue/modules/schedule/components/PlannerEventDialog.vue';
import ScheduleCapsulePreview from '@memoflow/app-vue/layouts/shell/previews/ScheduleCapsulePreview.vue';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import { setProductTimePreferences } from '@memoflow/app-vue/shared/utils/product-time';
import { providePanelWidth } from '@memoflow/app-vue/layouts/shell/usePanelWidth';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { fail, ok } from '@memoflow/contracts/result';
import {
  TaskHmSchema,
  TaskYmdSchema,
  type TaskOccurrenceClientDTO,
} from '@memoflow/contracts/task';
import {
  instance,
  template,
} from '@memoflow/app-vue/modules/task/components/task-quick-test-fixtures';
import { createPinia } from 'pinia';
import { Toaster } from 'vue-sonner';
import ScheduleCalendarView from '@memoflow/app-vue/modules/schedule/views/ScheduleCalendarView.vue';
import GlobalConfirmDialog from '@memoflow/app-vue/shared/components/GlobalConfirmDialog.vue';
import {
  SCHEDULE_SERVICE_KEY,
  TASK_SERVICE_KEY,
  GOAL_SERVICE_KEY,
} from '@memoflow/app-vue/di/keys';
import { installServerStateRuntime } from '@memoflow/app-vue/platform/server-state';
import { useScheduleStore } from '@memoflow/app-vue/modules/schedule/stores/schedule-store';
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

let scheduleReads = 0;
let finishWrite: (() => void) | undefined;
const collision = params.get('collision');
const calls: { command: string; id?: string; version?: number; request?: unknown }[] = [];
let entries: CalendarEntryClientDTO[] = [
  {
    id: 'entry-1',
    identityId: 'acceptance',
    title: 'Deep work / 深度工作',
    description: 'Focus block',
    location: 'Desk',
    attendees: ['Ada'],
    range: {
      kind: 'Timed',
      start: asInstant(Date.parse('2026-10-01T09:00:00Z')),
      end: asInstant(Date.parse('2026-10-01T10:00:00Z')),
    },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  } as CalendarEntryClientDTO,
];
const scheduleService = {
  async getSchedulesByAccount() {
    scheduleReads += 1;
    return { ok: true, data: entries };
  },
  async createSchedule(request: CreateScheduleRequest) {
    calls.push({ command: 'create', request });
    if (params.has('holdCreate'))
      await new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
    const entry = {
      identityId: 'acceptance',
      createdAt: 0,
      updatedAt: 0,
      id: 'entry-created',
      title: request.name,
      range: request.range,
      version: 1,
    } as CalendarEntryClientDTO;
    entries = [...entries, entry];
    return { ok: true, data: entry };
  },
  async createScheduleWithConflictDetection(request: CreateScheduleRequest) {
    const result = await scheduleService.createSchedule(request);
    return { ok: true, data: { schedule: result.data } };
  },
  async updateSchedule(id: string, request: UpdateScheduleRequest) {
    calls.push({ command: 'update', id, version: request.expectedVersion, request });
    const current = entries.find((entry) => entry.id === id)!;
    if (collision === 'stale' && calls.filter((call) => call.command === 'update').length === 1) {
      entries = entries.map((entry) => (entry.id === id ? { ...entry, version: 2 } : entry));
      return fail({
        code: 'CONFLICT',
        message: 'Version conflict',
        context: { currentVersion: 2, expectedVersion: request.expectedVersion },
      });
    }
    if (collision === 'conflict') return fail({ code: 'CONFLICT', message: 'Owner conflict' });

    const entry = {
      ...current,
      title: request.name ?? current.title,
      range: request.range ?? current.range,
      description: request.description ?? current.description,
      location: request.location,
      attendees: request.attendees,
      version: current.version + 1,
    };
    entries = entries.map((current) => (current.id === id ? entry : current));
    return { ok: true, data: entry };
  },
  async deleteSchedule(id: string, version: number) {
    calls.push({ command: 'delete', id, version });
    entries = entries.filter((entry) => entry.id !== id);
    return { ok: true, data: undefined };
  },
};

// Isolated production-component acceptance: deterministic service doubles, no live backend.
let occurrence = instance({
  id: 'task-occurrence-1' as TaskOccurrenceClientDTO['id'],
  dueAt: Date.parse('2026-10-01T10:30:00Z'),
  scheduleSnapshot: {
    date: TaskYmdSchema.parse('2026-10-01'),
    timing: { kind: 'At', time: TaskHmSchema.parse('10:30') },
  },
  checklistState: [
    {
      definitionId: 'step',
      titleSnapshot: 'Review checklist',
      completed: false,
      completedAt: null,
    },
  ],
});
const taskPlan = {
  ...template,
  name: 'Review task / 复盘任务',
  goalBinding:
    params.get('prompt') === '1'
      ? {
          goalId: 'goal-1',
          keyResultId: 'kr-1',
          contribution: null,
          progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 2 },
        }
      : null,
};
function taskResult(command: string, status: TaskOccurrenceClientDTO['status'], request?: unknown) {
  calls.push({ command, id: String(occurrence.id), request });
  occurrence = {
    ...occurrence,
    status,
    result: instance({ status }).result,
    version: occurrence.version + 1,
  };
  return ok({ toDTO: () => occurrence });
}
const taskService = {
  rescheduleOccurrence: async (id: string, request: unknown) => {
    calls.push({ command: 'reschedule', id, request });
    return fail({
      code: 'CONFLICT',
      message: 'Target day occupied',
      details: [
        {
          field: 'scheduleSnapshot.date',
          code: 'TASK_OCCURRENCE_TARGET_DATE_CONFLICT',
          message: 'occupied',
        },
      ],
    });
  },
  getOccurrence: async () => ok({ toDTO: () => occurrence }),
  getPlan: async () => ok({ toDTO: () => taskPlan }),
  listPlans: async () =>
    ok({
      plans: surface === 'task-quick' || surface === 'collision' ? [{ toDTO: () => taskPlan }] : [],
      total: surface === 'task-quick' || surface === 'collision' ? 1 : 0,
    }),
  listOccurrencesByDateRange: async () =>
    ok(surface === 'task-quick' || surface === 'collision' ? [{ toDTO: () => occurrence }] : []),
  completeOccurrence: async (_id: string, request?: unknown) =>
    taskResult('complete', 'Completed', request),
  uncompleteOccurrence: async () => taskResult('uncomplete', 'Pending'),
  markOccurrenceMissed: async () => taskResult('missed', 'Missed'),
  skipOccurrence: async () => taskResult('skip', 'Skipped'),
  setOccurrenceChecklistItem: async (
    _id: string,
    request: { completed: boolean; expectedVersion: number },
  ) => {
    occurrence = {
      ...occurrence,
      checklistState: occurrence.checklistState.map((item) => ({
        ...item,
        completed: request.completed,
      })),
    };
    return taskResult('checklist', occurrence.status, request);
  },
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    {
      path: '/tasks/:id',
      name: 'task-detail',
      component: {
        render: () =>
          h('div', { 'data-testid': 'task-plan-sentinel' }, 'Canonical Task plan destination'),
      },
    },
  ],
});

const Root = defineComponent({
  setup() {
    const { width } = providePanelWidth();
    const updateWidth = () => {
      width.value = Number(params.get('panelWidth')) || window.innerWidth;
    };
    updateWidth();
    onMounted(() => window.addEventListener('resize', updateWidth));
    onUnmounted(() => window.removeEventListener('resize', updateWidth));
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
          h(RouterView),
          h(GlobalConfirmDialog),
          h(Toaster),
          surface === 'crud' ||
          surface === 'collision' ||
          (surface === 'task-quick' && router.currentRoute.value.path === '/')
            ? h('section', { class: 'h-[800px]' }, [h(ScheduleCalendarView)])
            : null,
          surface === 'calendar'
            ? h('section', { class: 'h-[760px] min-w-0 rounded-xl border bg-card p-3' }, [
                h(PlannerCalendar, {
                  projections,
                  conflicts: [],
                  ownerCommands: ownerCommands as never,
                  view,
                  locale,
                  initialDate: Date.parse('2026-10-01T12:00:00Z'),
                }),
              ])
            : null,
          surface === 'day-detail'
            ? h(PlannerDayDialog, {
                open: true,
                date: new Date('2026-10-01T12:00:00Z'),
                events: projections,
                conflicts: [],
              })
            : null,
          surface === 'event-detail'
            ? h(PlannerEventDialog, {
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
app.use(createPinia());
app.use(router);
installServerStateRuntime(app, 'web', { identityScope: 'acceptance' });
app.provide(SCHEDULE_SERVICE_KEY, scheduleService as never);
app.provide(TASK_SERVICE_KEY, taskService as never);
app.provide(GOAL_SERVICE_KEY, {
  listGoals: async () => ok({ goals: [], pagination: { hasMore: false } }),
  getGoalRecordsByKeyResult: async () =>
    ok({
      records: [],
      previewContext: {
        keyResultId: 'kr-1',
        aggregationMethod: 'Sum',
        unit: 'units',
        initialValue: 0,
        currentValue: 40,
        trackingBaseValue: 40,
        targetValue: 100,
        aggregationSnapshot: { count: 0, sum: 0, min: null, max: null, last: null },
      },
    }),
  updateGoal: async () => {
    throw new Error('Unexpected Goal mutation');
  },
} as never);
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
  scheduleCrudEvidence: () => calls,
  scheduleCollisionEvidence: () => ({ calls, scheduleReads, entries }),
  finishScheduleWrite: () => finishWrite?.(),
  invalidateScheduleInspect: (kind: string) => {
    const store = useScheduleStore();
    store.setCalendarEntries(
      kind === 'missing'
        ? []
        : store.calendarEntries.map((entry) => ({ ...entry, version: entry.version + 1 })),
    );
  },
  schedulePresentationEvidence: () => ({
    locale,
    theme,
    surface,
    view,
    selectedSource,
  }),
});
