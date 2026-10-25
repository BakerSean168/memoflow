<script lang="ts" setup>
import type { RangeCalendarNextProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { buttonVariants } from '../button';
import { cn } from '../../../lib/utils';
import { ChevronRightIcon } from '@radix-icons/vue';
import { RangeCalendarNext, useForwardProps } from 'reka-ui';
import { computed } from 'vue';

const props = defineProps<RangeCalendarNextProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <RangeCalendarNext
    :class="
      cn(
        buttonVariants({ variant: 'outline' }),
        'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <slot>
      <ChevronRightIcon class="h-4 w-4" />
    </slot>
  </RangeCalendarNext>
</template>
