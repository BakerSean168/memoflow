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
        <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em]">
          {{ t('goal.reviewSnapshot.detail') }}
        </h1>
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
            <h2 class="text-[12px] font-semibold">{{ t('goal.reviewSnapshot.challenges') }}</h2>
            <p
              class="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
            >
              {{ review.challenges }}
            </p>
          </div>

          <div v-if="review.adjustments" class="mt-5">
            <h2 class="text-[12px] font-semibold">{{ t('goal.reviewSnapshot.adjustments') }}</h2>
            <p
              class="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
            >
              {{ review.adjustments }}
            </p>
          </div>
        </article>

        <GoalReviewSnapshot
          :context="review.systemContext"
          :caption="t('goal.reviewSnapshot.saved')"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import GoalReviewSnapshot from '../components/GoalReviewSnapshot.vue';
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
</script>
