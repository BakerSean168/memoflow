<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>{{ t('schedule.eventList.title') }}</CardTitle>
        <Button @click="$emit('create')">
          <Plus class="mr-2 h-4 w-4" />
          {{ t('schedule.eventList.createSchedule') }}
        </Button>
      </div>
    </CardHeader>

    <CardContent>
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center items-center py-8">
        <Loader2 class="h-8 w-8 animate-spin text-primary" />
      </div>

      <!-- Error -->
      <Alert v-else-if="error" variant="destructive" class="mb-4">
        <AlertCircle class="h-4 w-4" />
        <AlertTitle>{{ t('schedule.eventList.error') }}</AlertTitle>
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>

      <!-- Empty State -->
      <div v-else-if="schedules.length === 0" class="text-center py-12">
        <CalendarOff class="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 class="mt-4 text-lg font-semibold">{{ t('schedule.eventList.emptyTitle') }}</h3>
        <p class="text-sm text-muted-foreground mt-2">
          {{ t('schedule.eventList.emptyDescription') }}
        </p>
      </div>

      <!-- Schedule List -->
      <div v-else class="space-y-2">
        <ActionableWrapper
          v-for="schedule in schedules"
          :key="schedule.id"
          :actions="getScheduleActions(schedule)"
          more-button-position="top-right"
        >
          <button
            type="button"
            class="flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="emit('schedule-click', schedule)"
          >
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Calendar class="h-5 w-5 text-white" />
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h4 class="font-semibold">{{ schedule.title }}</h4>
              </div>

              <div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Clock class="h-4 w-4" />
                <span>{{ formatCalendarEntryRange(schedule) }}</span>
                <span v-if="schedule.range.kind === 'Timed'" class="ml-2">
                  ({{
                    t('schedule.eventList.durationMinutes', {
                      n: Math.max(
                        1,
                        Math.round((schedule.range.end - schedule.range.start) / 60000),
                      ),
                    })
                  }})
                </span>
              </div>

              <div
                v-if="schedule.location"
                class="flex items-center gap-2 mt-1 text-sm text-muted-foreground"
              >
                <MapPin class="h-4 w-4" />
                <span>{{ schedule.location }}</span>
              </div>

              <p
                v-if="schedule.description"
                class="mt-2 text-sm text-muted-foreground line-clamp-2"
              >
                {{ schedule.description }}
              </p>
            </div>
          </button>
        </ActionableWrapper>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Alert, AlertDescription, AlertTitle } from '@memoflow/ui-vue-shadcn';
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  Trash2,
  Loader2,
  AlertCircle,
  CalendarOff,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { formatProductDateTime } from '../../../shared/utils/product-time';
import type { CalendarEntryClientDTO } from '@memoflow/contracts/schedule';
import { ActionableWrapper, menuLabel } from '../../../components/shared';
import type { MenuAction } from '../../../components/shared';

interface Props {
  schedules: CalendarEntryClientDTO[];
  loading?: boolean;
  error?: string | null;
}

interface Emits {
  (e: 'create'): void;
  (e: 'schedule-click', schedule: CalendarEntryClientDTO): void;
  (e: 'delete', id: string): void;
}

withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
});

const emit = defineEmits<Emits>();

const { t } = useI18n();

function formatCalendarEntryRange(schedule: CalendarEntryClientDTO): string {
  if (schedule.range.kind === 'AllDay') {
    return schedule.range.end && schedule.range.end !== schedule.range.start
      ? `${schedule.range.start} - ${schedule.range.end}`
      : `${schedule.range.start} · ${t('schedule.calendar.allDay')}`;
  }
  return `${formatProductDateTime(schedule.range.start)} - ${formatProductDateTime(schedule.range.end)}`;
}

function getScheduleActions(schedule: CalendarEntryClientDTO): MenuAction[] {
  return [
    {
      key: 'delete',
      label: menuLabel('delete'),
      icon: Trash2,
      destructive: true,
      handler: () => emit('delete', schedule.id),
    },
  ];
}
</script>
