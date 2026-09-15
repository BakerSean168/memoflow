<template>
  <Card class="border-border/50 flex flex-col">
    <CardHeader class="pb-2 px-4 pt-4 flex flex-row items-center justify-between shrink-0">
      <CardTitle class="text-sm font-medium text-foreground flex items-center gap-2">
        <Bell class="w-4 h-4 text-muted-foreground" />
        今日习惯提醒
      </CardTitle>
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-muted-foreground font-mono">
          {{ remainingItems.length }}
        </span>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="$emit('view-all')">
          查看全部
          <ArrowRight class="w-3 h-3 ml-1" />
        </Button>
      </div>
    </CardHeader>

    <CardContent class="px-4 pb-4 flex-1 overflow-hidden">
      <template v-if="isLoading">
        <div class="space-y-3">
          <div v-for="i in 4" :key="i" class="flex items-start gap-2">
            <Skeleton class="w-10 h-8 rounded" />
            <div class="flex-1 space-y-1">
              <Skeleton class="h-3 w-full" />
              <Skeleton class="h-3 w-24" />
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="error">
        <div class="flex flex-col items-center justify-center py-6 text-center">
          <AlertTriangle class="w-8 h-8 text-destructive/70 mb-2" />
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ error }}
          </p>
        </div>
      </template>

      <template v-else-if="visibleItems.length === 0">
        <div class="flex flex-col items-center justify-center py-6 text-center">
          <BellOff class="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p class="text-xs text-muted-foreground">今天没有剩余提醒</p>
        </div>
      </template>

      <template v-else>
        <ScrollArea class="h-[200px]">
          <div class="space-y-1">
            <div
              v-for="item in visibleItems"
              :key="`${item.templateId}-${item.nextTriggerAt}`"
              class="flex items-start gap-2.5 py-1.5 rounded-md hover:bg-muted/50 px-1 transition-colors"
            >
              <div class="flex flex-col items-center bg-muted/80 rounded px-1.5 py-0.5 shrink-0">
                <span class="text-[10px] text-muted-foreground leading-none"> 今天 </span>
                <span class="text-xs font-semibold text-foreground leading-tight">
                  {{ formatReminderTime(item.nextTriggerAt) }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-foreground font-medium truncate">
                  {{ item.title }}
                </p>
                <p class="text-[11px] text-muted-foreground truncate">
                  {{ item.description || item.nextTriggerDisplay }}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getProductTime, productTimeRevision } from '../../../../shared/utils/product-time';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  ScrollArea,
} from '@memoflow/ui-vue-shadcn';
import { Bell, BellOff, ArrowRight, AlertTriangle } from '@lucide/vue';
import { useReminder } from '../../composables/useReminder';
import type { ReminderTodayScheduleItem } from '@memoflow/contracts/reminder';

const props = withDefaults(
  defineProps<{
    maxItems?: number;
    refreshKey?: number;
  }>(),
  {
    maxItems: 6,
    refreshKey: 0,
  },
);

defineEmits<{
  (e: 'view-all'): void;
}>();

const reminder = useReminder();
const nowTick = ref(Date.now());
const isLoading = ref(false);
const error = ref<string | null>(null);
const scheduleItems = ref<ReminderTodayScheduleItem[]>([]);
const currentDayKey = ref(getDayKey(Date.now()));
let nowTimer: number | null = null;

function getDayKey(timestamp: number): string {
  void productTimeRevision.value;
  return String(getProductTime().calendar.toYmd(timestamp));
}

function startNowTimer() {
  nowTimer = window.setInterval(() => {
    const nextNow = Date.now();
    nowTick.value = nextNow;

    const nextDayKey = getDayKey(nextNow);
    if (nextDayKey !== currentDayKey.value) {
      currentDayKey.value = nextDayKey;
      void loadReminders();
    }
  }, 60_000);
}

function stopNowTimer() {
  if (nowTimer !== null) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
}

async function loadReminders() {
  isLoading.value = true;
  error.value = null;
  const result = await reminder.getTodaySchedule({ limit: 200 });
  if (result) {
    scheduleItems.value = result.data ?? [];
  } else {
    scheduleItems.value = [];
    error.value = reminder.error.value || '加载今日提醒失败';
  }
  const nextNow = Date.now();
  nowTick.value = nextNow;
  currentDayKey.value = getDayKey(nextNow);
  isLoading.value = false;
}

const remainingItems = computed<ReminderTodayScheduleItem[]>(() => {
  return scheduleItems.value
    .filter((item) => item.nextTriggerAt >= nowTick.value)
    .sort((left, right) => left.nextTriggerAt - right.nextTriggerAt);
});

const visibleItems = computed<ReminderTodayScheduleItem[]>(() =>
  remainingItems.value.slice(0, props.maxItems),
);

/** Current reminder wall-clock display follows the session Product Time context. */
function formatReminderTime(timestamp: number | null): string {
  if (!timestamp) return '--:--';
  void productTimeRevision.value;
  return getProductTime().format.hm(timestamp);
}

onMounted(() => {
  void loadReminders();
  startNowTimer();
});

watch([() => props.refreshKey, productTimeRevision], () => {
  void loadReminders();
});

onBeforeUnmount(() => {
  stopNowTimer();
});
</script>
