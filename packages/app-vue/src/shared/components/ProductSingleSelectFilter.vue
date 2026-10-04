<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :class="['h-8 max-w-44 shrink-0 gap-1.5 px-2', triggerClass]"
        :disabled="disabled"
        :aria-label="accessibleLabel"
        :data-testid="testId"
      >
        <component :is="icon ?? ListFilter" class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 truncate text-foreground">{{ currentLabel }}</span>
        <span
          v-if="showCurrentCount && currentOption?.count !== undefined"
          class="text-[10px] tabular-nums text-muted-foreground"
        >
          {{ currentOption.count }}
        </span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" :class="menuClass">
      <DropdownMenuRadioGroup :model-value="modelValue" @update:model-value="handleUpdate">
        <DropdownMenuRadioItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="disabled || option.disabled"
          :data-testid="option.itemTestId ?? (testId ? `${testId}-${option.value}` : undefined)"
        >
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <span
            v-if="option.count !== undefined"
            :data-testid="option.countTestId"
            class="ml-2 text-[10px] tabular-nums text-muted-foreground"
          >
            {{ option.count }}
          </span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed, type Component, type HTMLAttributes } from 'vue';
import { ChevronDown, ListFilter } from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import type { ResponsiveSegmentedFilterOption } from './responsive-segmented-filter.types';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly ResponsiveSegmentedFilterOption[];
    accessibleLabel: string;
    icon?: Component;
    testId?: string;
    disabled?: boolean;
    align?: 'start' | 'center' | 'end';
    triggerClass?: HTMLAttributes['class'];
    menuClass?: HTMLAttributes['class'];
    showCurrentCount?: boolean;
  }>(),
  {
    icon: undefined,
    testId: undefined,
    disabled: false,
    align: 'start',
    triggerClass: undefined,
    menuClass: 'w-44',
    showCurrentCount: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const currentOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const currentLabel = computed(() => currentOption.value?.label ?? props.modelValue);

function handleUpdate(value: unknown): void {
  if (typeof value !== 'string' || !value || value === props.modelValue) return;
  if (!props.options.some((option) => option.value === value && !option.disabled)) return;
  emit('update:modelValue', value);
}
</script>
