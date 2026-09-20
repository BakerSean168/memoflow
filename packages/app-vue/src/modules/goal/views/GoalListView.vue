<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden" data-testid="goal-list-view">
    <ScrollArea
      class="min-h-0 flex-1 px-4 @2xl/panel:px-6"
      data-testid="goal-list-scroll"
      data-scroll-host="goal-list"
    >
      <div class="mx-auto max-w-5xl py-2">
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

        <div v-else-if="goals.length > 0" data-testid="goal-list">
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
          <p
            v-else
            class="py-16 text-center text-sm text-muted-foreground"
            data-testid="goals-view-empty"
          >
            {{ t('goal.list.viewEmpty') }}
          </p>
        </template>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
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
