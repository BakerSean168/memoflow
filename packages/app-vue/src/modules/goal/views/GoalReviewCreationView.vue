<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <ModuleHeader>
      <template #leading>
        <Button variant="ghost" size="sm" @click="router.back()">
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
        <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em]">
          {{ t('goal.reviewSnapshot.create') }}
        </h1>
      </template>
    </ModuleHeader>

    <div class="min-h-0 flex-1 overflow-auto px-4 py-4 @2xl/panel:px-6">
      <div class="mx-auto max-w-3xl space-y-5">
        <GoalReviewSnapshot
          v-if="context"
          :context="context"
          :caption="t('goal.reviewSnapshot.previewWindow', { days: windowDays })"
        />

        <div class="space-y-2">
          <Label>{{ t('goal.reviewSnapshot.reflection') }}</Label>
          <Textarea
            v-model="reflection"
            class="min-h-32 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
            :placeholder="t('goal.reviewSnapshot.reflectionPlaceholder')"
          />
        </div>

        <div class="space-y-2">
          <Label>{{ t('goal.reviewSnapshot.challenges') }}</Label>
          <Textarea
            v-model="challenges"
            class="min-h-20 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          />
        </div>

        <div class="space-y-2">
          <Label>{{ t('goal.reviewSnapshot.adjustments') }}</Label>
          <Textarea
            v-model="adjustments"
            class="min-h-20 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          />
        </div>

        <div class="flex justify-end border-t border-[hsl(var(--border-subtle))] pt-4">
          <Button :disabled="!reflection.trim() || saving" @click="submit">{{
            t('goal.reviewSnapshot.save')
          }}</Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button, Label, Textarea } from '@memoflow/ui-vue-shadcn';
import type { GoalReviewSystemContext } from '@memoflow/contracts/goal';
import GoalReviewSnapshot from '../components/GoalReviewSnapshot.vue';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { useGoal } from '../composables/useGoal';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
const { getGoalAggregateView, createReview } = useGoal();

const goalId = String(route.params.goalId ?? '');
const windowDays = 7;
const context = ref<GoalReviewSystemContext | null>(null);
const reflection = ref('');
const challenges = ref('');
const adjustments = ref('');
const saving = ref(false);

onMounted(async () => {
  await getGoalAggregateView(goalId);
  const result = await service.getGoalReviewContext(goalId, windowDays);
  if (result.ok) context.value = result.data;
});

async function submit() {
  saving.value = true;
  try {
    const review = await createReview(goalId, {
      reflection: reflection.value,
      challenges: challenges.value.trim() || null,
      adjustments: adjustments.value.trim() || null,
      windowDays,
    });
    if (review) {
      await router.push({
        name: 'goal-review-detail',
        params: { goalId, reviewId: review.id },
      });
    }
  } finally {
    saving.value = false;
  }
}
</script>
