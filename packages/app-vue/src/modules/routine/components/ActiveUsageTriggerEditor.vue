<template>
  <Popover>
    <PopoverTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.activeMinutes')"
        data-testid="routine-active-duration-chip"
      >
        <template #icon><Activity class="h-3.5 w-3.5" /></template>
        {{ t('routine.form.activeMinutesValue', { value: activeMinutes }) }}
      </ProductPropertyChip>
    </PopoverTrigger>
    <ProductPopoverSurface recipe="property">
      <p class="text-xs font-medium text-muted-foreground">
        {{ t('routine.form.activeMinutes') }}
      </p>
      <div class="flex items-center gap-2">
        <NumberField
          v-model="activeMinutes"
          :min="1"
          :step="1"
          :disabled="disabled"
          data-testid="routine-activeMinutes"
          class="w-36"
        >
          <NumberFieldContent>
            <NumberFieldDecrement :aria-label="t('routine.form.activeMinutes') + ' −'" />
            <NumberFieldInput :aria-label="t('routine.form.activeMinutes')" class="h-8" />
            <NumberFieldIncrement :aria-label="t('routine.form.activeMinutes') + ' +'" />
          </NumberFieldContent>
        </NumberField>
        <span class="shrink-0 text-xs text-muted-foreground">
          {{ t('routine.form.minutes') }}
        </span>
      </div>
    </ProductPopoverSurface>
  </Popover>

  <Popover>
    <PopoverTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.naturalBreakMinutes')"
        data-testid="routine-natural-break-chip"
      >
        <template #icon><Clock3 class="h-3.5 w-3.5" /></template>
        {{ t('routine.form.naturalBreakValue', { value: naturalBreakMinutes }) }}
      </ProductPropertyChip>
    </PopoverTrigger>
    <ProductPopoverSurface recipe="property">
      <p class="text-xs font-medium text-muted-foreground">
        {{ t('routine.form.naturalBreakMinutes') }}
      </p>
      <div class="flex items-center gap-2">
        <NumberField
          v-model="naturalBreakMinutes"
          :min="0"
          :step="1"
          :disabled="disabled"
          data-testid="routine-naturalBreakMinutes"
          class="w-36"
        >
          <NumberFieldContent>
            <NumberFieldDecrement :aria-label="t('routine.form.naturalBreakMinutes') + ' −'" />
            <NumberFieldInput :aria-label="t('routine.form.naturalBreakMinutes')" class="h-8" />
            <NumberFieldIncrement :aria-label="t('routine.form.naturalBreakMinutes') + ' +'" />
          </NumberFieldContent>
        </NumberField>
        <span class="shrink-0 text-xs text-muted-foreground">
          {{ t('routine.form.minutes') }}
        </span>
      </div>
    </ProductPopoverSurface>
  </Popover>

  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.anchor')"
        data-testid="routine-anchor-chip"
      >
        <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
        {{ anchorLabel }}
      </ProductPropertyChip>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-52">
      <DropdownMenuRadioGroup :model-value="anchor" @update:model-value="updateAnchor">
        <DropdownMenuRadioItem
          v-for="option in anchorOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Activity, Clock3, Repeat2 } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
  Popover,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import { ProductPopoverSurface, ProductPropertyChip } from '../../../shared/components';
import type { RoutineActiveAnchor } from './routine-editor.types';

defineProps<{ disabled?: boolean }>();

const activeMinutes = defineModel<number>('activeMinutes', { required: true });
const naturalBreakMinutes = defineModel<number>('naturalBreakMinutes', { required: true });
const anchor = defineModel<RoutineActiveAnchor>('anchor', { required: true });
const { t } = useI18n();

const anchorOptions = computed(() => [
  { value: 'last-satisfied' as const, label: t('routine.trigger.lastSatisfied') },
  { value: 'profile-activation' as const, label: t('routine.trigger.profileActivation') },
]);

const anchorLabel = computed(
  () => anchorOptions.value.find((option) => option.value === anchor.value)?.label ?? '',
);

function updateAnchor(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = anchorOptions.value.find((candidate) => candidate.value === value);
  if (option) anchor.value = option.value;
}
</script>
