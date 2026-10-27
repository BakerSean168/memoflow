<template>
  <span
    v-if="visible"
    class="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] tabular-nums text-muted-foreground"
    data-testid="ai-runtime-usage"
    :title="title"
  >
    <span v-if="tokenLabel">{{ tokenLabel }}</span>
    <span v-if="tokenLabel && costLabel" aria-hidden="true">·</span>
    <span v-if="costLabel">{{ costLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AIRuntimeUsage } from '@memoflow/ai-contracts';

const props = defineProps<{ usage?: AIRuntimeUsage | null }>();

const visible = computed(
  () => props.usage?.totalTokens !== undefined || props.usage?.estimatedCost !== undefined,
);
const tokenLabel = computed(() => {
  const total = props.usage?.totalTokens;
  return total === undefined ? '' : `${new Intl.NumberFormat().format(total)} tok`;
});
const costLabel = computed(() => {
  const cost = props.usage?.estimatedCost;
  if (cost === undefined) return '';
  const digits = cost >= 0.01 ? 4 : 6;
  return `$${cost.toFixed(digits)}`;
});
const title = computed(() =>
  [
    props.usage?.promptTokens !== undefined ? `input ${props.usage.promptTokens}` : '',
    props.usage?.completionTokens !== undefined ? `output ${props.usage.completionTokens}` : '',
    tokenLabel.value,
    costLabel.value,
  ]
    .filter(Boolean)
    .join(' · '),
);
</script>
