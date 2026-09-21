<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowRight, Repeat2 } from '@lucide/vue';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@memoflow/ui-vue-shadcn';
import type { RoutineUpcomingOccurrence } from '@memoflow/contracts/routine';
import { useI18n } from 'vue-i18n';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import {
  endOfDayMs,
  formatProductHm,
  productTimeRevision,
} from '../../../shared/utils/product-time';

const props = withDefaults(defineProps<{ active?: boolean; maxItems?: number }>(), {
  active: true,
  maxItems: 6,
});

defineEmits<{ 'view-all': [] }>();

const { t } = useI18n();
const service = useStrictInject(ROUTINE_SERVICE_KEY, 'RoutineService');
const occurrences = ref<RoutineUpcomingOccurrence[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let loadGeneration = 0;

const visible = computed(() => occurrences.value.slice(0, props.maxItems));

async function load() {
  if (!props.active) return;
  const generation = ++loadGeneration;
  loading.value = true;
  error.value = null;
  const now = Date.now();
  const result = await service.getUpcomingOccurrences({
    start: now,
    end: endOfDayMs(now),
    limit: 100,
  });
  if (generation !== loadGeneration) return;
  if (result.ok) occurrences.value = result.data.occurrences;
  else {
    occurrences.value = [];
    error.value = result.error.message;
  }
  loading.value = false;
}

watch(
  [() => props.active, productTimeRevision],
  ([active]) => {
    if (active) void load();
    else loadGeneration += 1;
  },
  { immediate: true },
);
</script>

<template>
  <Card class="border-border/50" data-testid="routine-upcoming-widget">
    <CardHeader class="flex flex-row items-center justify-between px-4 pb-2 pt-4">
      <CardTitle class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Repeat2 class="h-4 w-4 text-muted-foreground" />
        {{ t('routine.home.title') }}
      </CardTitle>
      <div class="flex items-center gap-2">
        <span class="font-mono text-[11px] text-muted-foreground">{{ occurrences.length }}</span>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="$emit('view-all')">
          {{ t('routine.home.viewAll') }}
          <ArrowRight class="ml-1 h-3 w-3" />
        </Button>
      </div>
    </CardHeader>
    <CardContent class="px-4 pb-4">
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="flex items-center gap-2">
          <Skeleton class="h-8 w-12 rounded" />
          <Skeleton class="h-3 flex-1" />
        </div>
      </div>
      <p v-else-if="error" class="py-5 text-center text-xs text-destructive">{{ error }}</p>
      <div v-else-if="visible.length" class="space-y-1">
        <div
          v-for="occurrence in visible"
          :key="occurrence.occurrenceKey"
          class="flex items-center gap-2.5 rounded-md px-1 py-1.5"
          data-testid="routine-upcoming-item"
        >
          <span class="w-12 shrink-0 font-mono text-xs font-medium text-foreground">
            {{ formatProductHm(occurrence.occurrenceAt) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-foreground">{{ occurrence.title }}</p>
            <p v-if="occurrence.description" class="truncate text-[11px] text-muted-foreground">
              {{ occurrence.description }}
            </p>
          </div>
        </div>
      </div>
      <p v-else class="py-6 text-center text-xs text-muted-foreground">
        {{ t('routine.home.empty') }}
      </p>
    </CardContent>
  </Card>
</template>
