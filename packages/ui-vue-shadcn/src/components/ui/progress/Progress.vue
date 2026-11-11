<script setup lang="ts">
import type { ProgressRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { progressFillStyle } from '../../../lib/progress-fill';
import { cn } from '../../../lib/utils';
import { ProgressIndicator, ProgressRoot } from 'reka-ui';
import { computed } from 'vue';

const props = withDefaults(defineProps<ProgressRootProps & { class?: HTMLAttributes['class'] }>(), {
  modelValue: 0,
});

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const indicatorStyle = computed(() => progressFillStyle(props.modelValue));
</script>

<template>
  <ProgressRoot
    v-bind="delegatedProps"
    :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', props.class)"
  >
    <ProgressIndicator
      class="h-full w-full flex-1 transition-[clip-path] duration-500"
      :style="indicatorStyle"
    />
  </ProgressRoot>
</template>
