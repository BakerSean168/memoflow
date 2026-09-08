<template>
  <section class="space-y-4" aria-labelledby="task-metadata-heading">
    <header>
      <h3 id="task-metadata-heading" class="flex items-center text-sm font-semibold">
        <Info class="mr-2 h-5 w-5" />
        {{ t('task.metadata.title') }}
      </h3>
    </header>

    <div class="space-y-4">
      <div>
        <Label for="importance-select">{{ t('task.metadata.importance') }}</Label>
        <Select v-model="importance">
          <SelectTrigger id="importance-select" class="mt-1">
            <SelectValue :placeholder="t('task.metadata.selectImportance')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in importanceOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.title }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-2">
        <Label>{{ t('task.metadata.labels') }}</Label>
        <LabelPicker
          :model-value="labelIds"
          :options="labelOptions"
          :disabled="labelsLoading"
          :placeholder="t('task.metadata.labelsPlaceholder')"
          :search-placeholder="t('task.metadata.searchLabels')"
          :empty-text="t('task.metadata.noLabels')"
          :create-label="t('task.metadata.createLabel')"
          :aria-label="t('task.metadata.labels')"
          @update:model-value="updateLabelIds"
          @create="createAndSelectLabel"
        />
        <p v-if="labelCreateError" role="alert" class="text-xs text-destructive">
          {{ labelCreateError }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@memoflow/ui-vue-shadcn';
import { Info } from '@lucide/vue';
import type { TaskTemplateViewModel } from '../../types';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { useI18n } from 'vue-i18n';
import { LabelPicker } from '../../../../../shared/components';
import { useLabelCatalog } from '../../../../../shared/composables/useLabelCatalog';

const { t } = useI18n();
const props = defineProps<{ modelValue: TaskTemplateViewModel }>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskTemplateViewModel];
  'update:validation': [isValid: boolean];
}>();

const {
  labels: labelCatalog,
  options: labelOptions,
  isLoading: labelsLoading,
  createLabel,
} = useLabelCatalog();
const labelCreateError = ref<string | null>(null);

const updateTemplate = (updater: (template: TaskTemplateViewModel) => void) => {
  const updatedTemplate: TaskTemplateViewModel = {
    ...props.modelValue,
    labels: [...(props.modelValue.labels ?? [])],
    labelIds: [...(props.modelValue.labelIds ?? [])],
    timeConfig: { ...(props.modelValue.timeConfig || {}) },
  };
  updater(updatedTemplate);
  emit('update:modelValue', updatedTemplate);
};

const importanceOptions = computed(() => [
  { title: t('task.metadata.importanceCritical'), value: ImportanceLevel.Vital },
  { title: t('task.metadata.importanceHigh'), value: ImportanceLevel.Important },
  { title: t('task.metadata.importanceMedium'), value: ImportanceLevel.Moderate },
  { title: t('task.metadata.importanceLow'), value: ImportanceLevel.Minor },
  { title: t('task.metadata.importanceMinimal'), value: ImportanceLevel.Trivial },
]);

const importance = computed({
  get: () => props.modelValue.importance,
  set: (value: ImportanceLevel) => {
    updateTemplate((template) => {
      template.importance = value;
    });
  },
});

const labelIds = computed(() => props.modelValue.labelIds ?? props.modelValue.labels?.map((label) => label.id) ?? []);

function updateLabelIds(ids: string[]): void {
  const selected = new Set(ids);
  updateTemplate((template) => {
    template.labelIds = [...ids];
    template.labels = labelCatalog.value.filter((label) => selected.has(label.id));
  });
}

async function createAndSelectLabel(name: string): Promise<void> {
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    updateLabelIds([...new Set([...labelIds.value, label.id])]);
  } catch (error) {
    labelCreateError.value = error instanceof Error ? error.message : t('task.metadata.labelCreateFailed');
  }
}

const isValid = computed(() => Boolean(importance.value));
watch(
  () => importance.value,
  () => emit('update:validation', isValid.value),
  { immediate: true },
);
</script>
