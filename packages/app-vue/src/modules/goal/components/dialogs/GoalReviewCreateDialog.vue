<template>
  <Dialog
    :open="open"
    @update:open="
      (nextOpen) => {
        if (!nextOpen && !saving) emit('close');
      }
    "
  >
    <ProductDialogShell
      :open="open"
      test-id="goal-review-create-dialog"
      size="lg"
      height-mode="workspace"
      initial-focus-selector="#goal-review-reflection"
      body-class="space-y-5"
    >
      <template #title>{{ t('goal.reviewSnapshot.create') }}</template>
      <template #description>{{ goalName }}</template>

      <p v-if="contextLoading" role="status" class="text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </p>
      <p v-else-if="contextError" role="alert" class="text-sm text-destructive">
        {{ t('goal.error.loadReviewsFailed') }}
      </p>
      <GoalReviewSnapshot
        v-else-if="context"
        :context="context"
        :caption="t('goal.reviewSnapshot.defaultWindow')"
      />

      <div class="space-y-2">
        <Label for="goal-review-reflection">{{ t('goal.reviewSnapshot.reflection') }}</Label>
        <Textarea
          id="goal-review-reflection"
          v-model="reflection"
          class="min-h-32 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          :placeholder="t('goal.reviewSnapshot.reflectionPlaceholder')"
          :disabled="saving"
        />
      </div>

      <div class="space-y-2">
        <Label for="goal-review-challenges">{{ t('goal.reviewSnapshot.challenges') }}</Label>
        <Textarea
          id="goal-review-challenges"
          v-model="challenges"
          class="min-h-20 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          :disabled="saving"
        />
      </div>

      <div class="space-y-2">
        <Label for="goal-review-adjustments">{{ t('goal.reviewSnapshot.adjustments') }}</Label>
        <Textarea
          id="goal-review-adjustments"
          v-model="adjustments"
          class="min-h-20 border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.38)] shadow-none"
          :disabled="saving"
        />
      </div>

      <p v-if="submitError" role="alert" class="text-sm text-destructive">{{ submitError }}</p>

      <template #footer>
        <Button
          type="button"
          variant="ghost"
          data-testid="goal-review-cancel"
          :disabled="saving"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="button"
          data-testid="goal-review-save"
          :disabled="!reflection.trim() || saving"
          :loading="saving"
          @click="submit"
        >
          {{ t('goal.reviewSnapshot.save') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Label, Textarea } from '@memoflow/ui-vue-shadcn';
import type { GoalReviewClientDTO, GoalReviewSystemContext } from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';
import { ProductDialogShell } from '../../../../shared/components';
import { GOAL_SERVICE_KEY } from '../../../../di/keys';
import { useStrictInject } from '../../../../shared/utils/useStrictInject';
import GoalReviewSnapshot from '../GoalReviewSnapshot.vue';

const props = defineProps<{
  open: boolean;
  goalId: string;
  goalName: string;
  expectedVersion: number;
}>();
const emit = defineEmits<{
  close: [];
  saved: [review: GoalReviewClientDTO];
  'dirty-change': [dirty: boolean];
  'busy-change': [busy: boolean];
}>();

const { t } = useI18n();
const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
const context = ref<GoalReviewSystemContext | null>(null);
const contextLoading = ref(false);
const contextError = ref(false);
const reflection = ref('');
const challenges = ref('');
const adjustments = ref('');
const saving = ref(false);
const submitError = ref('');
let contextGeneration = 0;

// Each opening starts with an empty draft; exact comparison makes reverting clean again.
const dirty = computed(
  () => reflection.value !== '' || challenges.value !== '' || adjustments.value !== '',
);

function resetDraft(): void {
  reflection.value = '';
  challenges.value = '';
  adjustments.value = '';
  submitError.value = '';
  emit('dirty-change', false);
}

async function loadContext(session: number): Promise<void> {
  context.value = null;
  contextError.value = false;
  contextLoading.value = true;
  try {
    const result = await service.getGoalReviewContext(props.goalId);
    if (session !== contextGeneration) return;
    if (!result.ok) {
      contextError.value = true;
      return;
    }
    context.value = result.data;
  } catch {
    if (session === contextGeneration) contextError.value = true;
  } finally {
    if (session === contextGeneration) contextLoading.value = false;
  }
}

async function submit(): Promise<void> {
  if (!reflection.value.trim() || saving.value) return;
  submitError.value = '';
  saving.value = true;
  let saved = false;
  emit('busy-change', true);
  try {
    const result = await service.createGoalReview(props.goalId, {
      expectedVersion: props.expectedVersion,
      reflection: reflection.value,
      challenges: challenges.value.trim() || null,
      adjustments: adjustments.value.trim() || null,
    });
    if (!result.ok) {
      submitError.value = presentErrorMessage(result.error);
      return;
    }
    const reviewId = result.data.affectedEntityIds.reviewIds[0];
    const review = result.data.readModel.reviews.find(
      (item) => String(item.id) === String(reviewId),
    );
    if (!review) {
      submitError.value = t('goal.error.createReviewFailed');
      return;
    }
    // The command succeeded. Keep inputs locked until the owner finishes refreshing/navigating.
    saved = true;
    resetDraft();
    emit('saved', review);
  } catch (error) {
    submitError.value = presentErrorMessage(error);
  } finally {
    if (!saved) {
      saving.value = false;
      emit('busy-change', false);
    }
  }
}

watch(dirty, (value) => emit('dirty-change', props.open && value), {
  immediate: true,
  flush: 'sync',
});
watch(
  () => [props.open, props.goalId] as const,
  ([open]) => {
    const session = ++contextGeneration;
    if (!open) {
      context.value = null;
      contextLoading.value = false;
      contextError.value = false;
      return;
    }
    resetDraft();
    void loadContext(session);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  contextGeneration += 1;
  emit('dirty-change', false);
  emit('busy-change', false);
});
</script>
