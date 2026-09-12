<template>
  <section
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="goal-detail-view"
  >
    <header class="flex min-h-14 items-center gap-2 border-b px-4">
      <Button variant="ghost" size="sm" @click="router.push({ name: 'goal-list' })">
        <ArrowLeft class="mr-1 h-4 w-4" />
        {{ t('common.back') }}
      </Button>
      <div v-if="goal" class="min-w-0">
        <h1 class="truncate font-semibold" data-testid="goal-detail-title">{{ goal.name }}</h1>
      </div>
      <div v-if="goal" class="ml-auto flex flex-wrap justify-end gap-1">
        <Button variant="ghost" size="sm" @click="editOpen = true">{{ t('common.edit') }}</Button>
        <Button size="sm" @click="openCreateKr">{{ t('goal.detail.addKR') }}</Button>
        <Button
          variant="outline"
          size="sm"
          @click="router.push({ name: 'goal-review-create', params: { goalId: goal.id } })"
        >
          {{ t('goal.detail.review') }}
        </Button>
      </div>
    </header>

    <div
      v-if="isLoading && !workspace"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t('common.loading') }}
    </div>
    <div
      v-else-if="error && !workspace"
      class="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      {{ error }}
    </div>

    <div v-else-if="goal && workspace" class="min-h-0 flex-1 overflow-auto p-4">
      <div class="mx-auto max-w-4xl space-y-6">
        <article
          class="space-y-5 rounded-xl border bg-card p-5"
          data-testid="goal-workspace-header"
        >
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">{{ goal.name }}</h2>
            <p v-if="goal.summary" class="mt-1 text-sm text-muted-foreground">{{ goal.summary }}</p>
          </div>

          <div class="flex flex-wrap items-center gap-2" data-testid="goal-detail-property-chips">
            <Badge variant="secondary">{{ statusLabel(goal.status) }}</Badge>
            <Badge v-if="goal.startDate" variant="outline">
              {{ t('goal.detail.startDate') }}: {{ formatProductYmd(goal.startDate) }}
            </Badge>
            <Badge v-if="goal.target" variant="outline">
              {{ t('goal.detail.target') }}: {{ formatTarget(goal.target) }}
            </Badge>
            <Badge v-for="label in goal.labels" :key="label.id" variant="outline">
              #{{ label.name }}
            </Badge>
            <Badge v-if="reminderCount > 0" variant="outline">
              {{ t('goal.dialog.reminderCount', { count: reminderCount }) }}
            </Badge>
            <Badge v-if="pastTarget" variant="secondary" data-testid="goal-past-target">
              {{ t('goal.list.pastTarget') }}
            </Badge>
          </div>

          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span>{{ t('goal.list.overallProgress') }}</span>
              <span>{{ Math.round(goal.overallProgress) }}%</span>
            </div>
            <Progress :model-value="goal.overallProgress" />
          </div>

          <div v-if="!goal.archivedAt" class="flex flex-wrap gap-2 border-t pt-4">
            <Button
              v-if="goal.status === 'Planned'"
              size="sm"
              data-testid="goal-start-action"
              :disabled="isSaving"
              @click="runLifecycle('activate')"
            >
              {{ t('goal.detail.startGoal') }}
            </Button>
            <Button
              v-if="goal.status === 'InProgress'"
              variant="outline"
              size="sm"
              :disabled="isSaving"
              @click="runLifecycle('plan')"
            >
              {{ t('goal.detail.returnToPlan') }}
            </Button>
            <Button
              v-if="goal.status === 'InProgress'"
              size="sm"
              :disabled="isSaving"
              @click="runLifecycle('complete')"
            >
              {{ t('goal.detail.completeGoal') }}
            </Button>
            <Button
              v-if="goal.status === 'Completed' || goal.status === 'Abandoned'"
              size="sm"
              :disabled="isSaving"
              @click="runLifecycle('activate')"
            >
              {{
                goal.status === 'Completed'
                  ? t('goal.detail.reopenGoal')
                  : t('goal.detail.resumeGoal')
              }}
            </Button>
            <Button
              v-if="goal.status === 'Abandoned'"
              variant="outline"
              size="sm"
              :disabled="isSaving"
              @click="runLifecycle('plan')"
            >
              {{ t('goal.detail.returnToPlan') }}
            </Button>
            <Button
              v-if="goal.status === 'Planned' || goal.status === 'InProgress'"
              variant="ghost"
              size="sm"
              class="text-destructive"
              :disabled="isSaving"
              @click="confirmAbandon"
            >
              {{ t('goal.detail.abandonGoal') }}
            </Button>
          </div>
          <p v-if="mutationError" role="alert" class="text-sm text-destructive">
            {{ mutationError }}
          </p>
        </article>

        <section class="space-y-3" data-testid="goal-workspace-key-results">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ t('goal.detail.keyResults') }}</h2>
            <span class="text-xs text-muted-foreground">{{ keyResults.length }}</span>
          </div>

          <div v-if="keyResults.length" class="divide-y rounded-xl border bg-card">
            <article v-for="kr in keyResults" :key="kr.id" class="p-4">
              <button
                type="button"
                class="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                @click="openKr(kr.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate font-medium">◇ {{ kr.title }}</h3>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {{ kr.progress.initialValue }} → {{ kr.progress.currentValue }} →
                      {{ kr.progress.targetValue
                      }}<span v-if="kr.progress.unit"> {{ kr.progress.unit }}</span>
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-sm font-medium">{{ Math.round(kr.progressPercentage) }}%</p>
                    <p v-if="kr.target" class="mt-1 text-xs text-muted-foreground">
                      {{ formatTarget(kr.target) }}
                    </p>
                  </div>
                </div>
                <Progress class="mt-3" :model-value="kr.progressPercentage" />
              </button>
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Button
                  v-if="linkedTaskCount(kr.id) > 0"
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs text-muted-foreground"
                  @click="openTasks(String(kr.id))"
                >
                  {{ t('goal.list.linkedTasks', { count: linkedTaskCount(kr.id) }) }} →
                </Button>
                <span v-else />
                <div class="flex gap-1">
                  <Button variant="ghost" size="sm" @click="openEditKr(kr)">{{
                    t('common.edit')
                  }}</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive"
                    @click="removeKr(String(kr.id))"
                  >
                    {{ t('common.delete') }}
                  </Button>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="rounded-xl border border-dashed p-8 text-center">
            <p class="font-medium">{{ t('goal.detail.noKrTitle') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ t('goal.detail.noKrDescription') }}</p>
            <Button class="mt-4" size="sm" @click="openCreateKr">{{
              t('goal.detail.addKR')
            }}</Button>
          </div>
        </section>

        <section class="space-y-3" data-testid="goal-workspace-tasks">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="openTasks()"
          >
            <h2 class="font-semibold">
              {{ t('goal.list.tasks') }}
              <span v-if="workspace.taskContext.summary" class="ml-1 text-muted-foreground">
                {{ workspace.taskContext.summary.total }}
              </span>
            </h2>
            <span class="text-sm text-muted-foreground">{{ t('goal.list.openTasks') }} →</span>
          </button>
          <div
            v-if="workspace.taskContext.availability === 'Unavailable'"
            class="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
          >
            {{ t('goal.list.contextUnavailable') }}
          </div>
          <div
            v-else-if="workspace.taskContext.preview.length"
            class="divide-y rounded-xl border bg-card"
          >
            <button
              v-for="task in workspace.taskContext.preview"
              :key="task.taskPlanId"
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="openTask(task.taskPlanId)"
            >
              <span class="min-w-0 truncate text-sm font-medium">{{ task.name }}</span>
              <Badge variant="outline" class="shrink-0">{{ task.status }}</Badge>
            </button>
          </div>
          <div v-else class="rounded-xl border border-dashed p-6 text-center">
            <p class="font-medium">{{ t('goal.list.noTasksTitle') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('goal.list.noTasksDescription') }}
            </p>
            <Button class="mt-4" size="sm" variant="outline" @click="openTasks()">
              {{ t('goal.list.openTasks') }}
            </Button>
          </div>
        </section>

        <section class="space-y-3" data-testid="goal-workspace-knowledge">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="openKnowledge()"
          >
            <h2 class="font-semibold">
              {{ t('goal.list.knowledge') }}
              <span v-if="workspace.knowledgeContext.summary" class="ml-1 text-muted-foreground">
                {{ workspace.knowledgeContext.summary.total }}
              </span>
            </h2>
            <span class="text-sm text-muted-foreground">{{ t('goal.list.openKnowledge') }} →</span>
          </button>
          <div
            v-if="workspace.knowledgeContext.availability === 'Unavailable'"
            class="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
          >
            {{ t('goal.list.contextUnavailable') }}
          </div>
          <div
            v-else-if="workspace.knowledgeContext.preview.length"
            class="divide-y rounded-xl border bg-card"
          >
            <button
              v-for="note in workspace.knowledgeContext.preview"
              :key="note.relationId"
              type="button"
              class="block w-full px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="openKnowledge(note.documentId)"
            >
              <p class="truncate text-sm font-medium">
                {{ note.state === 'Resolved' ? note.title : note.documentId }}
              </p>
              <p
                v-if="note.state === 'Resolved' && note.excerpt"
                class="mt-1 line-clamp-2 text-xs text-muted-foreground"
              >
                {{ note.excerpt }}
              </p>
            </button>
          </div>
          <div v-else class="rounded-xl border border-dashed p-6 text-center">
            <p class="font-medium">{{ t('goal.list.noKnowledgeTitle') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('goal.list.noKnowledgeDescription') }}
            </p>
            <Button class="mt-4" size="sm" variant="outline" @click="openKnowledge()">
              {{ t('goal.list.openKnowledge') }}
            </Button>
          </div>
        </section>

        <section
          v-if="workspace.recentProgress.length"
          class="space-y-3"
          data-testid="goal-workspace-progress"
        >
          <h2 class="font-semibold">{{ t('goal.list.recentProgress') }}</h2>
          <div class="divide-y rounded-xl border bg-card">
            <div v-for="record in workspace.recentProgress" :key="record.id" class="px-4 py-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">{{ keyResultName(record.keyResultId) }}</p>
                <span class="text-xs text-muted-foreground">{{
                  formatProductDate(record.createdAt)
                }}</span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ record.value >= 0 ? '+' : '' }}{{ record.value }} → {{ record.valueAfter }}
                <span v-if="record.comment"> · {{ record.comment }}</span>
              </p>
            </div>
          </div>
        </section>

        <section class="space-y-3" data-testid="goal-workspace-reviews">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ t('goal.list.reviews') }}</h2>
            <span class="text-xs text-muted-foreground">{{ workspace.recentReviews.length }}</span>
          </div>
          <div v-if="workspace.recentReviews.length" class="divide-y rounded-xl border bg-card">
            <button
              v-for="review in workspace.recentReviews"
              :key="review.id"
              type="button"
              class="block w-full px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="openReview(review.id)"
            >
              <div class="flex justify-between gap-3">
                <p class="line-clamp-2 text-sm">{{ review.reflection }}</p>
                <span class="shrink-0 text-xs text-muted-foreground">{{
                  formatProductDate(review.reviewedAt)
                }}</span>
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>

    <GoalDialog
      v-if="goal"
      v-model:open="editOpen"
      mode="edit"
      :goal="goal"
      @updated="handleGoalUpdated"
      @open-knowledge="openKnowledge()"
    />
    <KeyResultDialog ref="krDialog" :on-submit="saveKr" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Badge, Button, Progress, useConfirm } from '@memoflow/ui-vue-shadcn';
