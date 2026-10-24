<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import { DashIcon } from '@radix-icons/vue';
import { Primitive, useForwardProps } from 'reka-ui';

const props = defineProps<PrimitiveProps>();
const forwardedProps = useForwardProps(props);
</script>

<template>
  <Primitive v-bind="forwardedProps">
    <slot>
      <DashIcon />
    </slot>
  </Primitive>
</template>
