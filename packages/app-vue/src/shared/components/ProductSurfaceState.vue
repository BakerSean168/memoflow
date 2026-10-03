<template>
  <div
    :class="cn(familyClass, kind === 'error' ? 'text-destructive' : 'text-muted-foreground')"
    :role="kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
    :data-testid="testId"
    :data-state="kind"
    :data-state-family="family"
  >
    <div class="max-w-md">
      <Loader2 v-if="kind === 'loading'" class="mx-auto h-5 w-5 animate-spin" />
      <div v-else-if="$slots.icon" class="mx-auto mb-3 flex justify-center">
        <slot name="icon" />
      </div>

      <p
        v-if="title"
        :class="
          cn(
            'text-sm font-medium',
            kind === 'error' ? '' : 'text-foreground',
            kind === 'loading' ? 'mt-3' : '',
          )
        "
      >
        {{ title }}
      </p>
      <p v-if="description" class="mt-1 text-xs leading-5">
        {{ description }}
      </p>

      <div v-if="$slots.actions" class="mt-4 flex flex-wrap justify-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from '@lucide/vue';
import { cn } from '@memoflow/ui-vue-shadcn';

const props = withDefaults(
  defineProps<{
    family: 'collection' | 'workspace' | 'dialog';
    kind: 'loading' | 'error' | 'empty';
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

const familyClass = computed(
  () =>
    ({
      collection: 'grid min-h-40 place-items-center px-6 py-12 text-center',
      workspace: 'grid min-h-32 place-items-center px-6 py-8 text-center',
      dialog:
        'grid min-h-24 place-items-center rounded-lg bg-[hsl(var(--surface-raised)/0.24)] px-4 py-5 text-center shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]',
    })[props.family],
);
</script>
