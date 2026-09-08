<script setup lang="ts">
import { computed, ref } from 'vue';
import { Card, CardHeader, CardTitle, CardContent } from '@memoflow/ui-vue-shadcn';
import { Calendar } from '@lucide/vue';
import type { TaskOccurrenceViewModel } from '../types';

// ===== Props =====
const props = withDefaults(
  defineProps<{
    size?: string;
    tasks?: TaskOccurrenceViewModel[];
  }>(),
  {
    size: 'medium',
    tasks: () => [],
  },
);

// ===== State =====
const isLoading = ref(false);

// ===== Computed =====
const taskStats = computed(() => ({
  total: props.tasks.length,
}));
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium"> Today's Tasks </CardTitle>
      <Calendar class="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{{ taskStats.total }}</div>
      <p class="text-xs text-muted-foreground">+20.1% from last month</p>
      <!-- Task List Placeholder -->
      <div v-if="isLoading" class="mt-4 text-center text-sm text-muted-foreground">Loading...</div>
      <div
        v-else-if="props.tasks.length === 0"
        class="mt-4 text-center text-sm text-muted-foreground"
      >
        No tasks for today
      </div>
      <div v-else class="mt-4 space-y-2">
        <!-- Task Items would go here -->
      </div>
    </CardContent>
  </Card>
</template>
