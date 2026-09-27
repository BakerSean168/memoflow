<template>
  <section
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="goal-detail-view"
  >
    <ModuleHeader data-testid="goal-detail-toolbar">
      <template #leading>
        <Button variant="ghost" size="sm" @click="router.push({ name: 'goal-list' })">
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
      </template>
      <template #actions>
        <Button
          v-if="goal"
          variant="ghost"
          size="sm"
          @click="router.push({ name: 'goal-review-create', params: { goalId: goal.id } })"
        >
          {{ t('goal.detail.review') }}
        </Button>
      </template>
    </ModuleHeader>

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

    <div
      v-else-if="goal && workspace"
      class="min-h-0 flex-1 overflow-auto px-3 py-3 @md/panel:px-5 @md/panel:py-4"
    >
      <div class="mx-auto max-w-5xl space-y-6">
        <article
          class="space-y-4 border-b border-border/70 pb-5"
          data-testid="goal-workspace-header"
        >
          <div class="space-y-1" data-testid="goal-detail-identity">
            <ProductAutoTextarea
              v-model="nameDraft"
              :max-length="80"
              :rows="1"
              data-testid="goal-detail-title"
              class="-mx-1 min-h-9 rounded-md px-1 text-2xl font-semibold leading-tight tracking-tight transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
              :placeholder="t('goal.dialog.goalTitlePlaceholder')"
              :disabled="isSaving"
              @blur="saveName"
              @keydown.enter.exact.prevent="commitNameFromKeyboard"
              @keydown.esc.prevent="resetInlineDrafts"
            />
            <ProductAutoTextarea
              v-model="summaryDraft"
              :max-length="255"
              :rows="1"
              data-testid="goal-detail-summary"
              class="-mx-1 min-h-7 rounded-md px-1 text-sm leading-5 text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
              :placeholder="t('goal.dialog.summaryPlaceholder')"
              :disabled="isSaving"
              @blur="saveSummary"
              @keydown.enter.exact.prevent="commitSummaryFromKeyboard"
              @keydown.esc.prevent="resetInlineDrafts"
            />
          </div>

          <ProductAutoTextarea
            v-model="descriptionDraft"
            :max-length="10000"
            :rows="1"
            data-testid="goal-detail-description"
            class="-mx-1 min-h-7 rounded-md px-1 text-sm leading-6 text-foreground/85 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
            :placeholder="t('goal.dialog.descriptionLongPlaceholder')"
            :disabled="isSaving"
            @blur="saveDescription"
            @keydown.ctrl.enter.prevent="commitDescriptionFromKeyboard"
            @keydown.meta.enter.prevent="commitDescriptionFromKeyboard"
            @keydown.esc.prevent="resetInlineDrafts"
          />

          <div class="flex flex-wrap items-center gap-2" data-testid="goal-detail-property-chips">
            <div data-testid="goal-status" :data-goal-status="goal.status">
              <GoalStatusPicker
                :model-value="goal.status"
                :base-status="goal.status"
                :disabled="isSaving || !!goal.archivedAt"
                @update:model-value="changeStatus"
              />
            </div>

            <ProductDatePicker
              :model-value="startDateDraft"
              :label="t('goal.detail.startDate')"
              :placeholder="t('goal.detail.startDate')"
              :input-placeholder="t('common.productDateInputPlaceholder')"
              :format-hint="t('common.productDateInputHint')"
              :invalid-text="t('common.productDateInputInvalid')"
              :clear-label="t('common.clear')"
              test-id="goal-detail-start-date"
              :aria-label="t('goal.detail.startDate')"
              :disabled="isSaving || !!goal.archivedAt"
              @update:model-value="saveStartDate"
            />

            <GoalTimeframePicker
              :model-value="targetDraft"
              test-id="goal-detail-target"
              :aria-label="t('goal.detail.target')"
              :placeholder="t('goal.detail.target')"
              :disabled="isSaving || !!goal.archivedAt"
              @update:model-value="saveTarget"
            />

            <LabelPicker
              :model-value="labelIdsDraft"
              :options="labelOptions"
              :disabled="labelsLoading || isSaving || !!goal.archivedAt"
              :placeholder="t('goal.dialog.labels')"
              :search-placeholder="t('goal.list.searchLabels')"
              :empty-text="t('goal.list.noLabels')"
              :create-label="t('goal.dialog.createLabel')"
              :aria-label="t('goal.dialog.labels')"
              compact
              @update:model-value="saveLabelIds"
              @create="createAndSelectLabel"
            />

            <GoalReminderChip
              :model-value="reminderConfigDraft"
              :start-date="startDateDraft"
              :target="targetDraft"
              :disabled="isSaving || !!goal.archivedAt"
              @update:model-value="saveReminderConfig"
            />

            <Badge v-if="pastTarget" variant="secondary" data-testid="goal-past-target">
              {{ t('goal.list.pastTarget') }}
            </Badge>
          </div>

          <div class="space-y-1.5" data-testid="goal-overall-progress">
            <div class="flex justify-between text-sm">
              <span>{{ t('goal.list.overallProgress') }}</span>
              <span>{{ keyResults.length ? `${Math.round(goal.overallProgress)}%` : '—' }}</span>
            </div>
            <Progress v-if="keyResults.length" :model-value="goal.overallProgress" />
            <p v-else class="text-xs text-muted-foreground">
              {{ t('goal.detail.progressNeedsKr') }}
            </p>
          </div>

          <p v-if="mutationError || labelCreateError" role="alert" class="text-sm text-destructive">
            {{ mutationError || labelCreateError }}
          </p>
        </article>

        <section class="space-y-3" data-testid="goal-workspace-key-results">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-baseline gap-2">
              <h2 class="font-semibold">{{ t('goal.detail.keyResults') }}</h2>
              <span class="text-xs text-muted-foreground">{{ keyResults.length }}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5 text-muted-foreground"
              data-testid="goal-add-key-result"
              @click="openCreateKr"
            >
              <Plus class="h-4 w-4" />
              {{ t('goal.detail.addKR') }}
            </Button>
          </div>

          <div v-if="keyResults.length" class="divide-y border-y border-border/70">
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
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground"
                      :aria-label="t('common.more')"
                    >
                      <MoreHorizontal class="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-36">
                    <DropdownMenuItem @click="openEditKr(kr)">
                      <Pencil class="mr-2 h-4 w-4" />
                      {{ t('common.edit') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @click="removeKr(String(kr.id))"
                    >
                      <Trash2 class="mr-2 h-4 w-4" />
                      {{ t('common.delete') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
            class="divide-y border-y border-border/70"
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
          <div
            v-else
            class="flex items-center justify-between gap-4 border-y border-border/70 px-1 py-3"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ t('goal.list.noTasksTitle') }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ t('goal.list.noTasksDescription') }}
              </p>
            </div>
            <Button class="shrink-0" size="sm" variant="ghost" @click="openTasks()">
              {{ t('goal.list.openTasks') }} →
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
            class="divide-y border-y border-border/70"
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
          <div
            v-else
            class="flex items-center justify-between gap-4 border-y border-border/70 px-1 py-3"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ t('goal.list.noKnowledgeTitle') }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{ t('goal.list.noKnowledgeDescription') }}
              </p>
            </div>
            <Button class="shrink-0" size="sm" variant="ghost" @click="openKnowledge()">
              {{ t('goal.list.openKnowledge') }} →
            </Button>
          </div>
        </section>

        <section
          v-if="workspace.recentProgress.length"
          class="space-y-3"
          data-testid="goal-workspace-progress"
        >
          <h2 class="font-semibold">{{ t('goal.list.recentProgress') }}</h2>
          <div class="divide-y border-y border-border/70">
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
          <div v-if="workspace.recentReviews.length" class="divide-y border-y border-border/70">
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

    <KeyResultDialog ref="krDialog" :on-submit="saveKr" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from '@lucide/vue';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Progress,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import {
  GoalStatus,
  goalTimeframeLabel,
  isPastGoalTarget,
  type AddKeyResultReq,
  type GoalReminderConfigDTO,
  type GoalStatus as GoalStatusValue,
  type GoalTimeframe,
  type KeyResultClientDTO,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';
import type { Ymd } from '@memoflow/contracts/primitives';
import { presentErrorMessage } from '@memoflow/http-client';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { LabelPicker, ProductAutoTextarea, ProductDatePicker } from '../../../shared/components';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import KeyResultDialog from '../components/dialogs/KeyResultDialog.vue';
import GoalReminderChip from '../components/GoalReminderChip.vue';
import GoalStatusPicker from '../components/GoalStatusPicker.vue';
import GoalTimeframePicker from '../components/GoalTimeframePicker.vue';
import { formatProductDate, getProductTodayYmd } from '../../../shared/utils/product-time';
import { useGoalWorkspace } from '../composables/useGoalWorkspace';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

type KeyResultInput = Omit<AddKeyResultReq, 'goalId' | 'expectedVersion'>;
type LifecycleAction = 'plan' | 'activate' | 'complete' | 'abandon';
type GoalPatch = Omit<UpdateGoalReq, 'expectedVersion'>;

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
const goalId = computed(() => String(route.params.id ?? ''));
const { workspace, isLoading, error, refresh } = useGoalWorkspace(goalId);
const goal = computed(() => workspace.value?.goal ?? null);
const keyResults = computed(() => goal.value?.keyResults ?? []);
const krDialog = ref<InstanceType<typeof KeyResultDialog> | null>(null);
const isSaving = ref(false);
const mutationError = ref<string | null>(null);
const labelCreateError = ref<string | null>(null);

const nameDraft = ref('');
const summaryDraft = ref('');
const descriptionDraft = ref('');
const startDateDraft = ref<Ymd | null>(null);
const targetDraft = ref<GoalTimeframe | null>(null);
const labelIdsDraft = ref<string[]>([]);
const reminderConfigDraft = ref<GoalReminderConfigDTO | null>(null);

const { options: labelOptions, isLoading: labelsLoading, createLabel } = useLabelCatalog();

const pastTarget = computed(
  () =>
    !!goal.value &&
    (goal.value.status === GoalStatus.Planned || goal.value.status === GoalStatus.InProgress) &&
    isPastGoalTarget(goal.value.target, getProductTodayYmd()),
);

function cloneReminderConfig(
  value: GoalReminderConfigDTO | null | undefined,
): GoalReminderConfigDTO | null {
  if (!value) return null;
  return {
    enabled: value.enabled,
    triggers: value.triggers.map((trigger) => ({ ...trigger })),
  };
}

function resetInlineDrafts(): void {
  const current = goal.value;
  if (!current) return;
  nameDraft.value = current.name;
  summaryDraft.value = current.summary ?? '';
  descriptionDraft.value = current.description ?? '';
  startDateDraft.value = current.startDate ?? null;
  targetDraft.value = current.target ? { ...current.target } : null;
  labelIdsDraft.value = current.labels.map((label) => label.id);
  reminderConfigDraft.value = cloneReminderConfig(current.reminderConfig);
}

watch(
  () => goal.value?.version,
  () => resetInlineDrafts(),
  { immediate: true },
);

function formatTarget(target: GoalTimeframe): string {
  return goalTimeframeLabel(target, locale.value);
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

async function updateGoalFields(patch: GoalPatch): Promise<boolean> {
  if (!goal.value || isSaving.value) return false;
  isSaving.value = true;
  mutationError.value = null;
  try {
    const result = await service.updateGoal(goalId.value, {
      expectedVersion: goal.value.version,
      ...patch,
    });
    if (!result.ok) {
      mutationError.value = presentErrorMessage(result.error);
      resetInlineDrafts();
      return false;
    }
    await refresh();
    return true;
  } finally {
    isSaving.value = false;
  }
}

async function saveName(): Promise<void> {
  if (!goal.value) return;
  const next = nameDraft.value.trim();
  if (!next) {
    nameDraft.value = goal.value.name;
    return;
  }
  if (next === goal.value.name) return;
  nameDraft.value = next;
  await updateGoalFields({ name: next });
}

async function saveSummary(): Promise<void> {
  if (!goal.value) return;
  const next = summaryDraft.value.trim();
  const current = goal.value.summary ?? '';
  if (next === current) return;
  summaryDraft.value = next;
  await updateGoalFields({ summary: next || null });
}

async function saveDescription(): Promise<void> {
  if (!goal.value) return;
  const next = descriptionDraft.value.trim();
  const current = goal.value.description ?? '';
  if (next === current) return;
  descriptionDraft.value = next;
  await updateGoalFields({ description: next || null });
}

function blurKeyboardTarget(event: KeyboardEvent): void {
  (event.currentTarget as HTMLTextAreaElement | null)?.blur();
}

function commitNameFromKeyboard(event: KeyboardEvent): void {
  blurKeyboardTarget(event);
}

function commitSummaryFromKeyboard(event: KeyboardEvent): void {
  blurKeyboardTarget(event);
}

function commitDescriptionFromKeyboard(event: KeyboardEvent): void {
  blurKeyboardTarget(event);
}

async function saveStartDate(value: Ymd | null): Promise<void> {
  if (!goal.value) return;
  const current = goal.value.startDate ?? null;
  startDateDraft.value = value;
  if (value === current) return;
  await updateGoalFields({ startDate: value });
}

async function saveTarget(value: GoalTimeframe | null): Promise<void> {
  if (!goal.value) return;
  const current = goal.value.target ?? null;
  targetDraft.value = value ? { ...value } : null;
  if (JSON.stringify(value) === JSON.stringify(current)) return;
  await updateGoalFields({ target: value });
}

async function saveLabelIds(value: string[]): Promise<void> {
  if (!goal.value) return;
  labelIdsDraft.value = [...value];
  const current = goal.value.labels.map((label) => label.id);
  if (JSON.stringify(value) === JSON.stringify(current)) return;
  await updateGoalFields({ labelIds: value });
}

async function createAndSelectLabel(name: string): Promise<void> {
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    if (labelIdsDraft.value.includes(label.id)) return;
    await saveLabelIds([...labelIdsDraft.value, label.id]);
  } catch {
    labelCreateError.value = t('common.operationFailed');
  }
}

async function saveReminderConfig(value: GoalReminderConfigDTO | null): Promise<void> {
  if (!goal.value) return;
  reminderConfigDraft.value = cloneReminderConfig(value);
  if (JSON.stringify(value) === JSON.stringify(goal.value.reminderConfig ?? null)) return;
  await updateGoalFields({ reminderConfig: value });
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

async function changeStatus(next: GoalStatusValue): Promise<void> {
  if (!goal.value || next === goal.value.status) return;
  if (next === GoalStatus.Abandoned) {
    await confirmAbandon();
    return;
  }
  if (next === GoalStatus.Planned) {
    await runLifecycle('plan');
    return;
  }
  if (next === GoalStatus.InProgress) {
    await runLifecycle('activate');
    return;
  }
  if (next === GoalStatus.Completed) {
    await runLifecycle('complete');
  }
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
