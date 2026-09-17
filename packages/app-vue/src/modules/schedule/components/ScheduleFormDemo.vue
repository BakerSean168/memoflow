<template>
  <Card class="p-6">
    <div class="flex items-center gap-2 mb-6">
      <CalendarPlus class="h-6 w-6" />
      <h2 class="text-2xl font-bold">{{ t('schedule.formDemo.title') }}</h2>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- 标题 -->
      <div>
        <Label for="title">{{ t('schedule.formDemo.fieldTitle') }}</Label>
        <Input
          id="title"
          v-model="form.title"
          :placeholder="t('schedule.formDemo.fieldTitlePlaceholder')"
          required
        />
      </div>

      <!-- 描述 -->
      <div>
        <Label for="description">{{ t('schedule.formDemo.fieldDescription') }}</Label>
        <Textarea
          id="description"
          v-model="form.description"
          :placeholder="t('schedule.formDemo.fieldDescriptionPlaceholder')"
          rows="3"
        />
      </div>

      <!-- 开始/结束时间 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <Label for="startTime">{{ t('schedule.formDemo.fieldStartTime') }}</Label>
          <Input
            id="startTime"
            v-model="startTimeFormatted"
            type="datetime-local"
            required
            @change="handleStartTimeChange"
          />
        </div>
        <div>
          <Label for="endTime">{{ t('schedule.formDemo.fieldEndTime') }}</Label>
          <Input
            id="endTime"
            v-model="endTimeFormatted"
            type="datetime-local"
            required
            @change="handleEndTimeChange"
          />
        </div>
      </div>

      <!-- 时长显示 -->
      <Badge v-if="form.duration > 0" variant="secondary" class="gap-1">
        <Clock class="h-3 w-3" />
        {{ t('schedule.formDemo.durationLabel', { duration: formatDuration(form.duration) }) }}
      </Badge>

      <!-- 地点 -->
      <div>
        <Label for="location">{{ t('schedule.formDemo.fieldLocation') }}</Label>
        <Input
          id="location"
          v-model="form.location"
          :placeholder="t('schedule.formDemo.fieldLocationPlaceholder')"
        />
      </div>

      <!-- Conflict Alert Component Slot -->
      <slot name="conflicts" :result="conflictResult" :loading="detectingConflicts" />

      <!-- Actions -->
      <div class="flex justify-between pt-4">
        <Button type="button" variant="outline" @click="handleReset">
          {{ t('schedule.formDemo.reset') }}
        </Button>
        <Button type="submit" :disabled="!isFormValid || loading">
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          <Check v-else class="mr-2 h-4 w-4" />
          {{ t('schedule.formDemo.createSchedule') }}
        </Button>
      </div>
    </form>
  </Card>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { Card } from '@memoflow/ui-vue-shadcn';
import { Input } from '@memoflow/ui-vue-shadcn';
import { Textarea } from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Label } from '@memoflow/ui-vue-shadcn';
import { Badge } from '@memoflow/ui-vue-shadcn';
import { CalendarPlus, Clock, Check, Loader2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type {
  ConflictDetectionResult,
  ConflictSuggestion,
  CreateScheduleRequest,
} from '@memoflow/contracts/schedule';
import { getProductTime } from '../../../shared/utils/product-time';
import { formatScheduleDurationMinutes } from '../../../shared/utils/format-schedule-duration-minutes';

interface Props {
  loading?: boolean;
  detectingConflicts?: boolean;
  conflictResult?: ConflictDetectionResult | null;
}

interface Emits {
  (e: 'submit', data: CreateScheduleRequest): void;
  (e: 'detect-conflicts', startTime: number, endTime: number): void;
  (e: 'apply-suggestion', suggestion: ConflictSuggestion): void;
}

withDefaults(defineProps<Props>(), {
  loading: false,
  detectingConflicts: false,
  conflictResult: null,
});

const emit = defineEmits<Emits>();

const { t } = useI18n();

const now = Date.now();
const oneHourLater = now + 60 * 60 * 1000;

/** datetime-local value resolved through the session Product Time context. */
function formatDateTimeToInput(timestamp: number): string {
  const time = getProductTime();
  return time.input.dateValue(timestamp) + 'T' + time.input.timeValue(timestamp);
}

const form = reactive({
  title: '',
  description: '',
  startTime: now as number | null,
  endTime: oneHourLater as number | null,
  duration: 60,
  location: '',
});

const startTimeFormatted = ref(formatDateTimeToInput(now));
const endTimeFormatted = ref(formatDateTimeToInput(oneHourLater));

const isFormValid = computed(() => {
  return form.title && form.startTime && form.endTime && form.endTime > form.startTime;
});

/** Residual 1324: formatDuration dual retired onto formatScheduleDurationMinutes sole. */
function formatDuration(minutes: number): string {
  return formatScheduleDurationMinutes(minutes, t);
}

function handleStartTimeChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const [date, hm] = target.value.split('T');
  form.startTime = date && hm ? getProductTime().input.combine(date, hm) : null;
  calculateDuration();
  if (form.startTime && form.endTime) {
    emit('detect-conflicts', form.startTime, form.endTime);
  }
}

function handleEndTimeChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const [date, hm] = target.value.split('T');
  form.endTime = date && hm ? getProductTime().input.combine(date, hm) : null;
  calculateDuration();
  if (form.startTime && form.endTime) {
    emit('detect-conflicts', form.startTime, form.endTime);
  }
}

function calculateDuration() {
  if (form.startTime && form.endTime) {
    form.duration = Math.floor((form.endTime - form.startTime) / 60000);
  } else {
    form.duration = 0;
  }
}

function handleSubmit() {
  if (!isFormValid.value || !form.startTime || !form.endTime) return;
  emit('submit', {
    name: form.title,
    description: form.description || undefined,
    range: { kind: 'Timed', start: form.startTime, end: form.endTime },
    location: form.location || undefined,
  });
}

function handleReset() {
  const resetNow = Date.now();
  const resetOneHourLater = resetNow + 60 * 60 * 1000;
  Object.assign(form, {
    title: '',
    description: '',
    startTime: resetNow,
    endTime: resetOneHourLater,
    duration: 60,
    location: '',
  });
  startTimeFormatted.value = formatDateTimeToInput(resetNow);
  endTimeFormatted.value = formatDateTimeToInput(resetOneHourLater);
}
</script>
