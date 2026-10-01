<template>
  <DefineBody>
    <div v-if="event" class="space-y-4">
      <dl
        class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"
        data-testid="event-detail-properties"
      >
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
              :class="sourcePresentation.badgeClass"
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

      <p v-if="!isScheduleEntry" class="text-xs leading-5 text-muted-foreground">
        {{ t('schedule.eventDetail.readOnlyHint') }}
      </p>
    </div>
  </DefineBody>
  <DefineFooter>
    <Button variant="ghost" @click="emit('update:open', false)">
      {{ t('common.close') }}
    </Button>
    <template v-if="isScheduleEntry">
      <Button variant="outline" data-testid="planner-event-edit" @click="emit('edit', event!)">
        <Pencil class="mr-2 h-4 w-4" />
        {{ t('common.edit') }}
      </Button>
      <Button
        variant="destructive"
        data-testid="planner-event-delete"
        @click="emit('delete', event!)"
      >
        <Trash2 class="mr-2 h-4 w-4" />
        {{ t('common.delete') }}
      </Button>
    </template>
  </DefineFooter>
  <Sheet v-if="isNarrow" :open="open" @update:open="emit('update:open', $event)">
    <SheetContent
      side="right"
      class="flex h-full w-full max-w-sm flex-col gap-0 overflow-hidden p-0"
      data-testid="planner-event-sheet"
    >
      <SheetHeader class="shrink-0 border-b border-[hsl(var(--border-subtle))] px-5 py-4 text-left">
        <SheetTitle>
          <span class="flex min-w-0 items-center gap-2">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="sourcePresentation.dotClass" />
            <span class="min-w-0 truncate">{{ event?.title }}</span>
          </span>
        </SheetTitle>
        <SheetDescription>{{ t('schedule.eventDetail.subtitle') }}</SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ReuseBody />
      </div>
      <SheetFooter
        class="shrink-0 flex-wrap gap-2 border-t border-[hsl(var(--border-subtle))] px-5 py-3.5"
      >
        <ReuseFooter />
      </SheetFooter>
    </SheetContent>
  </Sheet>
  <Dialog v-else :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell :open="open" test-id="planner-event-dialog" size="sm">
      <template #icon>
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <CalendarClock class="h-4.5 w-4.5" />
        </span>
      </template>
      <template #title>
        <span class="flex min-w-0 items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="sourcePresentation.dotClass" />
          <span class="min-w-0 truncate">{{ event?.title }}</span>
        </span>
      </template>
      <template #description>{{ t('schedule.eventDetail.subtitle') }}</template>
      <ReuseBody />
      <template #footer><ReuseFooter /></template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { createReusableTemplate } from '@vueuse/core';
import { usePanelWidth } from '../../../layouts/shell/usePanelWidth';
import { useI18n } from 'vue-i18n';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@memoflow/ui-vue-shadcn';
import { AlertTriangle, CalendarClock, Pencil, Trash2 } from '@lucide/vue';
import { ProductDialogShell } from '../../../shared/components';
import {
  formatPlannerProjectionTimeRange,
  plannerProjectionSourcePresentation,
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
  edit: [event: CalendarEventProjection];
  delete: [event: CalendarEventProjection];
}>();

const { t } = useI18n();
const { isNarrow } = usePanelWidth();
const [DefineBody, ReuseBody] = createReusableTemplate();
const [DefineFooter, ReuseFooter] = createReusableTemplate();

const timeRange = computed(() =>
  props.event
    ? formatPlannerProjectionTimeRange(props.event, t('schedule.eventDetail.allDay'))
    : '',
);

const sourcePresentation = computed(() =>
  props.event
    ? plannerProjectionSourcePresentation[props.event.sourceType]
    : plannerProjectionSourcePresentation.schedule,
);

const sourceLabel = computed(() => (props.event ? t(sourcePresentation.value.labelI18nKey) : ''));

const semanticLabel = computed(() =>
  props.event ? t(plannerSemanticI18nKey[props.event.displayMetadata.semantic]) : '',
);

const isScheduleEntry = computed(() => props.event?.sourceType === 'schedule');
</script>
