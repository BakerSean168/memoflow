<template>
  <figure
    class="rounded-xl border border-border/55 bg-background/10 p-4 shadow-[0_1px_0_rgba(255,255,255,0.02)]"
    data-testid="kr-card-editor"
  >
    <figcaption>
      <div class="flex items-start gap-4">
        <div class="min-w-0 flex-1">
          <label for="draft-kr-title" class="sr-only">{{ t('goal.dialog.krTitle') }}</label>
          <ProductAutoTextarea
            id="draft-kr-title"
            v-model="title"
            :max-length="KEY_RESULT_TITLE_MAX_LENGTH"
            :rows="1"
            data-testid="draft-kr-title-input"
            class="min-h-8 py-0 text-base font-semibold leading-6 text-foreground"
            :placeholder="t('goal.dialog.krTitlePlaceholder')"
            @limit-exceeded="titleLimitFeedback.show()"
          />
          <Transition
            enter-active-class="transition-opacity duration-150"
            leave-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <p
              v-if="titleLimitFeedback.visible.value"
              class="mt-1 text-xs text-destructive"
              role="alert"
              data-testid="draft-kr-title-limit-error"
            >
              {{ t('goal.dialog.krTitleLimitExceeded') }}
            </p>
          </Transition>

          <label for="draft-kr-description" class="sr-only">
            {{ t('goal.dialog.description') }}
          </label>
          <ProductAutoTextarea
            id="draft-kr-description"
            v-model="description"
            :max-length="KEY_RESULT_DESCRIPTION_MAX_LENGTH"
            :rows="1"
            data-testid="draft-kr-description-input"
            class="mt-1 min-h-6 py-0 text-xs leading-5 text-muted-foreground"
            :placeholder="t('goal.dialog.krDescriptionPlaceholder')"
            @limit-exceeded="descriptionLimitFeedback.show()"
          />
          <Transition
            enter-active-class="transition-opacity duration-150"
            leave-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <p
              v-if="descriptionLimitFeedback.visible.value"
              class="mt-1 text-xs text-destructive"
              role="alert"
              data-testid="draft-kr-description-limit-error"
            >
              {{ t('goal.dialog.krDescriptionLimitExceeded') }}
            </p>
          </Transition>
        </div>

        <Popover v-model:open="weightOpen">
          <PopoverTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-7 shrink-0 gap-2 rounded-full px-2.5 text-xs font-normal text-muted-foreground hover:bg-muted/55 hover:text-foreground"
              :disabled="disabled"
              data-testid="draft-kr-weight"
            >
              <span class="leading-none">{{ t('goal.dialog.krWeightShort') }}</span>
              <span
                class="min-w-3 text-center font-semibold leading-none tabular-nums text-foreground/85"
              >
                {{ normalizedWeight }}
              </span>
              <span
                class="flex h-3 items-center gap-[2px]"
                aria-hidden="true"
                data-testid="draft-kr-weight-glyph"
              >
                <span
                  v-for="level in weightLevels"
                  :key="level"
                  class="block w-[3px] rounded-full transition-colors"
                  :class="level <= normalizedWeight ? 'bg-foreground/70' : 'bg-border/70'"
                  :style="{ height: `${3 + level * 1.25}px` }"
                />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            class="w-44 rounded-xl border-border/70 p-1.5 shadow-xl"
            data-testid="draft-kr-weight-popover"
          >
            <div class="px-2 py-1.5 text-xs text-muted-foreground">
              {{ t('goal.dialog.krWeightLabel') }}
            </div>
            <Button
              v-for="level in weightLevels"
              :key="level"
              type="button"
              variant="ghost"
              class="h-9 w-full justify-start gap-2 rounded-md px-2 font-normal"
              :class="normalizedWeight === level ? 'bg-accent text-accent-foreground' : ''"
              :data-testid="`draft-kr-weight-option-${level}`"
              @click="setWeight(level)"
            >
              <span class="flex h-3 w-7 items-center gap-[2px]" aria-hidden="true">
                <span
                  v-for="bar in weightLevels"
                  :key="bar"
                  class="block w-[3px] rounded-full"
                  :class="bar <= level ? 'bg-foreground/70' : 'bg-border/70'"
                  :style="{ height: `${3 + bar * 1.25}px` }"
                />
              </span>
              <span class="min-w-0 flex-1 text-left tabular-nums">{{ level }}</span>
              <Check
                class="h-4 w-4 shrink-0"
                :class="normalizedWeight === level ? 'opacity-100' : 'opacity-0'"
              />
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1">
          <Select v-model="calculationMethod" :disabled="disabled">
            <SelectTrigger
              data-testid="draft-kr-calculation-method"
              class="h-7 w-auto min-w-20 gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs shadow-none hover:bg-muted/55 focus:ring-1 focus:ring-ring/30"
            >
              <Sigma class="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="method in calculationMethods" :key="method" :value="method">
                {{ calculationMethodLabel(method) }}
              </SelectItem>
            </SelectContent>
          </Select>

          <div
            class="group flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors hover:bg-muted/55 focus-within:bg-muted/55"
          >
            <Plus v-if="!unit" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              id="draft-kr-unit"
              v-model="unit"
              data-testid="draft-kr-unit-input"
              maxlength="20"
              class="h-5 w-20 border-0 bg-transparent p-0 text-xs font-medium shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
              :placeholder="t('goal.dialog.krUnitShortPlaceholder')"
              :disabled="disabled"
            />
          </div>
        </div>

        <GoalTimeframePicker
          v-model="target"
          test-id="draft-kr-target-timeframe"
          :label="t('goal.dialog.krTargetShort')"
          :aria-label="t('goal.dialog.krTargetTimeframe')"
          :placeholder="effectiveTargetLabel"
          :disabled="disabled"
        />
      </div>
    </figcaption>

    <GoalKeyResultTrajectoryPlot
      v-model:initial-value="initialValue"
      v-model:current-value="currentValue"
      v-model:target-value="targetValue"
      :unit="unit"
      :start-label="startLabel"
      :current-label="currentLabel"
      :target-label="effectiveTargetLabel"
      :disabled="disabled"
    />
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Plus, Sigma } from '@lucide/vue';
import {
  goalTimeframeLabel,
  KEY_RESULT_DESCRIPTION_MAX_LENGTH,
  KEY_RESULT_TITLE_MAX_LENGTH,
  KeyResultCalculationMethod,
  type GoalTimeframe,
} from '@memoflow/contracts/goal';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import { ProductAutoTextarea } from '../../../shared/components';
import { useTransientFeedback } from '../../../shared/composables/useTransientFeedback';
import { formatProductYmd, getProductTodayYmd } from '../../../shared/utils/product-time';
import GoalTimeframePicker from './GoalTimeframePicker.vue';
import GoalKeyResultTrajectoryPlot from './GoalKeyResultTrajectoryPlot.vue';

