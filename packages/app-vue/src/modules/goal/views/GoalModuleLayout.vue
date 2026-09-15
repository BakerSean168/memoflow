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
        v-model:open="dialogOpen"
        :mode="dialogMode"
        :goal="editingGoal"
        @dirty-change="goalDialogDirty = $event"
        @created="handleSaved"
        @updated="handleSaved"
        @create-with-ai="openCreateWithAI"
        @open-knowledge="openKnowledge"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { GoalClientDTO, GoalSystemView } from '@memoflow/contracts/goal';
import { GoalDialog } from '../components';
import GoalPageToolbar from '../components/GoalPageToolbar.vue';
import { useGoal } from '../composables/useGoal';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';

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

const dialogOpen = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingGoal = ref<GoalClientDTO | null>(null);
const goalDialogDirty = ref(false);
const isListRoute = computed(() => route.name === 'goal-list');
const panelSurfaceStatus = computed<'clean' | 'dirty' | 'busy'>(() => {
  if (isSaving.value) return 'busy';
  return goalDialogDirty.value ? 'dirty' : 'clean';
});
usePanelSurfaceStatus(panelSurfaceStatus);

const views = computed(() => [
  { id: 'active' as GoalSystemView, label: t('goal.systemFolders.active') },
  { id: 'completed' as GoalSystemView, label: t('goal.systemFolders.completed') },
  { id: 'all' as GoalSystemView, label: t('goal.systemFolders.all') },
]);

function openCreate() {
  void router.push({ name: 'goal-list', query: { dialog: 'goal' } });
}
function openCreateWithAI() {
  dialogOpen.value = false;
  goalDialogDirty.value = false;
  void router.push({ path: '/', query: { workflow: 'goal-create' } });
}
function openKnowledge(goalId: string) {
  dialogOpen.value = false;
  goalDialogDirty.value = false;
  void router.push({ path: '/repository', query: { goalId } });
}

async function syncDialogFromRoute() {
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

  dialogMode.value = 'edit';
  const aggregate = await getGoalAggregateView(goalId);
  editingGoal.value = aggregate
    ? { ...aggregate.goal, keyResults: aggregate.keyResults, reviews: aggregate.reviews }
    : null;
  dialogOpen.value = editingGoal.value !== null;
  if (!editingGoal.value) await router.replace({ name: 'goal-list' });
}

async function handleSaved() {
  goalDialogDirty.value = false;
  await fetchGoals();
  await router.replace({ name: 'goal-list' });
}

function handleDatabaseTablesChanged(event: Event) {
  const detail = (event as CustomEvent<{ modules?: string[] }>).detail;
  if (detail?.modules?.includes('goal')) void fetchGoals();
}

watch(
  () => route.fullPath,
  () => void syncDialogFromRoute(),
  { immediate: true },
);
onMounted(() => {
  window.addEventListener('db:tables-changed', handleDatabaseTablesChanged);
  void fetchGoals();
});
onUnmounted(() => window.removeEventListener('db:tables-changed', handleDatabaseTablesChanged));
</script>
