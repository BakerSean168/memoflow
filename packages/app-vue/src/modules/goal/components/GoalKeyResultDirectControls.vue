<template>
  <div class="min-w-0 space-y-1" data-testid="kr-direct-controls" :aria-busy="saving">
    <ProductAutoTextarea
      v-model="titleDraft"
      :max-length="KEY_RESULT_TITLE_MAX_LENGTH"
      :rows="1"
      :data-testid="`goal-kr-title-${keyResult.id}`"
      :aria-label="t('goal.dialog.krTitle')"
      class="min-h-7 rounded-md px-1 font-medium focus-visible:ring-2 focus-visible:ring-ring"
      :disabled="disabled || saving"
      @blur="saveTitle"
      @keydown.enter.exact.prevent="commitTitle"
      @keydown.esc.prevent="resetTitle"
    />
    <ProductAutoTextarea
      v-model="descriptionDraft"
      :max-length="KEY_RESULT_DESCRIPTION_MAX_LENGTH"
      :rows="1"
      :data-testid="`goal-kr-description-${keyResult.id}`"
      :aria-label="t('goal.dialog.description')"
      :placeholder="t('goal.dialog.krDescriptionPlaceholder')"
      class="min-h-6 rounded-md px-1 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      :disabled="disabled || saving"
      @blur="saveDescription"
      @keydown.ctrl.enter.prevent="commitDescription"
      @keydown.meta.enter.prevent="commitDescription"
      @keydown.esc.prevent="resetDescription"
    />
    <dl class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <div data-testid="kr-method">
        <dt class="sr-only">{{ t('goal.dialog.krCalculationMethod') }}</dt>
        <dd>
          <Select
            :model-value="keyResult.progress.aggregationMethod"
            :disabled="disabled || saving"
            @update:model-value="changeMethod"
          >
            <SelectTrigger
              :data-testid="`goal-kr-method-${keyResult.id}`"
              :aria-label="t('goal.dialog.krCalculationMethod')"
              class="h-7 w-auto gap-1 border-0 px-1 text-xs shadow-none focus:ring-2 focus:ring-ring"
            >
              {{ getKeyResultCalculationLabel(keyResult.progress.aggregationMethod, t) }}
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="method in KEY_RESULT_CALCULATION_METHODS"
                :key="method"
                :value="method"
              >
                {{ getKeyResultCalculationLabel(method, t) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </dd>
      </div>
      <div class="flex items-center gap-1" data-testid="kr-weight">
        <dt>{{ t('goal.dialog.krWeightShort') }}</dt>
        <dd>
          <Popover v-model:open="weightOpen">
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-ring"
                :data-testid="`goal-kr-weight-${keyResult.id}`"
                :aria-label="`${t('goal.dialog.krWeightLabel')}: ${keyResult.weight}`"
                :disabled="disabled || saving"
                >{{ keyResult.weight }}</Button
              >
            </PopoverTrigger>
            <PopoverContent align="start" class="w-44 p-1.5">
              <Button
                v-for="level in [1, 2, 3, 4, 5]"
                :key="level"
                type="button"
                variant="ghost"
                class="h-9 w-full justify-start focus-visible:ring-2 focus-visible:ring-ring"
                :data-testid="`goal-kr-weight-${keyResult.id}-option-${level}`"
                :aria-pressed="keyResult.weight === level"
                :disabled="disabled || saving"
                @click="changeWeight(level)"
                >{{ level }}</Button
              >
            </PopoverContent>
          </Popover>
        </dd>
      </div>
      <div class="flex items-center gap-1" data-testid="kr-timeframe">
        <dt>{{ t('goal.dialog.krTargetShort') }}</dt>
        <dd>
          <GoalTimeframePicker
            :model-value="keyResult.target ?? null"
            :test-id="`goal-kr-timeframe-${keyResult.id}`"
            :aria-label="t('goal.dialog.krTargetTimeframe')"
            :placeholder="effectiveTargetLabel"
            :disabled="disabled || saving"
            @update:model-value="changeTarget"
          />
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  goalTimeframeLabel,
  KEY_RESULT_DESCRIPTION_MAX_LENGTH,
  KEY_RESULT_TITLE_MAX_LENGTH,
  type GoalTimeframe,
  type KeyResultClientDTO,
  type UpdateKeyResultReq,
} from '@memoflow/contracts/goal';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@memoflow/ui-vue-shadcn';
import { ProductAutoTextarea } from '../../../shared/components';
import { KEY_RESULT_CALCULATION_METHODS, getKeyResultCalculationLabel } from '../utils';
import GoalTimeframePicker from './GoalTimeframePicker.vue';

type KrPropertyPatch = Pick<
  UpdateKeyResultReq,
  'title' | 'description' | 'calculationMethod' | 'weight' | 'target'
>;
const props = defineProps<{
  keyResult: KeyResultClientDTO;
  goalTarget: GoalTimeframe | null;
  disabled: boolean;
  onSave: (patch: KrPropertyPatch) => Promise<boolean>;
}>();
const { t, locale } = useI18n();
const titleDraft = ref('');
const descriptionDraft = ref('');
const saving = ref(false);
const weightOpen = ref(false);
const effectiveTargetLabel = computed(() => {
  const target = props.keyResult.target ?? props.goalTarget;
  return target ? goalTimeframeLabel(target, locale.value) : t('goal.dialog.krTrajectoryNotSet');
});
function resetTitle() {
  titleDraft.value = props.keyResult.title;
}
function resetDescription() {
  descriptionDraft.value = props.keyResult.description ?? '';
}
watch(() => props.keyResult.title, resetTitle, { immediate: true });
watch(() => props.keyResult.description, resetDescription, { immediate: true });
async function save(patch: KrPropertyPatch): Promise<void> {
  if (props.disabled || saving.value) {
    resetTitle();
    resetDescription();
    return;
  }
  saving.value = true;
  try {
    await props.onSave(patch);
    await nextTick();
  } finally {
    resetTitle();
    resetDescription();
    saving.value = false;
  }
}
async function saveTitle() {
  const title = titleDraft.value.trim();
  if (!title || title === props.keyResult.title) {
    resetTitle();
    return;
  }
  await save({ title });
}
async function saveDescription() {
  const description = descriptionDraft.value.trim() || null;
  if (description === (props.keyResult.description ?? null)) {
    resetDescription();
    return;
  }
  await save({ description });
}
function commitTitle(event: KeyboardEvent) {
  if (event.isComposing) return;
  void saveTitle();
}
function commitDescription(event: KeyboardEvent) {
  if (event.isComposing) return;
  void saveDescription();
}
function changeMethod(value: unknown) {
  const method = KEY_RESULT_CALCULATION_METHODS.find((item) => item === value);
  if (method && method !== props.keyResult.progress.aggregationMethod)
    void save({ calculationMethod: method });
}
function changeWeight(weight: number) {
  weightOpen.value = false;
  if (weight !== props.keyResult.weight) void save({ weight });
}
function changeTarget(target: GoalTimeframe | null) {
  if (JSON.stringify(target) !== JSON.stringify(props.keyResult.target ?? null))
    void save({ target });
}
</script>
