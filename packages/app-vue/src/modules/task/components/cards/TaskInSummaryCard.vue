<template>
  <Card
    class="rounded-2xl border min-h-[200px] max-h-[500px] overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
  >
    <!-- 卡片头部 -->
    <CardHeader class="bg-gradient-to-br from-primary/5 to-primary/[0.02] rounded-t-2xl p-4">
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center">
          <CheckCircle class="h-6 w-6 text-primary mr-3" />
          <div>
            <CardTitle class="text-lg font-bold mb-0">{{ t('task.summaryCard.title') }}</CardTitle>
            <CardDescription class="text-xs text-muted-foreground">
              {{ todayTasks.length }} {{ t('task.summaryCard.pendingTasks') }}
            </CardDescription>
          </div>
        </div>

        <!-- 进度指示器 -->
        <div class="relative flex items-center justify-center h-10 w-10">
          <svg class="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
            <path
              class="text-muted stroke-current"
              fill="none"
              stroke-width="3"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              class="text-primary stroke-current"
              fill="none"
              stroke-width="3"
              stroke-linecap="round"
              :stroke-dasharray="`${completionPercentage}, 100`"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span class="absolute text-[10px] font-bold">{{ completionPercentage }}%</span>
        </div>
      </div>
    </CardHeader>

    <Separator />

    <!-- 任务列表内容 -->
    <CardContent class="p-0 overflow-y-auto max-h-[400px] scrollbar-thin">
      <!-- 有任务时显示 -->
      <div v-if="todayTasks.length > 0" class="py-0">
        <div
          v-for="(task, index) in todayTasks"
          :key="task.id"
          :class="[
            'flex items-center p-4 mx-2 my-1 rounded-lg transition-all duration-300 hover:bg-primary/[0.04] hover:translate-x-1',
            task.isCompleted && 'opacity-60 bg-success/[0.08] hover:bg-success/[0.12]',
          ]"
          :style="{ animationDelay: `${index * 0.1}s` }"
          class="animate-slide-in-up"
        >
          <Checkbox
            :model-value="task.isCompleted"
            :aria-label="task.templateTitle ?? t('task.rootInstanceCard.taskFallback')"
            @update:model-value="toggleTaskComplete(task)"
            class="mr-3"
          />

          <div class="flex-1">
            <div
              :class="[
                'font-medium mb-1 transition-all duration-300',
                task.isCompleted && 'line-through text-muted-foreground',
              ]"
            >
              {{ task.instanceDateFormatted }}
            </div>

            <div class="flex items-center">
              <Clock class="h-3.5 w-3.5 text-muted-foreground mr-1" />
              <span class="text-xs text-muted-foreground">{{ getTaskTimeLabel(task) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
        <CheckCircle class="h-16 w-16 text-success mb-4 animate-bounce" />
        <h3 class="text-lg font-medium mb-1">{{ t('task.summaryCard.allCompleted') }}</h3>
        <p class="text-sm text-muted-foreground mb-4">
          {{ t('task.summaryCard.congratsMessage') }}
        </p>
        <Button variant="outline" size="sm" @click="navigateToTaskManagement">
          <Plus class="h-4 w-4 mr-1" />
          {{ t('task.summaryCard.addNew') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Separator,
  Button,
  Checkbox,
} from '@memoflow/ui-vue-shadcn';
import { CheckCircle, Clock, Plus } from '@lucide/vue';
import type { TaskOccurrenceViewModel } from '../types';
import { useI18n } from 'vue-i18n';
import { getTaskTimeValueDisplay } from '../../utils/task-plan-presentation';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tasks?: TaskOccurrenceViewModel[];
    onNavigateToManagement?: () => void | Promise<void>;
    onToggleComplete?: (task: TaskOccurrenceViewModel) => void | Promise<void>;
  }>(),
  {
    tasks: () => [],
  },
);

const emit = defineEmits<{
  (e: 'navigate-management'): void;
  (e: 'toggle-complete', task: TaskOccurrenceViewModel): void;
}>();

const navigateToTaskManagement = () => {
  emit('navigate-management');
  props.onNavigateToManagement?.();
};

// ✅ 获取今日任务列表 - 使用新的状态字段
const todayTasks = computed(() => {
  const today = new Date().toISOString().split('T')[0];
  return props.tasks.filter((task) => {
    const taskDate = new Date(task.instanceDate).toISOString().split('T')[0];
    return taskDate === today && !task.isCompleted;
  });
});

// ✅ 计算完成百分比 - 使用新的状态字段
const completionPercentage = computed(() => {
  const today = new Date().toISOString().split('T')[0];
  const allTasks = props.tasks.filter((task) => {
    const taskDate = new Date(task.instanceDate).toISOString().split('T')[0];
    return taskDate === today;
  });
  const completedTasks = allTasks.filter((task) => task.isCompleted);
  return allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 0;
});

// ✅ 切换任务完成状态
const toggleTaskComplete = async (task: TaskOccurrenceViewModel) => {
  emit('toggle-complete', task);
  await props.onToggleComplete?.(task);
};

const getTaskTimeLabel = (task: TaskOccurrenceViewModel) =>
  getTaskTimeValueDisplay(t, task.timeConfig);
</script>

<style scoped>
@keyframes slide-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-in-up {
  animation: slide-in-up 0.4s ease both;
}
</style>
