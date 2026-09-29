<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-96 overflow-y-auto" data-testid="event-detail-sheet">
      <SheetHeader>
        <SheetTitle class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="sourceDotClass" />
          <span class="min-w-0 truncate">{{ event?.title }}</span>
        </SheetTitle>
        <SheetDescription>{{ t('schedule.eventDetail.subtitle') }}</SheetDescription>
      </SheetHeader>

      <div v-if="event" class="mt-4 space-y-4">
        <dl class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]" data-testid="event-detail-properties">
          <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-xs font-medium text-muted-foreground">
              {{ t('schedule.eventDetail.time') }}
            </dt>
            <dd class="text-sm text-foreground">{{ timeRange }}</dd>
          </div>

          <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-xs font-medium text-muted-foreground">
              {{ t('schedule.eventDetail.source') }}
            </dt>
            <dd>
              <span
                class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="sourceBadgeClass"
              >
                {{ sourceLabel }}
              </span>
            </dd>
          </div>

          <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-xs font-medium text-muted-foreground">
              {{ t('schedule.eventDetail.kind') }}
            </dt>
            <dd class="text-sm text-foreground">{{ semanticLabel }}</dd>
          </div>

          <div
            v-if="event.displayMetadata.status"
            class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3"
          >
            <dt class="text-xs font-medium text-muted-foreground">
              {{ t('schedule.eventDetail.status') }}
            </dt>
            <dd class="text-sm text-foreground">{{ event.displayMetadata.status }}</dd>
          </div>

          <div
            v-if="event.displayMetadata.subtitle"
            class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-3"
          >
            <dt class="text-xs font-medium text-muted-foreground">
              {{ t('schedule.eventDetail.note') }}
            </dt>
            <dd class="text-sm leading-5 text-foreground">
              {{ event.displayMetadata.subtitle }}
            </dd>
          </div>
        </dl>

        <Alert v-if="hasConflict" class="border-warning/40 bg-warning/10">
          <AlertTriangle class="h-4 w-4 text-warning" />
          <AlertDescription class="text-xs">
            {{ t('schedule.eventDetail.conflictHint') }}
          </AlertDescription>
        </Alert>

        <p class="text-xs leading-5 text-muted-foreground">
          {{ t('schedule.eventDetail.readOnlyHint') }}
        </p>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import {
  Alert,
  AlertDescription,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@memoflow/ui-vue-shadcn';
import { AlertTriangle } from '@lucide/vue';
import {
  formatPlannerProjectionTimeRange,
  plannerSemanticI18nKey,
} from '../planner/planner-presentation';

const props = withDefaults(
  defineProps<{
    open: boolean;
    event: CalendarEventProjection | null;
    hasConflict?: boolean;
  }>(),
  {
    hasConflict: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();

const timeRange = computed(() =>
  props.event
    ? formatPlannerProjectionTimeRange(props.event, t('schedule.eventDetail.allDay'))
    : '',
);

const sourceLabel = computed(() =>
  props.event ? t(`schedule.source.${props.event.sourceType}`) : '',
);

const semanticLabel = computed(() =>
  props.event ? t(plannerSemanticI18nKey[props.event.displayMetadata.semantic]) : '',
);

const sourceDotClass = computed(() => {
  switch (props.event?.sourceType) {
    case 'schedule':
      return 'bg-primary';
    case 'task':
      return 'bg-info';
    case 'goal':
      return 'bg-success';
    case 'routine':
      return 'bg-muted-foreground';
    default:
      return 'bg-muted-foreground';
  }
});

const sourceBadgeClass = computed(() => {
  switch (props.event?.sourceType) {
    case 'schedule':
      return 'bg-primary/10 text-primary';
    case 'task':
      return 'bg-info/15 text-info';
    case 'goal':
      return 'bg-success/15 text-success';
    case 'routine':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
});
</script>
