<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <ModuleHeader>
      <template #leading>
        <Button variant="ghost" size="sm" @click="router.back()">
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
        <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em]">Create review</h1>
      </template>
    </ModuleHeader>

    <div class="min-h-0 flex-1 overflow-auto px-4 py-4 @2xl/panel:px-6">
      <div class="mx-auto max-w-3xl space-y-5">
        <article
          v-if="context"
          class="rounded-xl bg-[hsl(var(--surface-raised)/0.44)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.58),inset_0_1px_0_hsl(var(--foreground)/0.02)]"
        >
          <div class="flex items-end justify-between gap-4">
            <div>
              <p class="text-[11px] font-medium text-[hsl(var(--foreground-subtle))]">
                System facts · last {{ windowDays }} days
              </p>
              <p class="mt-1 text-2xl font-semibold tracking-[-0.025em]">
                {{ context.overallProgress.endPercentage }}%
              </p>
            </div>
            <span
              class="text-[12px] font-medium"
              :class="
                context.overallProgress.deltaPercentage >= 0
                  ? 'text-success'
                  : 'text-destructive'
              "
            >
              {{ signed(context.overallProgress.deltaPercentage) }}
            </span>
          </div>

          <Progress class="mt-4" :model-value="context.overallProgress.endPercentage" />

          <div class="mt-4 grid gap-2 sm:grid-cols-3">
            <div
              v-for="metric in [
                { label: 'Records', value: context.summary.recordCount },
                { label: 'Manual', value: context.summary.manualRecordCount },
                { label: 'Task contributions', value: context.summary.taskContributionCount },
              ]"
              :key="metric.label"
              class="rounded-lg bg-[hsl(var(--surface)/0.7)] px-3 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.45)]"
            >
              <p class="text-[10px] text-[hsl(var(--foreground-subtle))]">{{ metric.label }}</p>
              <p class="mt-0.5 text-[13px] font-semibold tabular-nums">{{ metric.value }}</p>
            </div>
          </div>

          <div class="mt-4 divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]">
            <div v-for="kr in context.keyResults" :key="kr.keyResultId" class="py-3">
              <div class="flex items-center justify-between gap-4 text-[12px]">
                <span class="min-w-0 truncate font-medium">{{ kr.title }}</span>
                <span class="shrink-0 tabular-nums text-[hsl(var(--foreground-muted))]">
                  {{ kr.startPercentage }}% → {{ kr.endPercentage }}%
                </span>
              </div>
              <Progress class="mt-2" :model-value="kr.endPercentage" />
            </div>
          </div>
        </article>

        <div class="space-y-2">
          <Label>Reflection</Label>
          <Textarea
            v-model="reflection"
            class="min-h-32 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
            placeholder="What happened, what did you learn?"
          />
        </div>

        <div class="space-y-2">
          <Label>Challenges</Label>
          <Textarea
            v-model="challenges"
            class="min-h-20 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          />
        </div>

        <div class="space-y-2">
          <Label>Adjustments</Label>
          <Textarea
            v-model="adjustments"
            class="min-h-20 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          />
        </div>

        <div class="flex justify-end border-t border-[hsl(var(--border-subtle))] pt-4">
          <Button :disabled="!reflection.trim() || saving" @click="submit">Save review</Button>
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
import { Button, Label, Progress, Textarea } from '@memoflow/ui-vue-shadcn';
import type { GoalReviewSystemContext } from '@memoflow/contracts/goal';
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

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 100) / 100}%`;
}
</script>
