<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from '@lucide/vue';
import {
  semanticToneStatusClass,
  type SemanticTone,
} from '../../../shared/constants/semantic-tone';

const props = withDefaults(
  defineProps<{
    kind: 'loading' | 'error' | 'info' | 'success';
    title?: string;
    description?: string;
    testId?: string;
  }>(),
  {
    title: undefined,
    description: undefined,
    testId: undefined,
  },
);

const statusTone = computed<SemanticTone>(() => {
  if (props.kind === 'error') return 'destructive';
  if (props.kind === 'success') return 'success';
  if (props.kind === 'info') return 'info';
  return 'muted';
});

const statusToneClass = computed(() => semanticToneStatusClass(statusTone.value));
</script>

<template>
  <div
    class="flex min-w-0 items-start gap-3 rounded-md px-3 py-2.5 text-sm"
    :class="statusToneClass"
    :role="kind === 'error' ? 'alert' : 'status'"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
    :data-testid="testId"
    :data-state="kind"
  >
    <Loader2 v-if="kind === 'loading'" class="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-medium">{{ title }}</p>
      <p
        v-if="description"
        class="text-xs leading-5"
        :class="kind === 'error' ? 'text-destructive/90' : 'text-muted-foreground'"
      >
        {{ description }}
      </p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