import {
  goalTimeframeLabel,
  isPastGoalTarget,
  type AddKeyResultReq,
  type GoalTimeframe,
  type KeyResultClientDTO,
} from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';
import { GoalDialog, KeyResultDialog } from '../components';
import {
  formatProductDate,
  formatProductYmd,
  getProductTodayYmd,
} from '../../../shared/utils/product-time';
import { useGoalWorkspace } from '../composables/useGoalWorkspace';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

type KeyResultInput = Omit<AddKeyResultReq, 'goalId' | 'expectedVersion'>;
type LifecycleAction = 'plan' | 'activate' | 'complete' | 'abandon';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
const goalId = computed(() => String(route.params.id ?? ''));
const { workspace, isLoading, error, refresh } = useGoalWorkspace(goalId);
const goal = computed(() => workspace.value?.goal ?? null);
const keyResults = computed(() => goal.value?.keyResults ?? []);
const editOpen = ref(false);
const krDialog = ref<InstanceType<typeof KeyResultDialog> | null>(null);
const isSaving = ref(false);
const mutationError = ref<string | null>(null);

const reminderCount = computed(
  () => goal.value?.reminderConfig?.triggers.filter((trigger) => trigger.enabled).length ?? 0,
);
const pastTarget = computed(
  () =>
    !!goal.value &&
    (goal.value.status === 'Planned' || goal.value.status === 'InProgress') &&
    isPastGoalTarget(goal.value.target, getProductTodayYmd()),
);

