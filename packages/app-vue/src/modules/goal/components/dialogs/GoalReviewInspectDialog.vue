<template>
  <Dialog
    :open="open"
    @update:open="
      (nextOpen) => {
        if (!nextOpen) emit('close');
      }
    "
  >
    <ProductDialogShell
      :open="open"
      test-id="goal-review-inspect-dialog"
      size="lg"
      height-mode="workspace"
      initial-focus-selector="[data-testid=goal-review-inspect-close]"
      body-class="space-y-5"
    >
      <template #title>{{ t('goal.reviewSnapshot.detail') }}</template>
      <template #description>{{ goalName }}</template>

      <p v-if="loading" role="status" class="text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </p>
      <p v-else-if="loadError" role="alert" class="text-sm text-destructive">
        {{ t('goal.error.loadReviewsFailed') }}
      </p>
      <template v-else-if="review">
        <article class="border-b border-[hsl(var(--border-subtle))] pb-5">
          <p class="text-[11px] text-[hsl(var(--foreground-subtle))]">
            {{ formatProductDate(review.reviewedAt) }}
          </p>
          <p class="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-foreground">
            {{ review.reflection }}
          </p>
          <div v-if="review.challenges" class="mt-5">
            <h2 class="text-[12px] font-semibold">{{ t('goal.reviewSnapshot.challenges') }}</h2>
            <p class="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground">
              {{ review.challenges }}
            </p>
          </div>
          <div v-if="review.adjustments" class="mt-5">
            <h2 class="text-[12px] font-semibold">{{ t('goal.reviewSnapshot.adjustments') }}</h2>
            <p class="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground">
              {{ review.adjustments }}
            </p>
          </div>
        </article>
        <GoalReviewSnapshot
          :context="review.systemContext"
          :caption="t('goal.reviewSnapshot.saved')"
        />
      </template>
      <p v-else role="alert" data-testid="goal-review-not-found" class="text-sm">
        {{ t('goal.reviewSnapshot.reviewUnavailable') }}
      </p>

      <template #footer>
        <Button
          type="button"
          variant="ghost"
          data-testid="goal-review-inspect-close"
          @click="emit('close')"
        >
          {{ t('common.close') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import type { GoalReviewClientDTO } from '@memoflow/contracts/goal';
import { ProductDialogShell } from '../../../../shared/components';
import { formatProductDate } from '../../../../shared/utils/product-time';
import GoalReviewSnapshot from '../GoalReviewSnapshot.vue';

defineProps<{
  open: boolean;
  goalName: string;
  review: GoalReviewClientDTO | null;
  loading: boolean;
  loadError: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>
