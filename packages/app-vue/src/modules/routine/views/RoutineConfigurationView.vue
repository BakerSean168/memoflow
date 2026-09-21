<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden" data-testid="routine-configuration-center">
    <ModuleHeader data-testid="routine-page-toolbar">
      <template #leading>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ t('routine.title') }}</p>
          <p class="hidden truncate text-xs text-muted-foreground @2xl/panel:block">
            {{ t('routine.description') }}
          </p>
        </div>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" class="h-8" @click="openCreateProfile">
          <Layers3 class="mr-1.5 h-4 w-4" />
          <span class="hidden @xl/panel:inline">{{ t('routine.profile.create') }}</span>
        </Button>
        <Button size="sm" class="h-8" data-testid="routine-create-button" @click="openCreateRoutine()">
          <Plus class="mr-1.5 h-4 w-4" />
          {{ t('routine.create') }}
        </Button>
      </template>
    </ModuleHeader>

    <div
      class="min-h-0 flex-1 overflow-y-auto"
      data-testid="routine-scroll-host"
      data-scroll-host="routine"
    >
      <div class="mx-auto max-w-6xl space-y-5 p-3 @2xl/panel:p-5">
        <div v-if="loading" class="grid gap-3 @xl/panel:grid-cols-2 @4xl/panel:grid-cols-4">
          <Skeleton v-for="index in 4" :key="index" class="h-20 rounded-xl" />
        </div>

        <div
          v-else-if="error"
          class="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 p-8 text-center"
          role="alert"
        >
          <p class="text-sm text-destructive">{{ error }}</p>
          <Button variant="outline" size="sm" @click="load">{{ t('routine.retry') }}</Button>
        </div>

        <template v-else>
          <section class="grid gap-3 @xl/panel:grid-cols-2 @4xl/panel:grid-cols-4" aria-label="Routine overview">
            <div class="rounded-xl border border-border bg-card p-4">
              <p class="text-xs text-muted-foreground">{{ t('routine.overview.routines') }}</p>
              <p class="mt-1 text-2xl font-semibold">{{ snapshot.definitions.length }}</p>
            </div>
            <div class="rounded-xl border border-border bg-card p-4">
              <p class="text-xs text-muted-foreground">{{ t('routine.overview.enabled') }}</p>
              <p class="mt-1 text-2xl font-semibold">{{ enabledCount }}</p>
            </div>
            <div class="rounded-xl border border-border bg-card p-4">
              <p class="text-xs text-muted-foreground">{{ t('routine.overview.activeProfiles') }}</p>
              <p class="mt-1 text-2xl font-semibold">{{ activeProfileCount }}</p>
            </div>
            <div class="rounded-xl border border-border bg-card p-4">
              <p class="text-xs text-muted-foreground">{{ t('routine.overview.overrides') }}</p>
              <p class="mt-1 text-2xl font-semibold">{{ activeOverrides.length }}</p>
            </div>
          </section>

          <div class="grid gap-5 @4xl/panel:grid-cols-[220px_minmax(0,1fr)]">
            <aside class="space-y-3">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold">{{ t('routine.profile.title') }}</h2>
                <Button variant="ghost" size="icon-sm" :aria-label="t('routine.profile.create')" @click="openCreateProfile">
                  <Plus class="h-4 w-4" />
                </Button>
              </div>

              <div class="space-y-1">
                <button
                  type="button"
                  class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors"
                  :class="selectedProfileId === null ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'"
                  @click="selectedProfileId = null"
                >
                  <span>{{ t('routine.profile.all') }}</span>
                  <span class="text-xs">{{ snapshot.definitions.length }}</span>
                </button>

                <div
                  v-for="profile in snapshot.profiles"
                  :key="profile.id"
                  class="group rounded-lg border border-transparent"
                  :class="selectedProfileId === profile.id ? 'border-border bg-accent/70' : ''"
                >
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left"
                    @click="selectedProfileId = profile.id"
                  >
                    <span
                      class="h-2 w-2 shrink-0 rounded-full"
                      :class="profile.active ? 'bg-success' : 'bg-muted-foreground/30'"
                    />
                    <span class="min-w-0 flex-1 truncate text-sm">{{ profile.name }}</span>
                    <span class="text-[10px] text-muted-foreground">{{ routineCountForProfile(profile.id) }}</span>
                  </button>
                  <div class="flex items-center justify-between gap-2 px-3 pb-2">
                    <Switch
                      :model-value="profile.active"
                      :aria-label="profile.active ? t('routine.profile.active') : t('routine.profile.inactive')"
                      :disabled="mutating || !profile.enabled || !snapshot.capabilities.localRuntime"
                      :title="snapshot.capabilities.localRuntime ? undefined : t('routine.trigger.desktopRuntime')"
                      @update:model-value="toggleProfileActive(profile, $event)"
                    />
                    <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                      <Button variant="ghost" size="icon-sm" :aria-label="t('routine.profile.edit')" @click.stop="openEditProfile(profile)">
                        <Pencil class="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        :aria-label="t('routine.delete')"
                        :disabled="mutating || routineCountForProfile(profile.id) > 0"
                        @click.stop="removeProfile(profile)"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <p v-if="snapshot.profiles.length === 0" class="px-3 py-4 text-xs text-muted-foreground">
                  {{ t('routine.profile.noProfiles') }}
                </p>
              </div>
            </aside>

            <main class="min-w-0 space-y-4">
              <div v-if="visibleDefinitions.length" class="space-y-3" data-testid="routine-list">
                <article
                  v-for="routine in visibleDefinitions"
                  :key="routine.id"
                  class="rounded-xl border border-border bg-card p-4"
                  :data-testid="`routine-card-${routine.id}`"
                >
                  <div class="flex items-start gap-3">
                    <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Repeat2 class="h-4 w-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="min-w-0 truncate text-sm font-semibold">{{ routine.name }}</h3>
                        <Badge :variant="routine.enabled ? 'secondary' : 'outline'">
                          {{ routine.enabled ? t('routine.profile.enabled') : t('routine.profile.disabled') }}
                        </Badge>
                        <Badge v-if="overrideFor(routine.id)" variant="outline">
                          {{ t('routine.card.temporaryOverride') }}
                        </Badge>
                      </div>
                      <p v-if="routine.description" class="mt-1 text-xs text-muted-foreground">
                        {{ routine.description }}
                      </p>
                      <div class="mt-3 flex flex-wrap gap-2 text-xs">
                        <span class="rounded-md bg-muted px-2 py-1">{{ triggerSummary(routine.trigger) }}</span>
                        <span
                          v-for="profile in profilesForRoutine(routine.id)"
                          :key="profile.id"
                          class="rounded-md bg-muted px-2 py-1 text-muted-foreground"
                        >
                          {{ profile.name }}
                        </span>
                        <span
                          v-if="profilesForRoutine(routine.id).length === 0"
                          class="rounded-md bg-muted px-2 py-1 text-muted-foreground"
                        >
                          {{ t('routine.card.noProfiles') }}
                        </span>
                      </div>
                    </div>
                    <Switch
                      :model-value="routine.enabled"
                      :aria-label="routine.name"
                      :disabled="mutating"
                      @update:model-value="toggleRoutine(routine, $event)"
                    />
                  </div>

                  <div class="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    <Button
                      v-if="overrideFor(routine.id)"
                      variant="ghost"
                      size="sm"
                      :disabled="mutating"
                      @click="clearOverride(routine)"
                    >
                      {{ t('routine.card.clearOverride') }}
                    </Button>
                    <Button
                      v-else
                      variant="ghost"
                      size="sm"
                      :disabled="mutating"
                      @click="snoozeRoutine(routine)"
                    >
                      <Clock3 class="mr-1.5 h-3.5 w-3.5" />
                      {{ t('routine.card.snooze30') }}
                    </Button>
                    <Button variant="outline" size="sm" :disabled="mutating" @click="openEditRoutine(routine)">
                      <Pencil class="mr-1.5 h-3.5 w-3.5" />
                      {{ t('routine.edit') }}
                    </Button>
                    <Button variant="ghost" size="sm" :disabled="mutating" @click="removeRoutine(routine)">
                      <Trash2 class="mr-1.5 h-3.5 w-3.5" />
                      {{ t('routine.delete') }}
                    </Button>
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

              <section class="space-y-3 pt-2" data-testid="routine-method-library">
                <div>
                  <h2 class="text-sm font-semibold">{{ t('routine.method.title') }}</h2>
                  <p class="mt-1 text-xs text-muted-foreground">{{ t('routine.method.description') }}</p>
                </div>
                <div class="grid gap-3 @2xl/panel:grid-cols-2">
                  <article
                    v-for="method in ROUTINE_METHOD_CATALOG"
                    :key="method.id"
                    class="rounded-xl border border-border bg-card p-4"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <h3 class="text-sm font-semibold">{{ method.name }}</h3>
                          <Badge variant="outline">{{ method.runtimeRequirement }}</Badge>
                        </div>
                        <p class="mt-1 text-xs text-muted-foreground">{{ method.summary }}</p>
                      </div>
                    </div>
                    <div class="mt-3">
                      <Button
                        v-if="method.templatePreset"
                        variant="outline"
                        size="sm"
                        @click="openCreateRoutine(method)"
                      >
                        {{ t('routine.method.use') }}
                      </Button>
                      <div v-else class="rounded-md bg-muted p-2">
                        <p class="text-xs font-medium">{{ t('routine.method.protocol') }}</p>
                        <p class="mt-0.5 text-xs text-muted-foreground">{{ t('routine.method.protocolHint') }}</p>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </main>
          </div>
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
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Clock3, Layers3, Pencil, Plus, Repeat2, Trash2 } from '@lucide/vue';
import { Badge, Button, Skeleton, Switch } from '@memoflow/ui-vue-shadcn';
import type {
  RoutineDefinitionDto,
  RoutineProfileDto,
  RoutineTriggerDto,
} from '@memoflow/contracts/routine';
import {
  ROUTINE_METHOD_CATALOG,
  type RoutineMethodRecord,
} from '@memoflow/reminder/method-library';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import AppEmptyState from '../../../components/shared/AppEmptyState.vue';
import RoutineEditorDialog, {
  type RoutineEditorPreset,
} from '../components/RoutineEditorDialog.vue';
import RoutineProfileDialog from '../components/RoutineProfileDialog.vue';
import { useRoutineConfiguration } from '../composables/useRoutineConfiguration';
import { getProductTime, getProductTodayYmd } from '../../../shared/utils/product-time';

