<template>
  <SheetContent
    :side="side"
    :hide-close="hideClose"
    :close-label="t('common.close')"
    :class="
      cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--surface-overlay))] p-0',
        widthClass,
        contentClass,
      )
    "
    data-product-sheet-recipe="narrow"
    :data-testid="testId"
  >
    <SheetHeader class="sr-only">
      <SheetTitle>{{ title }}</SheetTitle>
      <SheetDescription v-if="description">{{ description }}</SheetDescription>
    </SheetHeader>
    <slot />
  </SheetContent>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, type HTMLAttributes } from 'vue';
import {
  cn,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@memoflow/ui-vue-shadcn';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    side?: 'left' | 'right';
    width?: 'sm' | 'md';
    hideClose?: boolean;
    testId?: string;
    contentClass?: HTMLAttributes['class'];
  }>(),
  {
    description: undefined,
    side: 'right',
    width: 'md',
    hideClose: true,
    testId: undefined,
    contentClass: undefined,
  },
);

const { t } = useI18n();

const widthClass = computed(
  () =>
    ({
      sm: 'w-[min(88vw,22rem)]',
      md: 'w-[min(92vw,24rem)]',
    })[props.width],
);
</script>