function formatTarget(target: GoalTimeframe): string {
  return goalTimeframeLabel(target, locale.value);
}
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    Planned: t('goal.list.statusPlanned'),
    InProgress: t('goal.list.statusInProgress'),
    Completed: t('goal.list.statusCompleted'),
    Abandoned: t('goal.list.statusAbandoned'),
  };
  return labels[status] ?? status;
}
function linkedTaskCount(keyResultId: string): number {
  if (workspace.value?.taskContext.availability !== 'Available') return 0;
  return (
    workspace.value.taskContext.summary.byKeyResult.find(
      (item) => item.keyResultId === String(keyResultId),
    )?.total ?? 0
  );
}
function keyResultName(keyResultId: string): string {
  return (
    keyResults.value.find((item) => String(item.id) === String(keyResultId))?.title ??
    t('goal.keyResultFallback')
  );
}

async function runLifecycle(action: LifecycleAction): Promise<void> {
  if (!goal.value || isSaving.value) return;
  isSaving.value = true;
  mutationError.value = null;
  try {
    const expectedVersion = goal.value.version;
    const result =
      action === 'plan'
        ? await service.planGoal(goalId.value, expectedVersion)
        : action === 'activate'
          ? await service.activateGoal(goalId.value, expectedVersion)
          : action === 'complete'
            ? await service.completeGoal(goalId.value, expectedVersion)
            : await service.abandonGoal(goalId.value, expectedVersion);
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      return;
    }
    await refresh();
  } finally {
    isSaving.value = false;
  }
}