const { t } = useI18n();
const {
  snapshot,
  loading,
  mutating,
  error,
  enabledCount,
  activeProfileCount,
  load,
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

const selectedProfileId = ref<string | null>(null);
const routineDialogOpen = ref(false);
const editingRoutine = ref<RoutineDefinitionDto | null>(null);
const routinePreset = ref<RoutineEditorPreset | null>(null);
const profileDialogOpen = ref(false);
const editingProfile = ref<RoutineProfileDto | null>(null);

const activeOverrides = computed(() =>
  snapshot.value.overrides.filter((override) => override.expiresAt > Date.now()),
);

const visibleDefinitions = computed(() => {
  if (!selectedProfileId.value) return snapshot.value.definitions;
  const routineIds = new Set(
    snapshot.value.memberships
      .filter((membership) => membership.profileId === selectedProfileId.value)
      .map((membership) => membership.routineId),
  );
  return snapshot.value.definitions.filter((definition) => routineIds.has(definition.id));
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

function overrideFor(routineId: string) {
  return activeOverrides.value.find((override) => override.routineId === routineId) ?? null;
}

function triggerSummary(trigger: RoutineTriggerDto | null): string {
  if (!trigger) return t('routine.card.noTrigger');
  if (trigger.type === 'WallClock') {
    const frequency = t(`routine.trigger.${trigger.recurrence.frequency}`);
    return `${trigger.localTime} · ${frequency} · ${trigger.timeZone}`;
  }
  if (trigger.type === 'Elapsed') {
    return `${Math.round(trigger.durationMs / 60_000)} min · ${t('routine.trigger.desktopRuntime')}`;
  }
  return `${Math.round(trigger.requiredActiveMs / 60_000)} min · ${t('routine.trigger.desktopRuntime')}`;
}

function methodPreset(method: RoutineMethodRecord): RoutineEditorPreset | null {
  const preset = method.templatePreset;
  if (!preset) return null;
  if (preset.trigger.type === 'Elapsed') {
    return {
      name: preset.title,
      description: preset.description,
      trigger: {
        type: 'Elapsed',
        timingOwner: 'local-runtime',
        durationMs: preset.trigger.durationMinutes * 60_000,
        anchor: 'last-satisfied',
      },
    };
  }

  const startDate = getProductTodayYmd();
  const timeZone = getProductTime().context.timeZone;
  return {
    name: preset.title,
    description: preset.description,
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

async function saveProfile(value: {
  name: string;
  description: string | null;
  enabled: boolean;
}): Promise<void> {
  try {
    const current = editingProfile.value;
    if (!current) {
      await createProfile(value);
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

onMounted(() => {
  void load();
});
</script>
