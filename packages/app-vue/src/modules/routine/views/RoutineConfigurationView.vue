<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden"
    data-testid="routine-configuration-center"
  >
    <ModuleHeader data-testid="routine-list-toolbar">
      <template #leading>
        <ResponsiveSegmentedFilter
          :model-value="selectedState"
          :options="stateFilters"
          :accessible-label="t('routine.filter.status')"
          test-id="routine-state-filter"
          @update:model-value="updateStateFilter"
        />
      </template>

      <template #actions>
        <div class="flex shrink-0 items-center gap-1">
          <div
            class="flex h-8 items-center rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.5)] p-0.5"
            data-testid="routine-profile-scope-control"
          >
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 max-w-56 gap-1.5 rounded-sm px-2 text-muted-foreground"
                  data-testid="routine-profile-filter"
                >
                  <Layers3 class="h-3.5 w-3.5" />
                  <span class="truncate">{{ selectedProfileLabel }}</span>
                  <span
                    v-if="selectedProfile && !snapshot.preferences.globalEnabled"
                    class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    data-testid="routine-global-paused-indicator"
                    :title="t('routine.profile.globalPaused')"
                    role="status"
                  >
                    <Pause class="h-2.5 w-2.5" aria-hidden="true" />
                    <span class="sr-only">{{ t('routine.profile.globalPaused') }}</span>
                  </span>
                  <ChevronDown class="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" class="w-64">
                <DropdownMenuLabel>{{ t('routine.profile.filter') }}</DropdownMenuLabel>

                <DropdownMenuItem @click="selectedProfileId = null">
                  <Check
                    class="mr-2 h-4 w-4"
                    :class="selectedProfileId === null ? 'opacity-100' : 'opacity-0'"
                  />
                  <span class="flex-1">{{ t('routine.profile.all') }}</span>
                  <span class="text-xs tabular-nums text-muted-foreground">
                    {{ snapshot.definitions.length }}
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  v-for="profile in snapshot.profiles"
                  :key="profile.id"
                  :data-testid="`routine-profile-${profile.id}`"
                  @click="selectedProfileId = profile.id"
                >
                  <Check
                    class="mr-2 h-4 w-4"
                    :class="selectedProfileId === profile.id ? 'opacity-100' : 'opacity-0'"
                  />
                  <span
                    class="mr-2 h-1.5 w-1.5 shrink-0 rounded-full"
                    :class="profile.enabled ? 'bg-success' : 'bg-muted-foreground/30'"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ profile.name }}</span>
                  <span class="text-xs tabular-nums text-muted-foreground">
                    {{ routineCountForProfile(profile.id) }}
                  </span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <template v-if="selectedProfile">
                  <DropdownMenuItem
                    data-testid="routine-profile-runtime-action"
                    :disabled="
                      mutating || !selectedProfile.enabled || !snapshot.capabilities.localRuntime
                    "
                    @click="toggleProfileActive(selectedProfile, !selectedProfile.active)"
                  >
                    <component
                      :is="selectedProfile.active ? Pause : Play"
                      class="mr-2 h-4 w-4 shrink-0"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="text-sm">
                        {{
                          selectedProfile.active
                            ? t('routine.profile.pause')
                            : t('routine.profile.activate')
                        }}
                      </p>
                      <p
                        v-if="!snapshot.capabilities.localRuntime"
                        class="text-[11px] text-muted-foreground"
                      >
                        {{ t('routine.card.desktopRuntimeRequired') }}
                      </p>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem @click="openEditProfile(selectedProfile)">
                    <Pencil class="mr-2 h-4 w-4" />
                    {{ t('routine.profile.edit') }}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    class="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    :data-testid="`routine-profile-delete-${selectedProfile.id}`"
                    :disabled="mutating || routineCountForProfile(selectedProfile.id) > 0"
                    @click="removeProfile(selectedProfile)"
                  >
                    <Trash2 class="mr-2 h-4 w-4" />
                    {{ t('routine.profile.delete') }}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                </template>

                <DropdownMenuItem
                  data-testid="routine-create-profile-button"
                  @click="openCreateProfile"
                >
                  <Plus class="mr-2 h-4 w-4" />
                  {{ t('routine.profile.create') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div
              v-if="selectedProfile"
              class="flex h-7 items-center border-l border-[hsl(var(--border-subtle))] px-2"
              data-testid="routine-profile-enabled-control"
            >
              <Switch
                :model-value="selectedProfile.enabled"
                :disabled="loading || mutating"
                :aria-label="t('routine.profile.enabledHint')"
                :title="t('routine.profile.enabledHint')"
                data-testid="routine-profile-enabled-switch"
                @update:model-value="toggleProfileEnabled(selectedProfile, $event)"
              />
            </div>
            <div
              v-else
              class="flex h-7 items-center border-l border-[hsl(var(--border-subtle))] px-2"
              data-testid="routine-global-enabled-control"
            >
              <Switch
                :model-value="snapshot.preferences.globalEnabled"
                :disabled="loading || mutating"
                :aria-label="t('routine.profile.globalEnabledHint')"
                :title="t('routine.profile.globalEnabledHint')"
                data-testid="routine-global-enabled-switch"
                @update:model-value="toggleGlobalEnabled"
              />
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                size="sm"
                class="h-8 shrink-0 px-2 shadow-sm shadow-primary/15 @2xl/panel:px-3"
                :aria-label="t('routine.create')"
                data-testid="routine-create-button"
              >
                <Plus class="h-4 w-4 @2xl/panel:mr-1.5" />
                <span class="hidden @2xl/panel:inline">{{ t('routine.create') }}</span>
                <ChevronDown class="ml-1 hidden h-3.5 w-3.5 opacity-70 @2xl/panel:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-72" data-testid="routine-create-menu">
              <DropdownMenuItem data-testid="routine-create-blank" @click="openCreateRoutine()">
                <Plus class="mr-2 h-4 w-4" />
                <div class="min-w-0">
                  <p class="text-sm">{{ t('routine.method.blank') }}</p>
                  <p class="text-xs text-muted-foreground">{{ t('routine.method.blankHint') }}</p>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>{{ t('routine.method.title') }}</DropdownMenuLabel>

              <DropdownMenuItem
                v-for="method in ambientMethods"
                :key="method.id"
                :data-testid="`routine-template-${method.id}`"
                class="items-start"
                @click="openCreateRoutine(method)"
              >
                <Repeat2 class="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm">{{ methodName(method) }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ methodSchedule(method) }}</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </template>
    </ModuleHeader>

    <div
      class="min-h-0 flex-1 overflow-y-auto"
      data-testid="routine-scroll-host"
      data-scroll-host="routine"
    >
      <div class="mx-auto max-w-5xl px-4 py-3 @2xl/panel:px-6">
        <div v-if="loading" class="divide-y" data-testid="routine-list-skeleton">
          <div v-for="index in 6" :key="index" class="flex items-center gap-3 py-4">
            <Skeleton class="h-8 w-8 rounded-md" />
            <div class="min-w-0 flex-1 space-y-2">
              <Skeleton class="h-4 w-1/3" />
              <Skeleton class="h-3 w-1/2" />
            </div>
            <Skeleton class="h-5 w-10 rounded-full" />
          </div>
        </div>

        <div
          v-else-if="error"
          class="flex flex-col items-center gap-3 py-16 text-center"
          role="alert"
        >
          <p class="text-sm text-destructive">{{ error }}</p>
          <Button variant="outline" size="sm" @click="load">{{ t('routine.retry') }}</Button>
        </div>

        <template v-else>
          <div
            v-if="visibleDefinitions.length"
            class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"
            data-testid="routine-list"
          >
            <article
              v-for="routine in visibleDefinitions"
              :key="routine.id"
              class="group flex min-h-14 items-center gap-3"
              :data-testid="`routine-card-${routine.id}`"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left transition-colors hover:bg-[hsl(var(--hover)/0.52)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60"
                @click="openEditRoutine(routine)"
              >
                <div
                  class="hidden grid-cols-[minmax(0,1fr)_10rem_10rem] items-center gap-x-6 px-3 py-2.5 @2xl/panel:grid"
                  data-testid="routine-row-desktop"
                >
                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-2">
                      <span class="min-w-0 truncate text-[13px] font-medium text-foreground">
                        {{ routine.name }}
                      </span>
                      <Badge
                        v-if="overrideSummary(routine.id)"
                        variant="outline"
                        class="h-5 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
                      >
                        {{ overrideSummary(routine.id) }}
                      </Badge>
                    </div>
                    <p
                      v-if="routine.description"
                      class="mt-1 truncate text-[11px] text-muted-foreground"
                    >
                      {{ routine.description }}
                    </p>
                  </div>

                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-[12px] text-[hsl(var(--foreground-muted))]">
                      {{ triggerSummary(routine.trigger) }}
                    </span>
                    <Badge
                      v-if="localRuntimeUnavailable(routine.trigger)"
                      variant="outline"
                      class="h-5 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal text-muted-foreground"
                      data-testid="routine-desktop-runtime-badge"
                    >
                      {{ t('routine.card.desktopRuntimeRequired') }}
                    </Badge>
                  </div>

                  <span class="truncate text-[12px] text-[hsl(var(--foreground-muted))]">
                    {{ profileSummary(routine.id) }}
                  </span>
                </div>

                <div class="px-1 py-4 @2xl/panel:hidden" data-testid="routine-row-compact">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-sm font-medium text-foreground">
                      {{ routine.name }}
                    </span>
                    <Badge
                      v-if="overrideSummary(routine.id)"
                      variant="outline"
                      class="h-5 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
                    >
                      {{ overrideSummary(routine.id) }}
                    </Badge>
                  </div>
                  <p v-if="routine.description" class="mt-1 truncate text-xs text-muted-foreground">
                    {{ routine.description }}
                  </p>
                  <div class="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span class="truncate">{{ triggerSummary(routine.trigger) }}</span>
                    <Badge
                      v-if="localRuntimeUnavailable(routine.trigger)"
                      variant="outline"
                      class="h-5 shrink-0 rounded-full px-2 py-0 text-[10px] font-normal"
                    >
                      {{ t('routine.card.desktopRuntimeRequired') }}
                    </Badge>
                    <span aria-hidden="true">·</span>
                    <span class="truncate">{{ profileSummary(routine.id) }}</span>
                  </div>
                </div>
              </button>

              <div class="flex shrink-0 items-center gap-1.5 pr-1">
                <Switch
                  :model-value="routine.enabled"
                  :data-testid="`routine-toggle-${routine.id}`"
                  :aria-label="routine.name"
                  :disabled="mutating"
                  @update:model-value="toggleRoutine(routine, $event)"
                />

                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-muted-foreground opacity-70 transition-opacity hover:text-foreground @2xl/panel:opacity-0 @2xl/panel:group-hover:opacity-100 @2xl/panel:focus-within:opacity-100"
                      :aria-label="t('routine.card.moreActions')"
                      :data-testid="`routine-more-${routine.id}`"
                    >
                      <MoreHorizontal class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-44">
                    <DropdownMenuItem
                      v-if="overrideFor(routine.id)"
                      :disabled="mutating"
                      @click="clearOverride(routine)"
                    >
                      <Play class="mr-2 h-4 w-4" />
                      {{ t('routine.card.clearOverride') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem v-else :disabled="mutating" @click="snoozeRoutine(routine)">
                      <Clock3 class="mr-2 h-4 w-4" />
                      {{ t('routine.card.snooze30') }}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      class="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      :data-testid="`routine-delete-${routine.id}`"
                      :disabled="mutating"
                      @click="removeRoutine(routine)"
                    >
                      <Trash2 class="mr-2 h-4 w-4" />
                      {{ t('routine.delete') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          </div>

          <AppEmptyState
            v-else
            :icon="Repeat2"
            :title="t('routine.emptyTitle')"
            :description="t('routine.emptyDescription')"
            testid="routine-empty-state"
          />
        </template>
      </div>
    </div>

    <RoutineEditorDialog
      v-model:open="routineDialogOpen"
      :saving="mutating"
      :routine="editingRoutine"
      :profiles="snapshot.profiles"
      :membership-profile-ids="editingMembershipProfileIds"
      :preset="routinePreset"
      :local-runtime-available="snapshot.capabilities.localRuntime"
      @save="saveRoutine"
    />

    <RoutineProfileDialog
      v-model:open="profileDialogOpen"
      :saving="mutating"
      :profile="editingProfile"
      @save="saveProfile"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  Check,
  ChevronDown,
  Clock3,
  Layers3,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Trash2,
} from '@lucide/vue';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Switch,
} from '@memoflow/ui-vue-shadcn';
import type {
  RoutineDefinitionDto,
  RoutineProfileDto,
  RoutineTriggerDto,
} from '@memoflow/contracts/routine';
import {
  ROUTINE_METHOD_CATALOG,
  type RoutineMethodId,
  type RoutineMethodRecord,
} from '@memoflow/reminder/method-library';
import AppEmptyState from '../../../components/shared/AppEmptyState.vue';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { ResponsiveSegmentedFilter } from '../../../shared/components';
import RoutineEditorDialog, {
  type RoutineEditorPreset,
} from '../components/RoutineEditorDialog.vue';
import RoutineProfileDialog from '../components/RoutineProfileDialog.vue';
import { useRoutineConfiguration } from '../composables/useRoutineConfiguration';
import {
  formatProductHm,
  getProductTime,
  getProductTodayYmd,
} from '../../../shared/utils/product-time';

type RoutineStateFilter = 'all' | 'enabled' | 'disabled';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const {
  snapshot,
  loading,
  mutating,
  error,
  load,
  updatePreferences,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  createProfile,
  updateProfile,
  deleteProfile,
  replaceRoutineProfiles,
  setProfileActive,
  setTemporaryOverride,
  clearTemporaryOverride,
} = useRoutineConfiguration();

const ambientMethods = ROUTINE_METHOD_CATALOG.filter((method) => method.templatePreset !== null);

const methodLocaleKeyById: Record<RoutineMethodId, string> = {
  'stand-and-move': 'standAndMove',
  '20-20-20': 'eyeBreak202020',
  'drink-water': 'drinkWater',
  'sleep-wind-down': 'sleepWindDown',
  '50-10-protocol': 'focus5010',
  pomodoro: 'pomodoro',
};

const selectedState = ref<RoutineStateFilter>('all');
const selectedProfileId = ref<string | null>(null);
const routineDialogOpen = ref(false);
const editingRoutine = ref<RoutineDefinitionDto | null>(null);
const routinePreset = ref<RoutineEditorPreset | null>(null);
const profileDialogOpen = ref(false);
const editingProfile = ref<RoutineProfileDto | null>(null);

const stateFilters = computed(() => [
  { value: 'all' as const, label: t('routine.filter.all') },
  { value: 'enabled' as const, label: t('routine.filter.enabled') },
  { value: 'disabled' as const, label: t('routine.filter.disabled') },
]);

function updateStateFilter(value: string): void {
  if (value === 'all' || value === 'enabled' || value === 'disabled') {
    selectedState.value = value;
  }
}

const activeOverrides = computed(() =>
  snapshot.value.overrides.filter((override) => override.expiresAt > Date.now()),
);

const selectedProfile = computed(
  () => snapshot.value.profiles.find((profile) => profile.id === selectedProfileId.value) ?? null,
);

const selectedProfileLabel = computed(
  () => selectedProfile.value?.name ?? t('routine.profile.all'),
);

const visibleDefinitions = computed(() => {
  let definitions = snapshot.value.definitions;

  if (selectedState.value === 'enabled') {
    definitions = definitions.filter((definition) => definition.enabled);
  } else if (selectedState.value === 'disabled') {
    definitions = definitions.filter((definition) => !definition.enabled);
  }

  if (!selectedProfileId.value) return definitions;

  const routineIds = new Set(
    snapshot.value.memberships
      .filter((membership) => membership.profileId === selectedProfileId.value)
      .map((membership) => membership.routineId),
  );
  return definitions.filter((definition) => routineIds.has(definition.id));
});

const editingMembershipProfileIds = computed(() => {
  if (!editingRoutine.value) return [];
  return snapshot.value.memberships
    .filter((membership) => membership.routineId === editingRoutine.value?.id)
    .map((membership) => membership.profileId);
});

function routineCountForProfile(profileId: string): number {
  return new Set(
    snapshot.value.memberships
      .filter((membership) => membership.profileId === profileId)
      .map((membership) => membership.routineId),
  ).size;
}

function profilesForRoutine(routineId: string): RoutineProfileDto[] {
  const ids = new Set(
    snapshot.value.memberships
      .filter((membership) => membership.routineId === routineId)
      .map((membership) => membership.profileId),
  );
  return snapshot.value.profiles.filter((profile) => ids.has(profile.id));
}

function profileSummary(routineId: string): string {
  const profiles = profilesForRoutine(routineId);
  if (profiles.length === 0) return t('routine.card.noProfiles');
  return profiles.map((profile) => profile.name).join(' · ');
}

function overrideFor(routineId: string) {
  return activeOverrides.value.find((override) => override.routineId === routineId) ?? null;
}

function overrideSummary(routineId: string): string | null {
  const override = overrideFor(routineId);
  if (!override) return null;
  return t('routine.card.pausedUntil', { time: formatProductHm(override.expiresAt) });
}

function localRuntimeUnavailable(trigger: RoutineTriggerDto | null): boolean {
  return Boolean(
    trigger?.timingOwner === 'local-runtime' && !snapshot.value.capabilities.localRuntime,
  );
}

function triggerSummary(trigger: RoutineTriggerDto | null): string {
  if (!trigger) return t('routine.card.noTrigger');

  if (trigger.type === 'WallClock') {
    if (trigger.recurrence.frequency === 'daily' && trigger.recurrence.interval === 1) {
      return t('routine.trigger.dailyAt', { time: trigger.localTime });
    }
    return t('routine.trigger.recurringAt', {
      frequency: t(`routine.trigger.${trigger.recurrence.frequency}`),
      time: trigger.localTime,
    });
  }

  if (trigger.type === 'Elapsed') {
    return t('routine.trigger.everyMinutes', {
      minutes: Math.round(trigger.durationMs / 60_000),
    });
  }

  return t('routine.trigger.activeMinutes', {
    minutes: Math.round(trigger.requiredActiveMs / 60_000),
  });
}

function methodName(method: RoutineMethodRecord): string {
  return t(`routine.method.templates.${methodLocaleKeyById[method.id]}.name`);
}

function methodDescription(method: RoutineMethodRecord): string {
  return t(`routine.method.templates.${methodLocaleKeyById[method.id]}.description`);
}

function methodSchedule(method: RoutineMethodRecord): string {
  const { intervalMinutes, fixedTime } = method.recommendedParameters;
  if (intervalMinutes != null) {
    return t('routine.method.everyMinutes', { minutes: intervalMinutes });
  }
  if (fixedTime != null) {
    return t('routine.method.everyDayAt', { time: fixedTime });
  }
  return methodName(method);
}

function methodPreset(method: RoutineMethodRecord): RoutineEditorPreset | null {
  const preset = method.templatePreset;
  if (!preset) return null;

  if (preset.trigger.type === 'Elapsed') {
    return {
      name: methodName(method),
      description: methodDescription(method),
      trigger: {
        type: 'Elapsed',
        timingOwner: 'scheduler',
        durationMs: preset.trigger.durationMinutes * 60_000,
        anchor: 'last-satisfied',
      },
    };
  }

  const startDate = getProductTodayYmd();
  const timeZone = getProductTime().context.timeZone;
  return {
    name: methodName(method),
    description: methodDescription(method),
    trigger: {
      type: 'WallClock',
      timingOwner: 'scheduler',
      localTime: preset.trigger.localTime,
      timeZone,
      recurrence: {
        startDate,
        frequency: 'daily',
        interval: 1,
        byWeekday: [],
        count: null,
        until: null,
      },
    },
  };
}

function openCreateRoutine(method?: RoutineMethodRecord): void {
  editingRoutine.value = null;
  routinePreset.value = method ? methodPreset(method) : null;
  routineDialogOpen.value = true;
}

function openEditRoutine(routine: RoutineDefinitionDto): void {
  editingRoutine.value = routine;
  routinePreset.value = null;
  routineDialogOpen.value = true;
}

function routeRoutineId(): string | null {
  const value = route.query.routine;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || null;
  return null;
}

function openRoutineFromRoute(): void {
  const routineId = routeRoutineId();
  if (!routineId) return;
  const routine = snapshot.value.definitions.find((item) => item.id === routineId);
  if (!routine) return;
  if (routineDialogOpen.value && editingRoutine.value?.id === routineId) return;
  openEditRoutine(routine);
}

function clearRoutineRouteSelection(): void {
  if (!routeRoutineId()) return;
  const { routine: _routine, ...query } = route.query;
  void router.replace({ path: route.path, query }).catch(() => {});
}

function openCreateProfile(): void {
  editingProfile.value = null;
  profileDialogOpen.value = true;
}

function openEditProfile(profile: RoutineProfileDto): void {
  editingProfile.value = profile;
  profileDialogOpen.value = true;
}

async function saveRoutine(value: {
  name: string;
  description: string | null;
  trigger: RoutineTriggerDto | null;
  profileIds: string[];
}): Promise<void> {
  try {
    const current = editingRoutine.value;
    if (!current) {
      await createRoutine({
        name: value.name,
        description: value.description,
        trigger: value.trigger,
        profileIds: value.profileIds,
      });
      toast.success(t('routine.toast.created'));
    } else {
      const fieldsChanged =
        current.name !== value.name ||
        current.description !== value.description ||
        JSON.stringify(current.trigger) !== JSON.stringify(value.trigger);

      if (fieldsChanged) {
        await updateRoutine(current.id, {
          expectedVersion: current.version,
          name: value.name,
          description: value.description,
          trigger: value.trigger,
        });
      }

      const latest = snapshot.value.definitions.find((item) => item.id === current.id) ?? current;
      const existingProfileIds = editingMembershipProfileIds.value.slice().sort();
      const desiredProfileIds = [...value.profileIds].sort();
      if (JSON.stringify(existingProfileIds) !== JSON.stringify(desiredProfileIds)) {
        await replaceRoutineProfiles(current.id, {
          expectedVersion: latest.version,
          profileIds: value.profileIds,
        });
      }
      toast.success(t('routine.toast.updated'));
    }

    routineDialogOpen.value = false;
    editingRoutine.value = null;
    routinePreset.value = null;
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function saveProfile(value: { name: string; description: string | null }): Promise<void> {
  try {
    const current = editingProfile.value;
    if (!current) {
      await createProfile({ ...value, enabled: true });
      toast.success(t('routine.toast.profileCreated'));
    } else {
      await updateProfile(current.id, {
        expectedVersion: current.version,
        ...value,
      });
      toast.success(t('routine.toast.profileUpdated'));
    }

    profileDialogOpen.value = false;
    editingProfile.value = null;
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function toggleRoutine(routine: RoutineDefinitionDto, enabled: boolean): Promise<void> {
  try {
    await updateRoutine(routine.id, { expectedVersion: routine.version, enabled });
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function toggleGlobalEnabled(globalEnabled: boolean): Promise<void> {
  try {
    await updatePreferences({
      globalEnabled,
      expectedVersion: snapshot.value.preferences.version,
    });
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function toggleProfileEnabled(profile: RoutineProfileDto, enabled: boolean): Promise<void> {
  try {
    await updateProfile(profile.id, {
      expectedVersion: profile.version,
      enabled,
    });
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function toggleProfileActive(profile: RoutineProfileDto, active: boolean): Promise<void> {
  try {
    await setProfileActive(profile.id, { active });
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function snoozeRoutine(routine: RoutineDefinitionDto): Promise<void> {
  const until = Date.now() + 30 * 60_000;
  try {
    await setTemporaryOverride(routine.id, {
      snoozeUntil: until,
      expiresAt: until,
      reason: 'Routine Configuration Center: snooze 30 minutes',
      source: 'user',
    });
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function clearOverride(routine: RoutineDefinitionDto): Promise<void> {
  try {
    await clearTemporaryOverride(routine.id);
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function removeRoutine(routine: RoutineDefinitionDto): Promise<void> {
  if (typeof window !== 'undefined' && !window.confirm(t('routine.confirmDelete'))) return;
  try {
    await deleteRoutine(routine.id, { expectedVersion: routine.version });
    toast.success(t('routine.toast.deleted'));
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

async function removeProfile(profile: RoutineProfileDto): Promise<void> {
  if (routineCountForProfile(profile.id) > 0) return;
  if (typeof window !== 'undefined' && !window.confirm(t('routine.confirmDeleteProfile'))) return;

  try {
    await deleteProfile(profile.id, { expectedVersion: profile.version });
    if (selectedProfileId.value === profile.id) selectedProfileId.value = null;
    toast.success(t('routine.toast.profileDeleted'));
  } catch {
    toast.error(t('routine.toast.operationFailed'), { description: error.value ?? undefined });
  }
}

watch(
  () => route.query.routine,
  () => {
    openRoutineFromRoute();
  },
);

watch(routineDialogOpen, (open) => {
  if (!open) clearRoutineRouteSelection();
});

onMounted(() => {
  void load().then(() => {
    openRoutineFromRoute();
  });
});
</script>
