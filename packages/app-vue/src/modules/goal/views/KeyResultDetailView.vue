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
        <h1 v-if="kr" class="truncate text-[13px] font-semibold tracking-[-0.01em]">
          {{ kr.title }}
        </h1>
      </template>
    </ModuleHeader>

    <div v-if="kr" class="min-h-0 flex-1 overflow-auto px-4 py-4 @2xl/panel:px-6">
      <article
        class="mx-auto max-w-2xl rounded-xl bg-[hsl(var(--surface-raised)/0.42)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.58),inset_0_1px_0_hsl(var(--foreground)/0.02)]"
      >
        <div class="flex items-end justify-between gap-4">
          <div class="min-w-0">
            <p class="truncate text-[11px] text-[hsl(var(--foreground-subtle))]">
              {{ getKeyResultCalculationLabel(kr.progress.aggregationMethod, t) }}
            </p>
            <p class="mt-1 text-xl font-semibold tracking-[-0.02em]">
              {{ kr.progress.currentValue }} / {{ kr.progress.targetValue }}
              {{ kr.progress.unit ?? '' }}
            </p>
          </div>
          <span class="shrink-0 text-lg font-semibold tabular-nums">
            {{ Math.round(kr.progressPercentage) }}%
          </span>
        </div>

        <Progress class="mt-4" :model-value="kr.progressPercentage" />

        <dl
          class="mt-5 grid gap-x-6 gap-y-0 border-y border-[hsl(var(--border-subtle))] text-[12px] sm:grid-cols-2"
        >
          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-[hsl(var(--foreground-subtle))]">Initial value</dt>
            <dd class="font-medium">{{ kr.progress.initialValue }}</dd>
          </div>
          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-[hsl(var(--foreground-subtle))]">Target timeframe</dt>
            <dd class="font-medium">
              {{ kr.target ? goalTimeframeLabel(kr.target, locale) : '—' }}
            </dd>
          </div>
          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-[hsl(var(--foreground-subtle))]">Weight</dt>
            <dd class="font-medium">{{ kr.weight }}</dd>
          </div>
          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
            <dt class="text-[hsl(var(--foreground-subtle))]">Completed</dt>
            <dd class="font-medium">{{ kr.isCompleted ? 'Yes' : 'No' }}</dd>
          </div>
        </dl>

        <p
          v-if="kr.description"
          class="mt-4 text-[13px] leading-6 text-[hsl(var(--foreground-muted))]"
        >
          {{ kr.description }}
        </p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button, Progress } from '@memoflow/ui-vue-shadcn';
import { goalTimeframeLabel } from '@memoflow/contracts/goal';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { useGoal } from '../composables/useGoal';
import { getKeyResultCalculationLabel } from '../utils';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const { keyResults, getGoalAggregateView } = useGoal();

const goalId = String(route.params.goalId ?? '');
const keyResultId = String(route.params.keyResultId ?? '');
const kr = computed(
  () => keyResults.value.find((item) => String(item.id) === keyResultId) ?? null,
);

onMounted(() => void getGoalAggregateView(goalId));
</script>
