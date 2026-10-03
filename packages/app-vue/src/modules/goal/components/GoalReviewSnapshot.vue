<template>
  <article
    class="rounded-xl bg-[hsl(var(--surface-raised)/0.44)] p-4"
    data-testid="review-snapshot"
  >
    <h2 class="text-[13px] font-semibold">{{ t('goal.reviewSnapshot.facts') }}</h2>
    <p class="mt-1 text-[11px] text-muted-foreground">{{ caption }}</p>
    <p class="mt-2 text-sm tabular-nums">
      {{ t('goal.reviewSnapshot.overall') }}: {{ context.overallProgress.startPercentage }}% →
      {{ context.overallProgress.endPercentage }}% ({{
        signed(context.overallProgress.deltaPercentage)
      }}
      {{ t('goal.reviewSnapshot.points') }})
    </p>
    <Progress class="mt-2" :model-value="context.overallProgress.endPercentage" />
    <p class="mt-3 text-xs tabular-nums">
      {{ counts(context.summary) }}
    </p>
    <div v-for="kr in context.keyResults" :key="kr.keyResultId" class="mt-3 border-t pt-3 text-xs">
      <p>
        {{ kr.title }} · {{ kr.startPercentage }}% → {{ kr.endPercentage }}% ({{
          signed(kr.deltaPercentage)
        }}
        {{ t('goal.reviewSnapshot.points') }})
      </p>
      <p class="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
        <span v-for="(point, index) in kr.trend" :key="index">
          {{ formatProductDate(point.at) }} {{ point.progressPercentage }}%
        </span>
      </p>
    </div>
    <h3 class="mt-4 text-xs font-semibold">{{ t('goal.reviewSnapshot.signals') }}</h3>
    <p v-if="!context.signals?.length" class="mt-2 text-xs text-muted-foreground">
      {{ t('goal.reviewSnapshot.legacy') }}
    </p>
    <ul v-else class="mt-2 space-y-2 text-xs" data-testid="review-signals">
      <li v-for="(signal, index) in context.signals" :key="index">
        <template v-if="signal.kind === 'overall-movement'">
          {{ t(`goal.reviewSnapshot.overallDirection.${signal.direction}`) }} ·
          {{ signal.evidence.startPercentage }}% → {{ signal.evidence.endPercentage }}% ({{
            signed(signal.evidence.deltaPercentage)
          }}
          {{ t('goal.reviewSnapshot.points') }})
        </template>
        <template v-else-if="signal.kind === 'key-result-movement'">
          <p>{{ t('goal.reviewSnapshot.krMovement') }}</p>
          <p v-for="item in signal.evidence" :key="item.keyResultId" class="mt-1">
            {{ item.title }}: {{ t(`goal.reviewSnapshot.krDirection.${item.direction}`) }} ·
            {{ item.startPercentage }}% → {{ item.endPercentage }}% ({{
              signed(item.deltaPercentage)
            }}
            {{ t('goal.reviewSnapshot.points') }})
          </p>
        </template>
        <template v-else-if="signal.kind === 'measurement-activity'">
          {{
            t(
              signal.evidence.recordCount === 0
                ? 'goal.reviewSnapshot.noActivity'
                : 'goal.reviewSnapshot.activity',
            )
          }}
          ·
          {{ counts(signal.evidence) }}
        </template>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Progress } from '@memoflow/ui-vue-shadcn';
import type { GoalReviewSystemContext } from '@memoflow/contracts/goal';
import { formatProductDate } from '../../../shared/utils/product-time';

defineProps<{ context: GoalReviewSystemContext; caption: string }>();
const { t } = useI18n();
function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${value}`;
}
function counts(summary: GoalReviewSystemContext['summary']) {
  return t('goal.reviewSnapshot.counts', summary);
}
</script>
