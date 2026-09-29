<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <ModuleHeader>
      <template #leading>
        <Button
          variant="ghost"
          size="sm"
          @click="router.push({ name: 'goal-detail', params: { id: goalId } })"
        >
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
        <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em]">Goal review</h1>
      </template>
    </ModuleHeader>

    <div class="min-h-0 flex-1 overflow-auto px-4 py-4 @2xl/panel:px-6">
      <div v-if="review" class="mx-auto max-w-3xl space-y-5">
        <article class="border-b border-[hsl(var(--border-subtle))] pb-5">
          <p class="text-[11px] text-[hsl(var(--foreground-subtle))]">
            {{ formatProductDate(review.reviewedAt) }}
          </p>
          <p class="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-foreground">
            {{ review.reflection }}
          </p>

          <div v-if="review.challenges" class="mt-5">
            <h2 class="text-[12px] font-semibold">Challenges</h2>
            <p
              class="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
            >
              {{ review.challenges }}
            </p>
          </div>

          <div v-if="review.adjustments" class="mt-5">
            <h2 class="text-[12px] font-semibold">Adjustments</h2>
            <p
              class="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
            >
              {{ review.adjustments }}
            </p>
          </div>
        </article>

        <article
          class="rounded-xl bg-[hsl(var(--surface-raised)/0.42)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.58),inset_0_1px_0_hsl(var(--foreground)/0.02)]"
        >
          <div class="flex items-end justify-between gap-4">
            <div>
              <p class="text-[11px] text-[hsl(var(--foreground-subtle))]">
                Authoritative progress snapshot
              </p>
              <p class="mt-1 text-2xl font-semibold tracking-[-0.025em]">
                {{ review.systemContext.overallProgress.endPercentage }}%
              </p>
            </div>
            <span class="text-[12px] font-medium tabular-nums">
              {{ signed(review.systemContext.overallProgress.deltaPercentage) }}
            </span>
          </div>

          <Progress
            class="mt-4"
            :model-value="review.systemContext.overallProgress.endPercentage"
          />

          <div
            class="mt-4 divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"
          >
            <div
              v-for="kr in review.systemContext.keyResults"
              :key="kr.keyResultId"
              class="py-3"
            >
              <div class="flex items-center justify-between gap-4 text-[12px]">
                <span class="min-w-0 truncate font-medium">
                  {{ kr.title }}
                  <span class="font-normal text-[hsl(var(--foreground-subtle))]">
                    {{ kr.unit ?? '' }}
                  </span>
                </span>
                <span class="shrink-0 tabular-nums text-[hsl(var(--foreground-muted))]">
                  {{ kr.startPercentage }}% → {{ kr.endPercentage }}%
                </span>
              </div>
              <div
                class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-[hsl(var(--foreground-subtle))]"
              >
                <span
                  v-for="point in kr.trend"
                  :key="`${point.at}-${point.progressPercentage}`"
                >
                  {{ formatProductDate(point.at) }} {{ point.progressPercentage }}%
                </span>
              </div>
            </div>
          </div>

          <p class="mt-3 text-[10.5px] text-[hsl(var(--foreground-subtle))]">
            {{ review.systemContext.summary.recordCount }} records ·
            {{ review.systemContext.summary.taskContributionCount }} task contributions
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button, Progress } from '@memoflow/ui-vue-shadcn';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { useGoal } from '../composables/useGoal';
import { formatProductDate } from '../../../shared/utils/product-time';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { goalReviews, getGoalAggregateView } = useGoal();

const goalId = String(route.params.goalId ?? '');
const reviewId = String(route.params.reviewId ?? '');
const review = computed(
  () => goalReviews.value.find((item) => String(item.id) === reviewId) ?? null,
);

onMounted(() => void getGoalAggregateView(goalId));

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 100) / 100}%`;
}
</script>
