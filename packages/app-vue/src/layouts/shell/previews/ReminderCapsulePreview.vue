<script setup lang="ts">
/**
 * ReminderCapsulePreview — 提醒胶囊摘要（§10）
 * 懒加载 getTodaySchedule；展示今日剩余与下一批时间。
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useReminder } from '../../../modules/reminder/composables/useReminder';
import type { ReminderTodayScheduleItem } from '@memoflow/contracts/reminder';
import { formatProductHm } from '../../../shared/utils/product-time';

const RECENT_LIMIT = 4;
const CACHE_MS = 45_000;

defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
const reminder = useReminder();

const loadedAt = ref(0);
const localError = ref<string | null>(null);
const isLoading = ref(false);
const nowTick = ref(Date.now());
const scheduleItems = ref<ReminderTodayScheduleItem[]>([]);

const remaining = computed(() =>
  scheduleItems.value
    .filter((item) => item.nextTriggerAt >= nowTick.value)
    .sort((a, b) => a.nextTriggerAt - b.nextTriggerAt),
);

const visible = computed(() => remaining.value.slice(0, RECENT_LIMIT));

/**
 * Residual 1294: formatProductHm HH:mm sole (capsule clock).
 */

async function load(force = false) {
  if (!force && loadedAt.value && Date.now() - loadedAt.value < CACHE_MS) return;
  isLoading.value = true;
  localError.value = null;
  try {
    const result = await reminder.getTodaySchedule({ limit: 200 });
    if (result) {
      scheduleItems.value = result.data ?? [];
    } else {
      scheduleItems.value = [];
      if (reminder.error?.value) localError.value = String(reminder.error.value);
    }
    nowTick.value = Date.now();
    loadedAt.value = Date.now();
  } catch (e) {
    localError.value = e instanceof Error ? e.message : t('common.operationFailed');
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex max-h-80 flex-col" data-testid="reminder-capsule-preview">
    <div class="mb-2 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
      <p class="text-xs font-bold">{{ t('nav.capsule.reminder') }}</p>
      <span class="font-mono text-[10px] text-muted-foreground" data-testid="reminder-capsule-count">
        {{ remaining.length }}
      </span>
    </div>

    <div v-if="isLoading && visible.length === 0" class="space-y-2 py-2" data-testid="reminder-capsule-loading">
      <div v-for="i in 3" :key="i" class="h-8 animate-pulse rounded bg-muted" />
    </div>

    <div v-else-if="localError" class="space-y-2 py-3 text-center" data-testid="reminder-capsule-error">
      <p class="text-[11px] text-muted-foreground">{{ localError }}</p>
      <button type="button" class="text-[11px] font-medium text-primary" data-testid="reminder-capsule-retry" @click="load(true)">
        {{ t('common.retry') }}
      </button>
    </div>

    <div
      v-else-if="visible.length === 0"
      class="py-4 text-center text-[11px] text-muted-foreground"
      data-testid="reminder-capsule-empty"
    >
      {{ t('shell.preview.reminderEmpty') }}
    </div>

    <ul v-else class="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="reminder-capsule-list">
      <li v-for="item in visible" :key="`${item.templateId}-${item.nextTriggerAt}`">
        <button
          type="button"
          class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
          :data-testid="`reminder-capsule-item-${item.templateId}`"
          @click="$emit('select', String(item.templateId))"
        >
          <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
            {{ formatProductHm(item.nextTriggerAt) }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[11px] font-semibold">{{ item.title }}</span>
            <span v-if="item.description" class="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {{ item.description }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="mt-2 block w-full rounded-lg border border-border/60 bg-accent py-1.5 text-center text-xs font-medium transition-colors hover:bg-accent/80"
      data-testid="reminder-capsule-view-all"
      @click="$emit('view-all')"
    >
      {{ t('shell.enterModule') }}
    </button>
  </div>
</template>
