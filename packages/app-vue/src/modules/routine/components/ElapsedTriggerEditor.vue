<template>
  <Popover>
    <PopoverTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.durationMinutes')"
        data-testid="routine-duration-chip"
      >
        <template #icon><Clock3 class="h-3.5 w-3.5" /></template>
        {{ t('routine.form.minutesValue', { value: durationMinutes }) }}
      </ProductPropertyChip>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-56 space-y-2 p-3">
      <p class="text-xs font-medium text-muted-foreground">
        {{ t('routine.form.durationMinutes') }}
      </p>
      <div class="flex items-center gap-2">
        <NumberField
          v-model="durationMinutes"
          :min="1"
          :step="1"
          :disabled="disabled"
          data-testid="routine-durationMinutes"
          class="w-36"
        >
          <NumberFieldContent>
            <NumberFieldDecrement :aria-label="t('routine.form.durationMinutes') + ' −'" />
            <NumberFieldInput :aria-label="t('routine.form.durationMinutes')" class="h-8" />
            <NumberFieldIncrement :aria-label="t('routine.form.durationMinutes') + ' +'" />
          </NumberFieldContent>
        </NumberField>
        <span class="shrink-0 text-xs text-muted-foreground">
          {{ t('routine.form.minutes') }}
        </span>
      </div>
    </PopoverContent>
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
import { Clock3, Repeat2 } from '@lucide/vue';
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
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import { ProductPropertyChip } from '../../../shared/components';
import type { RoutineElapsedAnchor } from './routine-editor.types';

defineProps<{ disabled?: boolean }>();

const durationMinutes = defineModel<number>('durationMinutes', { required: true });
const anchor = defineModel<RoutineElapsedAnchor>('anchor', { required: true });
const { t } = useI18n();

const anchorOptions = computed(() => [
  { value: 'last-satisfied' as const, label: t('routine.trigger.lastSatisfied') },
  { value: 'routine-activation' as const, label: t('routine.trigger.routineActivation') },
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