const props = withDefaults(
  defineProps<{
    goalStart?: GoalTimeframe | null;
    goalTarget?: GoalTimeframe | null;
    disabled?: boolean;
  }>(),
  {
    goalStart: null,
    goalTarget: null,
    disabled: false,
  },
);

const title = defineModel<string>('title', { required: true });
const description = defineModel<string>('description', { required: true });
const initialValue = defineModel<number>('initialValue', { required: true });
const currentValue = defineModel<number>('currentValue', { required: true });
const targetValue = defineModel<number | ''>('targetValue', { required: true });
const target = defineModel<GoalTimeframe | null>('target', { required: true });
const calculationMethod = defineModel<KeyResultCalculationMethod>('calculationMethod', {
  required: true,
});
const unit = defineModel<string>('unit', { required: true });
const weight = defineModel<number>('weight', { required: true });

const { t, locale } = useI18n();
const titleLimitFeedback = useTransientFeedback();
const weightOpen = ref(false);
const descriptionLimitFeedback = useTransientFeedback();
const calculationMethods = Object.values(KeyResultCalculationMethod);
const weightLevels = [1, 2, 3, 4, 5] as const;

const normalizedWeight = computed(() =>
  Math.max(1, Math.min(5, Math.round(Number(weight.value) || 3))),
);
const startLabel = computed(() =>
  props.goalStart
    ? goalTimeframeLabel(props.goalStart, locale.value)
    : t('goal.dialog.krTrajectoryNotSet'),
);
const currentLabel = computed(() => formatProductYmd(getProductTodayYmd()));
const effectiveTargetLabel = computed(() => {
  const effective = target.value ?? props.goalTarget;
  return effective
    ? goalTimeframeLabel(effective, locale.value)
    : t('goal.dialog.krTrajectoryNotSet');
});

function setWeight(level: (typeof weightLevels)[number]): void {
  if (props.disabled) return;
  weight.value = level;
  weightOpen.value = false;
}

function calculationMethodLabel(method: KeyResultCalculationMethod): string {
  const labels: Record<KeyResultCalculationMethod, string> = {
    Sum: t('goal.dialog.krCalculationSum'),
    Average: t('goal.dialog.krCalculationAverage'),
    Max: t('goal.dialog.krCalculationMax'),
    Min: t('goal.dialog.krCalculationMin'),
    Last: t('goal.dialog.krCalculationLast'),
  };
  return labels[method];
}
</script>
