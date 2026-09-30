<template>
  <div
    class="relative border-t border-border/45"
    :class="readonly ? 'mt-2 flex min-h-32 flex-col pb-8' : 'mt-4 h-[14.5rem]'"
    :data-testid="readonly ? 'kr-trajectory-summary' : 'kr-trajectory-editor'"
  >
    <div
      v-if="unit && !readonly"
      class="pointer-events-none absolute left-1 top-3 z-10 text-[10px] font-medium tracking-wide text-muted-foreground/70"
      data-testid="kr-trajectory-unit"
    >
      {{ unit }}
    </div>

    <svg
      class="pointer-events-none w-full text-border"
      :class="readonly ? 'order-2 h-12 shrink-0' : 'absolute inset-0 h-full'"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1="7"
        y1="80"
        x2="93"
        y2="80"
        stroke="currentColor"
        stroke-width="0.34"
        opacity="0.72"
      />

      <line
        :x1="initialPoint.x"
        :y1="initialPoint.y"
        :x2="currentPoint.x"
        :y2="currentPoint.y"
        class="text-foreground/55"
        stroke="currentColor"
        stroke-width="1.1"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
      <line
        :x1="currentPoint.x"
        :y1="currentPoint.y"
        :x2="targetPoint.x"
        :y2="targetPoint.y"
        :class="hasTarget ? 'text-foreground/38' : 'text-muted-foreground/25'"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-dasharray="4.5 4.5"
        vector-effect="non-scaling-stroke"
      />

      <circle
        :cx="initialPoint.x"
        :cy="initialPoint.y"
        r="1.55"
        class="text-foreground/70"
        fill="currentColor"
      />
      <circle
        :cx="currentPoint.x"
        :cy="currentPoint.y"
        r="3"
        class="text-primary/15"
        fill="currentColor"
      />
      <circle
        :cx="currentPoint.x"
        :cy="currentPoint.y"
        r="1.75"
        class="text-primary"
        fill="currentColor"
      />
      <circle
        v-if="hasTarget"
        :cx="targetPoint.x"
        :cy="targetPoint.y"
        r="1.55"
        class="text-foreground/70"
        fill="currentColor"
      />
      <circle
        v-else
        :cx="targetPoint.x"
        :cy="targetPoint.y"
        r="1.75"
        class="text-muted-foreground/45"
        fill="none"
        stroke="currentColor"
        stroke-width="0.75"
        stroke-dasharray="1.25 1.25"
      />

      <line
        v-for="point in points"
        :key="'tick-' + point.x"
        :x1="point.x"
        y1="79"
        :x2="point.x"
        y2="81"
        stroke="currentColor"
        stroke-width="0.5"
        opacity="0.52"
      />
    </svg>

    <dl v-if="readonly" class="order-1 grid grid-cols-3 gap-2 py-1 text-center">
      <div>
        <dt class="text-[10px] font-medium text-muted-foreground">
          {{ t('goal.dialog.krTrajectoryStart') }}
        </dt>
        <dd class="break-words text-xs font-semibold tabular-nums" data-testid="kr-initial-value">
          {{ initialValue }}{{ unit ? ` ${unit}` : '' }}
        </dd>
      </div>
      <div>
        <dt class="text-[10px] font-medium text-primary/80">
          {{ t('goal.dialog.krTrajectoryCurrent') }}
        </dt>
        <dd>
          <button
            type="button"
            class="rounded-sm px-1 text-xs font-semibold tabular-nums text-primary underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :data-testid="checkInTestId"
            :aria-label="
              checkInLabel ? `${checkInLabel}: ${currentValue}${unit ? ` ${unit}` : ''}` : undefined
            "
            :disabled="disabled"
            @click="emit('check-in')"
          >
            {{ currentValue }}{{ unit ? ` ${unit}` : '' }}
          </button>
        </dd>
      </div>
      <div>
        <dt class="text-[10px] font-medium text-muted-foreground">
          {{ t('goal.dialog.krTrajectoryTarget') }}
        </dt>
        <dd class="break-words text-xs font-semibold tabular-nums" data-testid="kr-target-value">
          {{ hasTarget ? targetValue : '—' }}{{ unit && hasTarget ? ` ${unit}` : '' }}
        </dd>
      </div>
    </dl>

    <template v-else>
      <div
        class="group/value absolute z-10 -translate-x-1/2 -translate-y-full pb-2"
        :style="pointStyle(initialPoint)"
      >
        <label
          for="draft-kr-initial"
          class="mb-0.5 block text-center text-[10px] font-medium text-muted-foreground"
        >
          {{ t('goal.dialog.krInitialValue') }}
        </label>
        <Input
          id="draft-kr-initial"
          v-model.number="initialValue"
          type="number"
          inputmode="decimal"
          data-testid="draft-kr-initial-input"
          class="h-7 w-20 border-0 bg-transparent px-1.5 text-center text-sm font-semibold tabular-nums shadow-none ring-0 transition-colors hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--surface-overlay)/0.82)] focus-visible:ring-1 focus-visible:ring-ring/30"
          :disabled="disabled"
        />
      </div>

      <div
        class="group/value absolute z-10 -translate-x-1/2 -translate-y-full pb-2"
        :style="pointStyle(currentPoint)"
      >
        <label
          for="draft-kr-current"
          class="mb-0.5 block text-center text-[10px] font-medium text-primary/80"
        >
          {{ t('goal.dialog.krCurrentValue') }}
        </label>
        <Input
          id="draft-kr-current"
          v-model.number="currentValue"
          type="number"
          inputmode="decimal"
          data-testid="draft-kr-current-input"
          class="h-7 w-20 border-0 bg-primary/[0.04] px-1.5 text-center text-sm font-semibold tabular-nums shadow-none ring-0 transition-colors hover:bg-primary/[0.08] focus-visible:bg-background/90 focus-visible:ring-1 focus-visible:ring-primary/30"
          :disabled="disabled"
        />
      </div>

      <div
        class="group/value absolute z-10 -translate-x-1/2 -translate-y-full pb-2"
        :style="pointStyle(targetPoint)"
        :data-target-state="hasTarget ? 'set' : 'unset'"
      >
        <label
          for="draft-kr-target"
          class="mb-0.5 block text-center text-[10px] font-medium"
          :class="hasTarget ? 'text-muted-foreground' : 'text-muted-foreground/55'"
        >
          {{ t('goal.dialog.krTargetValue') }}
        </label>
        <Input
          id="draft-kr-target"
          v-model.number="targetValue"
          type="number"
          inputmode="decimal"
          placeholder="—"
          data-testid="draft-kr-target-input"
          class="h-7 w-20 border-0 bg-transparent px-1.5 text-center text-sm font-semibold tabular-nums shadow-none ring-0 transition-colors placeholder:text-muted-foreground/50 hover:bg-[hsl(var(--hover)/0.62)] focus-visible:bg-[hsl(var(--surface-overlay)/0.82)] focus-visible:ring-1 focus-visible:ring-ring/30"
          :class="hasTarget ? 'text-foreground' : 'text-muted-foreground/60'"
          :disabled="disabled"
        />
      </div>
    </template>

    <div
      class="pointer-events-none absolute bottom-3 left-[14%] w-[27%] -translate-x-1/2 text-center"
    >
      <p v-if="!readonly" class="text-[10px] font-medium text-foreground/65">
        {{ t('goal.dialog.krTrajectoryStart') }}
      </p>
      <p class="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground/75">
        {{ startLabel }}
      </p>
    </div>

    <div
      class="pointer-events-none absolute bottom-3 left-1/2 w-[27%] -translate-x-1/2 text-center"
    >
      <p v-if="!readonly" class="text-[10px] font-medium text-primary/75">
        {{ t('goal.dialog.krTrajectoryCurrent') }}
      </p>
      <p class="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground/75">
        {{ currentLabel }}
      </p>
    </div>

    <div
      class="pointer-events-none absolute bottom-3 left-[86%] w-[27%] -translate-x-1/2 text-center"
    >
      <p
        v-if="!readonly"
        class="text-[10px] font-medium"
        :class="hasTarget ? 'text-foreground/65' : 'text-muted-foreground/45'"
      >
        {{ t('goal.dialog.krTrajectoryTarget') }}
      </p>
      <p
        class="mt-0.5 truncate text-[10px] tabular-nums"
        :class="hasTarget ? 'text-muted-foreground/75' : 'text-muted-foreground/45'"
      >
        {{ targetLabel }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@memoflow/ui-vue-shadcn';

defineProps<{
  startLabel: string;
  currentLabel: string;
  targetLabel: string;
  unit: string;
  disabled?: boolean;
  readonly?: boolean;
  checkInLabel?: string;
  checkInTestId?: string;
}>();

const emit = defineEmits<{ 'check-in': [] }>();

const initialValue = defineModel<number>('initialValue', { required: true });
const currentValue = defineModel<number>('currentValue', { required: true });
const targetValue = defineModel<number | ''>('targetValue', { required: true });
const { t } = useI18n();

type ChartPoint = { x: number; y: number };

const hasTarget = computed(
  () => targetValue.value !== '' && Number.isFinite(Number(targetValue.value)),
);
const chartValues = computed(() => {
  const initial = finiteValue(initialValue.value, 0);
  const current = finiteValue(currentValue.value, initial);
  const target = hasTarget.value ? finiteValue(targetValue.value, current) : current;
  return { initial, current, target };
});

const verticalDomain = computed(() => {
  const values = hasTarget.value
    ? Object.values(chartValues.value)
    : [chartValues.value.initial, chartValues.value.current];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const padding = Math.max((max - min) * 0.2, 0.5);
  return { min: min - padding, max: max + padding };
});

const initialPoint = computed<ChartPoint>(() => ({
  x: 14,
  y: valueToY(chartValues.value.initial),
}));
const currentPoint = computed<ChartPoint>(() => ({
  x: 50,
  y: valueToY(chartValues.value.current),
}));
const targetPoint = computed<ChartPoint>(() => ({
  x: 86,
  y: hasTarget.value ? valueToY(chartValues.value.target) : currentPoint.value.y,
}));
const points = computed(() => [initialPoint.value, currentPoint.value, targetPoint.value]);

function finiteValue(value: number | '', fallback: number): number {
  if (value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function valueToY(value: number): number {
  const { min, max } = verticalDomain.value;
  const ratio = (value - min) / (max - min);
  return 66 - ratio * 36;
}

function pointStyle(point: ChartPoint): Record<string, string> {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
  };
}
</script>
