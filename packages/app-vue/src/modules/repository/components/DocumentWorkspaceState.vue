<template>
  <div
    class="grid min-h-32 place-items-center px-6 py-8 text-center"
    :class="kind === 'error' ? 'text-destructive' : 'text-muted-foreground'"
    :role="kind === 'error' ? 'alert' : undefined"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
    data-testid="document-workspace-state"
    :data-state="kind"
  >
    <div class="max-w-md">
      <Loader2 v-if="kind === 'loading'" class="mx-auto h-5 w-5 animate-spin" />
      <div v-else-if="$slots.icon" class="mx-auto mb-3 flex justify-center">
        <slot name="icon" />
      </div>

      <p
        v-if="title"
        class="text-sm font-medium"
        :class="kind === 'error' ? '' : 'text-foreground'"
      >
        {{ title }}
      </p>
      <p v-if="description" class="mt-1 text-xs leading-5">
        {{ description }}
      </p>

      <div v-if="$slots.actions" class="mt-4 flex justify-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';

defineProps<{
  kind: 'loading' | 'error' | 'empty';
  title?: string;
  description?: string;
}>();
</script>
