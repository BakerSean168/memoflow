<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden" data-testid="goal-list-view">
    <ScrollArea
      class="min-h-0 flex-1 px-4 @2xl/panel:px-6"
      data-testid="goal-list-scroll"
      data-scroll-host="goal-list"
    >
      <div class="w-full py-2">
        <div v-if="isLoading" class="divide-y" data-testid="goal-list-skeleton">
          <div v-for="i in 6" :key="i" class="space-y-3 py-4">
            <div class="flex justify-between gap-4">
              <Skeleton class="h-5 w-2/5" />
              <Skeleton class="h-5 w-12" />
            </div>
            <Skeleton class="h-2 w-full" />
            <Skeleton class="h-3 w-1/3" />
          </div>
        </div>

        <div
          v-else-if="goals.length > 0"
          v-keyboard-list="{ selectable: true }"
          data-testid="goal-list"
        >
          <div
            class="hidden grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_10rem] items-center gap-x-6 border-b border-[hsl(var(--border-subtle))] px-3 py-2 pr-12 text-[11px] font-medium text-muted-foreground @2xl/panel:grid"
            data-testid="goal-list-column-header"
          >
            <span>{{ t('goal.list.goalColumn') }}</span>
            <span>{{ t('goal.list.keyResultsColumn') }}</span>
            <span>{{ t('goal.list.targetColumn') }}</span>
            <div class="grid grid-cols-[2.5rem_5rem] items-center gap-2">
              <span class="text-right">{{ t('goal.list.progressColumn') }}</span>
              <span aria-hidden="true" />
            </div>
          </div>

          <GoalProgressRow
            v-for="goal in goals"
            :key="goal.id"
            :goal="goal"
            @view="handleViewGoal(goal)"
            @edit="handleEditGoal(goal)"
            @delete="handleDeleteGoal(String(goal.id))"
          />
        </div>

        <template v-else>
          <AppEmptyState
            v-if="systemView === 'active'"
            :icon="Target"
            :title="t('goal.list.noGoalsFound')"
            :description="t('goal.list.createToStart')"
            :action-label="t('goal.list.createGoal')"
            testid="goals-empty-state"
            @action="openCreate"
          />
          <AppEmptyState v-else :title="t('goal.list.viewEmpty')" testid="goals-view-empty" />
        </template>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { vKeyboardList } from '../../../shared/keyboard/list-adapter';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Target } from '@lucide/vue';
import { ScrollArea, Skeleton, useConfirm } from '@memoflow/ui-vue-shadcn';
import GoalProgressRow from '../components/GoalProgressRow.vue';
import AppEmptyState from '../../../components/shared/AppEmptyState.vue';
import { useGoal } from '../composables/useGoal';
import type { GoalClientDTO } from '@memoflow/contracts/goal';
import { useRouteDialogState } from '../../../shared/composables/useRouteDialogState';

const { t } = useI18n();
const router = useRouter();
const goalDialogRoute = useRouteDialogState({ dialogValue: 'goal', identityQueryKeys: ['goalId'] });
const { goals, isLoading, systemView, deleteGoal } = useGoal();

function openCreate() {
  void goalDialogRoute.open({ name: 'goal-list' });
}
function handleViewGoal(goal: GoalClientDTO) {
  void router.push({ name: 'goal-detail', params: { id: goal.id } });
}
function handleEditGoal(goal: GoalClientDTO) {
  void goalDialogRoute.open({ name: 'goal-list' }, { goalId: String(goal.id) });
}
async function handleDeleteGoal(id: string) {
  const confirmed = await useConfirm({
    title: t('goal.list.confirmDeleteTitle'),
    description: t('goal.list.confirmDelete'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (confirmed) await deleteGoal(id);
}
</script>
