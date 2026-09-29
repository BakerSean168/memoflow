<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <ProductDialogShell
      :open="open"
      test-id="routine-editor-dialog"
      size="lg"
      height-mode="workspace"
      initial-focus-selector="[data-testid='routine-name-input']"
    >
      <template #title>{{ routine ? t('routine.edit') : t('routine.create') }}</template>

      <form
        id="routine-editor-form"
        class="flex min-h-full flex-col gap-6"
        @submit.prevent="submit"
      >
        <section
          class="space-y-4 border-b border-[hsl(var(--border-subtle))] pb-5"
          data-testid="routine-identity-section"
        >
          <div>
            <ProductAutoTextarea
              v-model="name"
              :max-length="100"
              :rows="1"
              data-testid="routine-name-input"
              class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
              :placeholder="t('routine.form.namePlaceholder')"
              :aria-label="t('routine.form.name')"
              :disabled="saving"
              @limit-exceeded="nameLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="nameLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
              >
                {{ t('routine.form.nameLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div>
            <ProductAutoTextarea
              v-model="description"
              :max-length="2000"
              :rows="2"
              data-testid="routine-description-input"
              class="min-h-8 text-sm leading-5 text-muted-foreground"
              :placeholder="t('routine.form.descriptionPlaceholder')"
              :aria-label="t('routine.form.description')"
              :disabled="saving"
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
              >
                {{ t('routine.form.descriptionLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div class="flex flex-wrap items-center gap-2" data-testid="routine-property-chips">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
                  :aria-label="t('routine.form.triggerType')"
                  data-testid="routine-trigger-type"
                  :data-trigger-type="triggerType"
                >
                  <template #icon>
                    <component :is="currentTriggerOption.icon" class="h-3.5 w-3.5" />
                  </template>
                  {{ triggerChipLabel }}
                </ProductPropertyChip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-52">
                <DropdownMenuRadioGroup
                  :model-value="triggerType"
                  @update:model-value="updateTriggerType"
                >
                  <DropdownMenuRadioItem
                    v-for="option in triggerOptions"
                    :key="option.value"
                    :value="option.value"
                    :data-testid="`routine-trigger-option-${option.value}`"
                    class="gap-2"
                  >
                    <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{{ option.label }}</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover v-if="triggerType === 'Elapsed'">
              <PopoverTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
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
                  <Input
                    v-model.number="durationMinutes"
                    type="number"
                    min="1"
                    step="1"
                    class="h-8"
                    :disabled="saving"
                  />
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ t('routine.form.minutes') }}
                  </span>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu v-if="triggerType === 'Elapsed'">
              <DropdownMenuTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
                  :aria-label="t('routine.form.anchor')"
                  data-testid="routine-anchor-chip"
                >
                  <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
                  {{ elapsedAnchorLabel }}
                </ProductPropertyChip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-52">
                <DropdownMenuRadioGroup
                  :model-value="elapsedAnchor"
                  @update:model-value="updateElapsedAnchor"
                >
                  <DropdownMenuRadioItem
                    v-for="option in elapsedAnchorOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover v-if="triggerType === 'ActiveUsage'">
              <PopoverTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
                  :aria-label="t('routine.form.activeMinutes')"
                  data-testid="routine-active-duration-chip"
                >
                  <template #icon><Activity class="h-3.5 w-3.5" /></template>
                  {{ t('routine.form.activeMinutesValue', { value: activeMinutes }) }}
                </ProductPropertyChip>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-56 space-y-2 p-3">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t('routine.form.activeMinutes') }}
                </p>
                <div class="flex items-center gap-2">
                  <Input
                    v-model.number="activeMinutes"
                    type="number"
                    min="1"
                    step="1"
                    class="h-8"
                    :disabled="saving"
                  />
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ t('routine.form.minutes') }}
                  </span>
                </div>
              </PopoverContent>
            </Popover>

            <Popover v-if="triggerType === 'ActiveUsage'">
              <PopoverTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
                  :aria-label="t('routine.form.naturalBreakMinutes')"
                  data-testid="routine-natural-break-chip"
                >
                  <template #icon><Clock3 class="h-3.5 w-3.5" /></template>
                  {{ t('routine.form.naturalBreakValue', { value: naturalBreakMinutes }) }}
                </ProductPropertyChip>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-56 space-y-2 p-3">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t('routine.form.naturalBreakMinutes') }}
                </p>
                <div class="flex items-center gap-2">
                  <Input
                    v-model.number="naturalBreakMinutes"
                    type="number"
                    min="0"
                    step="1"
                    class="h-8"
                    :disabled="saving"
                  />
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ t('routine.form.minutes') }}
                  </span>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu v-if="triggerType === 'ActiveUsage'">
              <DropdownMenuTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
                  :aria-label="t('routine.form.anchor')"
                  data-testid="routine-anchor-chip"
                >
                  <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
                  {{ activeAnchorLabel }}
                </ProductPropertyChip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-52">
                <DropdownMenuRadioGroup
                  :model-value="activeAnchor"
                  @update:model-value="updateActiveAnchor"
                >
                  <DropdownMenuRadioItem
                    v-for="option in activeAnchorOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <ProductPropertyChip
                  :disabled="saving"
                  :aria-label="t('routine.form.profiles')"
                  data-testid="routine-profile-picker"
                >
                  <template #icon><Layers3 class="h-3.5 w-3.5" /></template>
                  {{ selectedProfilesLabel }}
                </ProductPropertyChip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-64">
                <DropdownMenuLabel>{{ t('routine.form.profiles') }}</DropdownMenuLabel>
                <DropdownMenuItem v-if="profiles.length === 0" disabled>
                  {{ t('routine.profile.noProfiles') }}
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem
                  v-for="profile in profiles"
                  :key="profile.id"
                  :model-value="selectedProfileIds.includes(profile.id)"
                  :data-testid="`routine-profile-membership-${profile.id}`"
                  @update:model-value="toggleProfileSelection(profile.id)"
                  @select.prevent
                >
                  <span
                    class="mr-2 h-1.5 w-1.5 shrink-0 rounded-full"
                    :class="profile.active ? 'bg-success' : 'bg-muted-foreground/30'"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ profile.name }}</span>
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p
            v-if="requiresDesktopRuntime"
            class="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="routine-desktop-runtime-hint"
          >
            <Monitor class="h-3.5 w-3.5 shrink-0" />
            {{ t('routine.form.desktopRuntimeRequired') }}
          </p>
        </section>

        <section
          v-if="triggerType === 'WallClock'"
          class="divide-y divide-border/60"
          data-testid="routine-trigger-configuration"
        >
          <div class="routine-property-row">
            <span class="routine-property-label">{{ t('routine.form.localTime') }}</span>
            <input
              v-model="localTime"
              type="time"
              data-testid="routine-local-time"
              :aria-label="t('routine.form.localTime')"
              :disabled="saving"
              class="routine-borderless-control w-32"
            />
          </div>

          <div class="routine-property-row">
            <span class="routine-property-label">{{ t('routine.form.startDate') }}</span>
            <input
              v-model="startDate"
              type="date"
              data-testid="routine-start-date"
              :aria-label="t('routine.form.startDate')"
              :disabled="saving"
              class="routine-borderless-control w-40"
            />
          </div>

          <div class="routine-property-row">
            <span class="routine-property-label">{{ t('routine.form.frequency') }}</span>
            <div class="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <ProductPropertyChip
                    :disabled="saving"
                    :aria-label="t('routine.form.frequency')"
                    data-testid="routine-frequency-chip"
                  >
                    <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
                    {{ frequencyLabel }}
                  </ProductPropertyChip>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-40">
                  <DropdownMenuRadioGroup
                    :model-value="frequency"
                    @update:model-value="updateFrequency"
                  >
                    <DropdownMenuRadioItem
                      v-for="option in frequencyOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div class="routine-property-row">
            <span class="routine-property-label">{{ t('routine.form.interval') }}</span>
            <div class="flex items-center justify-end gap-2">
              <input
                v-model.number="recurrenceInterval"
                type="number"
                min="1"
                step="1"
                :aria-label="t('routine.form.interval')"
                :disabled="saving"
                class="routine-borderless-control w-20"
              />
              <span class="min-w-8 text-xs text-muted-foreground">{{ frequencyUnit }}</span>
            </div>
          </div>

          <div v-if="frequency === 'weekly'" class="routine-property-row">
            <span class="routine-property-label">{{ t('routine.form.weekdays') }}</span>
            <div class="flex flex-wrap justify-end gap-1">
              <button
                v-for="weekday in weekdayOptions"
                :key="weekday.value"
                type="button"
                class="h-7 min-w-7 rounded-md px-2 text-xs transition-colors"
                :class="
                  selectedWeekdays.includes(weekday.value)
                    ? 'bg-muted text-foreground'
                    : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
                "
                :aria-pressed="selectedWeekdays.includes(weekday.value)"
                :disabled="saving"
                @click="toggleWeekday(weekday.value)"
              >
                {{ weekday.label }}
              </button>
            </div>
          </div>

          <div class="routine-property-row">
            <span class="routine-property-label">{{ t('routine.form.timeZone') }}</span>
            <input
              v-model="timeZone"
              type="text"
              :aria-label="t('routine.form.timeZone')"
              :disabled="saving"
              class="routine-borderless-control w-full max-w-64"
            />
          </div>
        </section>
      </form>

      <template #footer>
        <Button
          type="button"
          variant="ghost"
          data-testid="routine-editor-cancel"
          :disabled="saving"
          @click="emit('update:open', false)"
        >
          {{ t('routine.form.cancel') }}
        </Button>
        <Button
          type="submit"
          form="routine-editor-form"
          :disabled="!canSubmit || saving"
          :loading="saving"
          data-testid="routine-editor-save"
        >
          {{ routine ? t('routine.form.save') : t('routine.form.create') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Activity, CircleOff, Clock3, Layers3, Monitor, Repeat2 } from '@lucide/vue';
import {
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import type {
  RoutineDefinitionDto,
  RoutineProfileDto,
  RoutineTriggerDto,
} from '@memoflow/contracts/routine';
import {
  parseTimeZoneId,
  parseYmd,
  requireTimeZoneId,
  requireYmd,
} from '@memoflow/contracts/primitives';
import {
  ProductAutoTextarea,
  ProductDialogShell,
  ProductPropertyChip,
} from '../../../shared/components';
import { useTransientFeedback } from '../../../shared/composables/useTransientFeedback';
import { getProductTime, getProductTodayYmd } from '../../../shared/utils/product-time';

export interface RoutineEditorPreset {
  readonly name: string;
  readonly description: string;
  readonly trigger: RoutineTriggerDto | null;
}

type TriggerType = 'None' | RoutineTriggerDto['type'];
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ElapsedAnchor = 'routine-activation' | 'profile-activation' | 'last-satisfied';
type ActiveAnchor = 'profile-activation' | 'last-satisfied';

const props = withDefaults(
  defineProps<{
    open: boolean;
    saving?: boolean;
    routine?: RoutineDefinitionDto | null;
    profiles: readonly RoutineProfileDto[];
    membershipProfileIds?: readonly string[];
    preset?: RoutineEditorPreset | null;
    localRuntimeAvailable?: boolean;
  }>(),
  {
    saving: false,
    routine: null,
    membershipProfileIds: () => [],
    preset: null,
    localRuntimeAvailable: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [
    value: {
      name: string;
      description: string | null;
      trigger: RoutineTriggerDto | null;
      profileIds: string[];
    },
  ];
}>();

const { t } = useI18n();

const name = ref('');
const description = ref('');
const triggerType = ref<TriggerType>('None');
const localTime = ref('09:00');
const timeZone = ref('UTC');
const startDate = ref(String(getProductTodayYmd()));
const frequency = ref<Frequency>('daily');
const recurrenceInterval = ref(1);
const selectedWeekdays = ref<number[]>([]);
const durationMinutes = ref(50);
const elapsedAnchor = ref<ElapsedAnchor>('last-satisfied');
const activeMinutes = ref(50);
const naturalBreakMinutes = ref(5);
const activeAnchor = ref<ActiveAnchor>('last-satisfied');
const selectedProfileIds = ref<string[]>([]);
const nameLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();

const triggerOptions = computed(() => [
  { value: 'None' as const, label: t('routine.form.noTiming'), icon: CircleOff },
  { value: 'WallClock' as const, label: t('routine.form.wallClock'), icon: Clock3 },
  { value: 'Elapsed' as const, label: t('routine.form.elapsed'), icon: Repeat2 },
  { value: 'ActiveUsage' as const, label: t('routine.form.activeUsage'), icon: Activity },
]);

const currentTriggerOption = computed(
  () =>
    triggerOptions.value.find((option) => option.value === triggerType.value) ??
    triggerOptions.value[0]!,
);

const triggerChipLabel = computed(() =>
  triggerType.value === 'None' ? t('routine.form.timing') : currentTriggerOption.value.label,
);

const requiresDesktopRuntime = computed(
  () =>
    !props.localRuntimeAvailable &&
    (triggerType.value === 'ActiveUsage' ||
      (triggerType.value === 'Elapsed' && elapsedAnchor.value === 'profile-activation')),
);

const selectedProfilesLabel = computed(() => {
  const selected = props.profiles.filter((profile) =>
    selectedProfileIds.value.includes(profile.id),
  );
  if (selected.length === 0) return t('routine.form.profiles');
  if (selected.length === 1) return selected[0]!.name;
  return t('routine.form.profilesSummary', {
    name: selected[0]!.name,
    count: selected.length - 1,
  });
});

const frequencyOptions = computed(() => [
  { value: 'daily' as const, label: t('routine.trigger.daily') },
  { value: 'weekly' as const, label: t('routine.trigger.weekly') },
  { value: 'monthly' as const, label: t('routine.trigger.monthly') },
  { value: 'yearly' as const, label: t('routine.trigger.yearly') },
]);
const frequencyLabel = computed(
  () => frequencyOptions.value.find((option) => option.value === frequency.value)?.label ?? '',
);

const elapsedAnchorOptions = computed(() => [
  { value: 'last-satisfied' as const, label: t('routine.trigger.lastSatisfied') },
  { value: 'routine-activation' as const, label: t('routine.trigger.routineActivation') },
  { value: 'profile-activation' as const, label: t('routine.trigger.profileActivation') },
]);
const elapsedAnchorLabel = computed(
  () =>
    elapsedAnchorOptions.value.find((option) => option.value === elapsedAnchor.value)?.label ?? '',
);

const activeAnchorOptions = computed(() => [
  { value: 'last-satisfied' as const, label: t('routine.trigger.lastSatisfied') },
  { value: 'profile-activation' as const, label: t('routine.trigger.profileActivation') },
]);
const activeAnchorLabel = computed(
  () =>
    activeAnchorOptions.value.find((option) => option.value === activeAnchor.value)?.label ?? '',
);

const weekdayOptions = computed(() => [
  { value: 1, label: t('routine.form.weekdaysShort.mon') },
  { value: 2, label: t('routine.form.weekdaysShort.tue') },
  { value: 3, label: t('routine.form.weekdaysShort.wed') },
  { value: 4, label: t('routine.form.weekdaysShort.thu') },
  { value: 5, label: t('routine.form.weekdaysShort.fri') },
  { value: 6, label: t('routine.form.weekdaysShort.sat') },
  { value: 0, label: t('routine.form.weekdaysShort.sun') },
]);

const frequencyUnit = computed(() => t(`routine.form.frequencyUnits.${frequency.value}`));

function localYmd(): string {
  return String(getProductTodayYmd());
}

function browserTimeZone(): string {
  return String(getProductTime().context.timeZone);
}

function resetForm(): void {
  const source = props.routine;
  const preset = props.preset;
  name.value = source?.name ?? preset?.name ?? '';
  description.value = source?.description ?? preset?.description ?? '';
  selectedProfileIds.value = [...props.membershipProfileIds];
  nameLimitFeedback.hide();
  descriptionLimitFeedback.hide();

  const trigger = source?.trigger ?? preset?.trigger ?? null;
  triggerType.value = trigger?.type ?? 'None';
  localTime.value = trigger?.type === 'WallClock' ? trigger.localTime : '09:00';
  timeZone.value = trigger?.type === 'WallClock' ? trigger.timeZone : browserTimeZone();
  startDate.value = trigger?.type === 'WallClock' ? trigger.recurrence.startDate : localYmd();
  frequency.value = trigger?.type === 'WallClock' ? trigger.recurrence.frequency : 'daily';
  recurrenceInterval.value = trigger?.type === 'WallClock' ? trigger.recurrence.interval : 1;
  selectedWeekdays.value = trigger?.type === 'WallClock' ? [...trigger.recurrence.byWeekday] : [];
  durationMinutes.value =
    trigger?.type === 'Elapsed' ? Math.max(1, Math.round(trigger.durationMs / 60_000)) : 50;
  elapsedAnchor.value = trigger?.type === 'Elapsed' ? trigger.anchor : 'last-satisfied';
  activeMinutes.value =
    trigger?.type === 'ActiveUsage'
      ? Math.max(1, Math.round(trigger.requiredActiveMs / 60_000))
      : 50;
  naturalBreakMinutes.value =
    trigger?.type === 'ActiveUsage'
      ? trigger.naturalBreakCredit
        ? Math.max(1, Math.round(trigger.naturalBreakCredit.idleDurationMs / 60_000))
        : 0
      : 5;
  activeAnchor.value = trigger?.type === 'ActiveUsage' ? trigger.anchor : 'last-satisfied';
}

watch(
  () => [
    props.open,
    props.routine?.id,
    props.routine?.version,
    props.preset?.name,
    props.membershipProfileIds.join('|'),
  ],
  () => {
    if (props.open) resetForm();
  },
  { immediate: true },
);

const canSubmit = computed(() => {
  if (!name.value.trim()) return false;
  if (triggerType.value === 'WallClock') {
    return Boolean(
      localTime.value &&
      parseTimeZoneId(timeZone.value.trim()) &&
      parseYmd(startDate.value) &&
      recurrenceInterval.value > 0 &&
      (frequency.value !== 'weekly' || selectedWeekdays.value.length > 0),
    );
  }
  if (triggerType.value === 'Elapsed') return durationMinutes.value > 0;
  if (triggerType.value === 'ActiveUsage') return activeMinutes.value > 0;
  return true;
});

function updateTriggerType(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = triggerOptions.value.find((candidate) => candidate.value === value);
  if (option) triggerType.value = option.value;
}

function updateFrequency(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = frequencyOptions.value.find((candidate) => candidate.value === value);
  if (option) frequency.value = option.value;
}

function updateElapsedAnchor(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = elapsedAnchorOptions.value.find((candidate) => candidate.value === value);
  if (option) elapsedAnchor.value = option.value;
}

function updateActiveAnchor(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = activeAnchorOptions.value.find((candidate) => candidate.value === value);
  if (option) activeAnchor.value = option.value;
}

function toggleProfileSelection(profileId: string): void {
  selectedProfileIds.value = selectedProfileIds.value.includes(profileId)
    ? selectedProfileIds.value.filter((id) => id !== profileId)
    : [...selectedProfileIds.value, profileId];
}

function toggleWeekday(weekday: number): void {
  selectedWeekdays.value = selectedWeekdays.value.includes(weekday)
    ? selectedWeekdays.value.filter((value) => value !== weekday)
    : [...selectedWeekdays.value, weekday];
}

function buildTrigger(): RoutineTriggerDto | null {
  if (triggerType.value === 'None') return null;

  if (triggerType.value === 'WallClock') {
    return {
      type: 'WallClock',
      timingOwner: 'scheduler',
      localTime: localTime.value,
      timeZone: requireTimeZoneId(timeZone.value.trim()),
      recurrence: {
        startDate: requireYmd(startDate.value),
        frequency: frequency.value,
        interval: Math.max(1, Math.trunc(recurrenceInterval.value)),
        byWeekday:
          frequency.value === 'weekly' ? [...selectedWeekdays.value].sort((a, b) => a - b) : [],
        count: null,
        until: null,
      },
    };
  }

  if (triggerType.value === 'Elapsed') {
    const anchor = elapsedAnchor.value;
    return anchor === 'profile-activation'
      ? {
          type: 'Elapsed',
          timingOwner: 'local-runtime',
          durationMs: Math.max(1, durationMinutes.value) * 60_000,
          anchor,
        }
      : {
          type: 'Elapsed',
          timingOwner: 'scheduler',
          durationMs: Math.max(1, durationMinutes.value) * 60_000,
          anchor,
        };
  }

  return {
    type: 'ActiveUsage',
    timingOwner: 'local-runtime',
    requiredActiveMs: Math.max(1, activeMinutes.value) * 60_000,
    anchor: activeAnchor.value,
    naturalBreakCredit:
      naturalBreakMinutes.value > 0
        ? {
            idleDurationMs: naturalBreakMinutes.value * 60_000,
            effect: 'satisfy-and-reset',
          }
        : null,
    protocolBreakCredit: null,
  };
}

function submit(): void {
  if (!canSubmit.value || props.saving) return;
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim() || null,
    trigger: buildTrigger(),
    profileIds: [...selectedProfileIds.value],
  });
}

function handleOpenChange(value: boolean): void {
  emit('update:open', value);
}
</script>

<style scoped>
.routine-property-row {
  display: grid;
  grid-template-columns: minmax(7.5rem, 0.42fr) minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  padding-block: 0.75rem;
}

.routine-property-label {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: hsl(var(--muted-foreground));
}

.routine-borderless-control {
  margin-left: auto;
  height: 2rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  text-align: right;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: hsl(var(--foreground));
  box-shadow: none;
  outline: none;
}

.routine-borderless-control:focus,
.routine-borderless-control:focus-visible {
  outline: none;
  box-shadow: none;
}

.routine-borderless-control:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .routine-property-row {
    grid-template-columns: minmax(6.5rem, 0.45fr) minmax(0, 1fr);
    gap: 0.75rem;
  }
}
</style>
