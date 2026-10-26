<template>
  <div
    class="relative isolate flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
    data-testid="goal-module-layout"
  >
    <GoalPageToolbar
      :inert="panelFormOpen"
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
    <main class="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
      <div
        :inert="panelFormOpen"
        class="min-h-0 flex-1 overflow-hidden"
        data-testid="goal-background-view"
      >
        <router-view />
      </div>
    </main>
    <GoalDialog
      presentation="panel"
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
  </div>
</template>

<script setup lang="ts">
import { goalUiHost } from '../goal-ui-host';
const { useLabelCatalog } = goalUiHost;
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
import type { GoalClientDTO, GoalSystemView } from '@memoflow/goal-contracts';
import { GoalDialog } from '../components';
import GoalPageToolbar from '../components/GoalPageToolbar.vue';
import { useGoal } from '../composables/useGoal';

import {
  useGoalNativeSurfaceRegistration,
  useGoalSurfaceStatus,
} from '../composables/goalSurfaceHost';
import type { GoalNativeEditSession } from '../composables/goalNativeEditSession';

const nativeSurface = useGoalNativeSurfaceRegistration();
let unregisterSession: (() => void) | null = null;
let currentSession: GoalNativeEditSession | null = null;
let pendingUserFocus = false;
let surfaceActive = true;
let goalsStale = false;
function handleSessionChange(session: GoalNativeEditSession | null): void {
  unregisterSession?.();
  currentSession = session;
  unregisterSession =
    session && surfaceActive ? (nativeSurface?.register(route.fullPath, session) ?? null) : null;
  if (session && surfaceActive && pendingUserFocus) {
    pendingUserFocus = false;
    void session.focus('name');
  }
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
  pendingUserFocus = false;
  returnFocusTarget = null;
  handleSessionChange(null);
});
onUnmounted(() => {
  surfaceActive = false;
  returnFocusTarget = null;
  handleSessionChange(null);
});

const route = useRoute();
const router = useRouter();
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

// The route owns the editor; every create/edit entry (including legacy dialog links)
// renders within the business pane. Inactive KeepAlive owners retain their drafts.
const panelFormOpen = ref(false);
let returnFocusTarget: HTMLElement | null = null;
// Restore keyboard focus only after the route watcher removes the toolbar's
// inert attribute. A single nextTick after router.replace is not sufficient:
// syncDialogFromRoute itself yields a tick before unblocking the native pane.
watch(
  panelFormOpen,
  (open) => {
    if (open || !returnFocusTarget) return;
    void nextTick().then(() => {
      if (panelFormOpen.value || !surfaceActive || route.name !== 'goal-list') return;
      const target = returnFocusTarget;
      returnFocusTarget = null;
      if (target?.isConnected && !target.closest('[inert]')) {
        target.focus({ preventScroll: true });
      }
    });
  },
  { flush: 'post' },
);

async function closeEditor() {
  const query = { ...route.query };
  delete query.goalForm;
  delete query.dialog;
  delete query.goalId;
  await router.replace({ path: route.path, query, hash: route.hash });
}
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
useGoalSurfaceStatus(panelSurfaceStatus);

const views = computed(() => [
  { id: 'active' as GoalSystemView, label: t('goal.systemFolders.active') },
  { id: 'completed' as GoalSystemView, label: t('goal.systemFolders.completed') },
  { id: 'all' as GoalSystemView, label: t('goal.systemFolders.all') },
]);

async function openCreate() {
  pendingUserFocus = true;
  // The explicit toolbar action is the correct return target even if a mouse
  // click did not make it document.activeElement.
  returnFocusTarget = document.querySelector<HTMLElement>('[data-testid="create-goal-entry"]');
  const query = { ...route.query };
  delete query.dialog;
  delete query.goalId;
  await router.push({
    name: 'goal-list',
    query: { ...query, goalForm: 'create' },
    hash: route.hash,
  });
  // Focus only on an explicit user entry. AI-controlled opening must never steal
  // keyboard focus from the concurrently visible conversation composer.
  await nextTick();
  if (surfaceActive && route.query.goalForm === 'create' && currentSession && pendingUserFocus) {
    pendingUserFocus = false;
    await currentSession.focus('name');
  }
}
function handleDialogOpenUpdate(open: boolean) {
  if (open) return;
  dialogOpen.value = false;
  goalDialogDirty.value = false;
  void closeEditor();
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
  return JSON.stringify([route.name, route.query.dialog, route.query.goalId, route.query.goalForm]);
}
async function syncDialogFromRoute() {
  if (!surfaceActive || dialogIdentity() === lastSynchronizedIdentity) return;
  lastSynchronizedIdentity = dialogIdentity();
  panelFormOpen.value =
    route.name === 'goal-list' &&
    (route.query.goalForm === 'create' ||
      route.query.goalForm === 'edit' ||
      route.query.dialog === 'goal');
  const revision = ++loadRevision;
  handleSessionChange(null);
  if (!panelFormOpen.value) {
    dialogOpen.value = false;
    editingGoal.value = null;
    goalDialogDirty.value = false;
    return;
  }
  const goalId = typeof route.query.goalId === 'string' ? route.query.goalId : null;
  if (route.query.goalForm === 'edit' && !goalId) {
    dialogOpen.value = false;
    void closeEditor();
    return;
  }
  if (route.query.goalForm === 'create' || !goalId) {
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
    if (revision === loadRevision) await closeEditor();
    return;
  }
  if (revision !== loadRevision) return;
  editingGoal.value = aggregate
    ? { ...aggregate.goal, keyResults: aggregate.keyResults, reviews: aggregate.reviews }
    : null;
  dialogOpen.value = editingGoal.value !== null;
  if (!editingGoal.value) await closeEditor();
}

async function handleSaved() {
  goalDialogDirty.value = false;
  await fetchGoals();
  await closeEditor();
}

function handleDatabaseTablesChanged(event: Event) {
  const detail = (event as CustomEvent<{ modules?: string[] }>).detail;
  if (!detail?.modules?.includes('goal')) return;
  if (surfaceActive) void fetchGoals();
  else goalsStale = true;
}

watch(
  [
    () => route.name,
    () => route.query.dialog,
    () => route.query.goalId,
    () => route.query.goalForm,
  ],
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