async function confirmAbandon(): Promise<void> {
  if (!goal.value) return;
  const confirmed = await useConfirm({
    title: t('goal.detail.abandonGoal'),
    description: goal.value.name,
    confirmText: t('goal.detail.abandonGoal'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (confirmed) await runLifecycle('abandon');
}

function openCreateKr(): void {
  krDialog.value?.openForCreateKeyResult(goalId.value);
}
function openEditKr(kr: KeyResultClientDTO): void {
  krDialog.value?.openForUpdateKeyResult(goalId.value, kr);
}
function openKr(keyResultId: string): void {
  void router.push({ name: 'key-result-detail', params: { goalId: goalId.value, keyResultId } });
}

async function saveKr(payload: {
  goalId: string;
  keyResult: KeyResultInput;
  isEditing: boolean;
  keyResultId?: string;
}): Promise<boolean> {
  if (!goal.value) return false;
  mutationError.value = null;
  const request = { ...payload.keyResult, expectedVersion: goal.value.version };
  const result =
    payload.isEditing && payload.keyResultId
      ? await service.updateKeyResult(payload.goalId, payload.keyResultId, request)
      : await service.createKeyResult(payload.goalId, request);
  if (!result.ok) {
    mutationError.value = presentErrorMessage(result.error);
    return false;
  }
  await refresh();
  return true;
}

async function removeKr(keyResultId: string): Promise<void> {
  if (!goal.value) return;
  const confirmed = await useConfirm({
    title: t('common.delete'),
    description: t('goal.detail.noKrDescription'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  const result = await service.deleteKeyResult(goalId.value, keyResultId, {
    expectedVersion: goal.value.version,
  });
  if (!result.ok) {
    mutationError.value = presentErrorMessage(result.error);
    return;
  }
  await refresh();
}

async function handleGoalUpdated(): Promise<void> {
  editOpen.value = false;
  await refresh();
}
function openTasks(keyResultId?: string): void {
  void router.push({
    name: 'task-list',
    query: {
      goalId: goalId.value,
      ...(keyResultId ? { keyResultId } : {}),
    },
  });
}
function openTask(taskPlanId: string): void {
  void router.push({ name: 'task-detail', params: { id: taskPlanId } });
}
function openKnowledge(documentId?: string): void {
  void router.push({
    path: '/repository',
    query: {
      ...(documentId ? { note: documentId } : {}),
      goalId: goalId.value,
    },
  });
}
function openReview(reviewId: string): void {
  void router.push({
    name: 'goal-review-detail',
    params: { goalId: goalId.value, reviewId },
  });
}
</script>
