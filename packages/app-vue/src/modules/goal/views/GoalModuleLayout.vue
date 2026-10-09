<template>
  <div
    class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
    data-testid="goal-module-layout"
  >
    <GoalPageToolbar
      v-if="isListRoute"
      :system-views="views"
      :active-system-view="systemView"
      :visible-goal-count="goals.length"
      :label-options="labelOptions"
      :selected-label-ids="labelIdsAll"
      :labels-loading="labelsLoading"
      @create-goal="openCreate"
      @select-system-view="setSystemView"
      @update-labels="setLabelIdsAll"
    />
    <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <router-view />
      <GoalDialog
        :open="dialogOpen"
        @session-change="handleSessionChange"
        @update:open="handleDialogOpenUpdate"
        :mode="dialogMode"
        :goal="editingGoal"
        @dirty-change="goalDialogDirty = $event"
        @busy-change="goalDialogBusy = $event"
        @created="handleSaved"
        @updated="handleSaved"
        @create-with-ai="openCreateWithAI"
        @open-knowledge="openKnowledge"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  onActivated,
  onDeactivated,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { GoalClientDTO, GoalSystemView } from '@memoflow/contracts/goal';
import { GoalDialog } from '../components';
import GoalPageToolbar from '../components/GoalPageToolbar.vue';
import { useGoal } from '../composables/useGoal';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import { useRouteDialogState } from '../../../shared/composables/useRouteDialogState';

import { useGoalNativeSurfaceRegistration } from '../../../layouts/shell/useGoalNativeSurface';
import type { GoalNativeEditSession } from '../composables/goalNativeEditSession';

const nativeSurface = useGoalNativeSurfaceRegistration();
let unregisterSession: (() => void) | null = null;
let currentSession: GoalNativeEditSession | null = null;
let surfaceActive = true;
let goalsStale = false;
function handleSessionChange(session: GoalNativeEditSession | null): void {
  unregisterSession?.();
  currentSession = session;
  unregisterSession =
    session && surfaceActive ? (nativeSurface?.register(route.fullPath, session) ?? null) : null;
}
onActivated(() => {
  surfaceActive = true;
  if (goalsStale) {
    goalsStale = false;
    void fetchGoals();
  }
  if (dialogIdentity() !== lastSynchronizedIdentity) void syncDialogFromRoute();
  else if (currentSession) handleSessionChange(currentSession);
});
onDeactivated(() => {
  surfaceActive = false;
  handleSessionChange(null);
});
onUnmounted(() => {
  surfaceActive = false;
  handleSessionChange(null);
});

const route = useRoute();
const router = useRouter();
const routeDialog = useRouteDialogState({ dialogValue: 'goal', identityQueryKeys: ['goalId'] });
const { t } = useI18n();
const {
  goals,
  systemView,
  labelIdsAll,
  setSystemView,
  setLabelIdsAll,
  fetchGoals,
  getGoalAggregateView,
  isSaving,
} = useGoal();
const { options: labelOptions, isLoading: labelsLoading } = useLabelCatalog();

const dialogOpen = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingGoal = ref<GoalClientDTO | null>(null);
const goalDialogDirty = ref(false);
const goalDialogBusy = ref(false);
const isListRoute = computed(() => route.name === 'goal-list');
const panelSurfaceStatus = computed<'clean' | 'dirty' | 'busy'>(() => {
  if (goalDialogBusy.value || isSaving.value) return 'busy';
  return goalDialogDirty.value ? 'dirty' : 'clean';
});
usePanelSurfaceStatus(panelSurfaceStatus);

const views = computed(() => [
  { id: 'active' as GoalSystemView, label: t('goal.systemFolders.active') },
  { id: 'completed' as GoalSystemView, label: t('goal.systemFolders.completed') },
  { id: 'all' as GoalSystemView, label: t('goal.systemFolders.all') },
]);

function openCreate() {
  void routeDialog.open({ name: 'goal-list' });
}
function handleDialogOpenUpdate(open: boolean) {
  if (open) return;
  dialogOpen.value = false;
  goalDialogDirty.value = false;
  void routeDialog.close();
}
function openCreateWithAI() {
  if (goalDialogBusy.value || isSaving.value) return;
  dialogOpen.value = false;
  goalDialogDirty.value = false;
  void router.push({ path: '/', query: { workflow: 'goal-create' } });
}
function openKnowledge(goalId: string) {
  if (goalDialogBusy.value || isSaving.value) return;
  dialogOpen.value = false;
  goalDialogDirty.value = false;
  void router.push({ path: '/repository', query: { goalId } });
}

let loadRevision = 0;
let lastSynchronizedIdentity: string | null = null;
function dialogIdentity(): string {
  return JSON.stringify([route.name, route.query.dialog, route.query.goalId]);
}
async function syncDialogFromRoute() {
  if (!surfaceActive || dialogIdentity() === lastSynchronizedIdentity) return;
  lastSynchronizedIdentity = dialogIdentity();
  const revision = ++loadRevision;
  handleSessionChange(null);
  if (route.name !== 'goal-list' || route.query.dialog !== 'goal') {
    dialogOpen.value = false;
    editingGoal.value = null;
    goalDialogDirty.value = false;
    return;
  }
  const goalId = typeof route.query.goalId === 'string' ? route.query.goalId : null;
  if (!goalId) {
    dialogMode.value = 'create';
    editingGoal.value = null;
    dialogOpen.value = true;
    return;
  }

  dialogOpen.value = false;
  dialogMode.value = 'edit';
  let aggregate;
  try {
    aggregate = await getGoalAggregateView(goalId);
  } catch {
    if (revision === loadRevision) await routeDialog.close();
    return;
  }
  if (revision !== loadRevision) return;
  editingGoal.value = aggregate
    ? { ...aggregate.goal, keyResults: aggregate.keyResults, reviews: aggregate.reviews }
    : null;
  dialogOpen.value = editingGoal.value !== null;
  if (!editingGoal.value) await routeDialog.close();
}

async function handleSaved() {
  goalDialogDirty.value = false;
  await fetchGoals();
  await routeDialog.close();
}

function handleDatabaseTablesChanged(event: Event) {
  const detail = (event as CustomEvent<{ modules?: string[] }>).detail;
  if (!detail?.modules?.includes('goal')) return;
  if (surfaceActive) void fetchGoals();
  else goalsStale = true;
}

watch(
  [() => route.name, () => route.query.dialog, () => route.query.goalId],
  async () => {
    // KeepAlive lifecycle hooks are queued alongside post-render watchers.
    await nextTick();
    void syncDialogFromRoute();
  },
  { immediate: true, flush: 'post' },
);
// Filter/query changes do not reset the canonical draft; update its registration key.
watch(
  () => route.fullPath,
  async () => {
    await nextTick();
    if (surfaceActive && currentSession) handleSessionChange(currentSession);
  },
  { flush: 'post' },
);
onMounted(() => {
  window.addEventListener('db:tables-changed', handleDatabaseTablesChanged);
  void fetchGoals();
});
onUnmounted(() => {
  loadRevision += 1;
  window.removeEventListener('db:tables-changed', handleDatabaseTablesChanged);
});
</script>
