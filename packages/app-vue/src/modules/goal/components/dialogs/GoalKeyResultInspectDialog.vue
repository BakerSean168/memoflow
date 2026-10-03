<template>
  <Dialog
    :open="true"
    @update:open="
      (open) => {
        if (!open) emit('close');
      }
    "
  >
    <ProductDialogShell
      :open="true"
      test-id="goal-kr-inspect"
      recipe="inspect"
      size="lg"
      height-mode="workspace"
      initial-focus-selector="[data-testid=goal-kr-inspect-close]"
      body-class="space-y-5"
    >
      <template #title>{{ keyResult?.title ?? t('goal.inspect.krUnavailable') }}</template>
      <template #description>{{ goal.name }} · {{ t('goal.inspect.description') }}</template>
      <template v-if="keyResult">
        <GoalKeyResultTrajectoryPlot
          readonly
          size="inspect"
          :initial-value="keyResult.progress.initialValue"
          :current-value="keyResult.progress.currentValue"
          :target-value="keyResult.progress.targetValue"
          :unit="keyResult.progress.unit ?? ''"
          :start-label="timeframe(goal.start)"
          :current-label="formatProductYmd(getProductTodayYmd())"
          :target-label="timeframe(keyResult.target ?? goal.target)"
          :disabled="!!goal.archivedAt"
          :check-in-label="t('goal.recordDialog.addTitle')"
          check-in-test-id="goal-inspect-check-in"
          @check-in="emit('check-in')"
        />
        <dl class="grid gap-4 sm:grid-cols-2" data-testid="goal-inspect-metadata">
          <div class="sm:col-span-2">
            <dt class="text-xs text-muted-foreground">
              {{ t('goal.dialog.krCalculationMethod') }}
            </dt>
            <dd class="font-medium">
              {{ getKeyResultCalculationLabel(keyResult.progress.aggregationMethod, t) }}
            </dd>
            <dd class="text-sm text-muted-foreground" data-testid="goal-inspect-method-explanation">
              {{ getKeyResultCalculationExplanation(keyResult.progress.aggregationMethod, t) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground">{{ t('goal.dialog.krWeight') }}</dt>
            <dd>{{ keyResult.weight }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground">{{ t('goal.inspect.timeframe') }}</dt>
            <dd>{{ timeframe(keyResult.target ?? goal.target) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground">{{ t('goal.inspect.completion') }}</dt>
            <dd>
              {{ t(keyResult.isCompleted ? 'goal.inspect.completed' : 'goal.inspect.incomplete') }}
              · {{ Math.round(keyResult.progressPercentage) }}%
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-xs text-muted-foreground">{{ t('goal.dialog.description') }}</dt>
            <dd class="whitespace-pre-wrap break-words">
              {{ keyResult.description || t('goal.inspect.noDescription') }}
            </dd>
          </div>
        </dl>
        <section class="space-y-3" data-testid="goal-inspect-records">
          <h2 class="font-semibold">{{ t('goal.inspect.history') }}</h2>
          <p class="text-xs text-muted-foreground">
            {{ t('goal.inspect.loaded', { count: records.length, total: recordTotal }) }}
          </p>
          <p v-if="recordError" role="alert">{{ t('common.operationFailed') }}</p>
          <p v-else-if="!recordLoading && !records.length">{{ t('goal.inspect.noRecords') }}</p>
          <div v-for="record in records" :key="record.id" :data-record-id="record.id">
            <GoalRecordCard :record="record" />
            <p class="mt-1 break-words text-xs text-muted-foreground">
              {{ sourceContext(record) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ t('goal.inspect.valueAfter') }}: {{ record.valueAfter }}
              {{ keyResult.progress.unit ?? '' }}
            </p>
          </div>
          <Button
            v-if="recordError || records.length < recordTotal"
            variant="outline"
            :disabled="recordLoading"
            data-testid="goal-inspect-records-more"
            @click="loadRecords(generation)"
            >{{ t(recordError ? 'goal.inspect.retry' : 'goal.inspect.loadMore') }}</Button
          >
          <p v-if="recordLoading" role="status">{{ t('common.loading') }}</p>
        </section>
        <section class="space-y-3" data-testid="goal-inspect-tasks">
          <h2 class="font-semibold">{{ t('goal.list.tasks') }}</h2>
          <p v-if="taskAvailability === 'Unavailable'">{{ t('goal.inspect.tasksUnavailable') }}</p>
          <template v-else>
            <p class="text-xs text-muted-foreground">
              {{ t('goal.inspect.loaded', { count: tasks.length, total: taskTotal }) }}
            </p>
            <p v-if="taskError" role="alert">{{ t('common.operationFailed') }}</p>
            <p v-else-if="!taskLoading && !tasks.length">{{ t('goal.inspect.noTasks') }}</p>
            <Button
              v-for="task in tasks"
              :key="task.taskPlanId"
              variant="ghost"
              class="h-auto w-full justify-start whitespace-normal break-words text-left"
              @click="emit('open-task', task.taskPlanId)"
              >{{ task.name }} →</Button
            >
            <Button
              v-if="taskError || tasks.length < taskTotal"
              variant="outline"
              :disabled="taskLoading"
              data-testid="goal-inspect-tasks-more"
              @click="loadTasks(generation)"
              >{{ t(taskError ? 'goal.inspect.retry' : 'goal.inspect.loadMore') }}</Button
            >
            <Button
              v-if="taskTotal > 0"
              variant="ghost"
              data-testid="goal-inspect-task-scope"
              @click="emit('open-task-scope')"
              >{{ t('goal.inspect.viewTasks') }} →</Button
            >
            <p v-if="taskLoading" role="status">{{ t('common.loading') }}</p>
          </template>
        </section>
      </template>
      <p v-else role="alert" data-testid="goal-kr-not-found">
        {{ t('goal.inspect.krUnavailable') }}
      </p>
      <template #footer
        ><Button variant="ghost" data-testid="goal-kr-inspect-close" @click="emit('close')">{{
          t('common.close')
        }}</Button></template
      >
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import {
  goalTimeframeLabel,
  type GoalClientDTO,
  type GoalRecordClientDTO,
  type GoalTimeframe,
  type GoalWorkspaceTaskPage,
  type KeyResultClientDTO,
} from '@memoflow/contracts/goal';
import { ProductDialogShell } from '../../../../shared/components';
import { GOAL_SERVICE_KEY } from '../../../../di/keys';
import { useStrictInject } from '../../../../shared/utils/useStrictInject';
import { formatProductYmd, getProductTodayYmd } from '../../../../shared/utils/product-time';
import GoalKeyResultTrajectoryPlot from '../GoalKeyResultTrajectoryPlot.vue';
import GoalRecordCard from '../cards/GoalRecordCard.vue';
import { getKeyResultCalculationLabel, getKeyResultCalculationExplanation } from '../../utils';

const props = defineProps<{
  goal: GoalClientDTO;
  keyResult: KeyResultClientDTO | null;
  taskAvailability: 'Available' | 'Unavailable';
  recordRevision: number;
}>();
const emit = defineEmits<{
  close: [];
  'check-in': [];
  'open-task': [id: string];
  'open-task-scope': [];
}>();
const { t, locale } = useI18n();
const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
const records = ref<GoalRecordClientDTO[]>([]);
const recordTotal = ref(0);
const recordLoading = ref(false);
const recordError = ref(false);
const tasks = ref<GoalWorkspaceTaskPage['items']>([]);
const taskTotal = ref(0);
const taskLoading = ref(false);
const taskError = ref(false);
const pageSize = 20;
let generation = 0;
function timeframe(value: GoalTimeframe | null): string {
  return value ? goalTimeframeLabel(value, locale.value) : t('goal.dialog.krTrajectoryNotSet');
}
function sourceContext(record: GoalRecordClientDTO): string {
  // The projection provides occurrence identity, not a Task title. Never infer a Task name from an ID.
  return t(
    !record.source
      ? record.authorship === 'Manual'
        ? 'goal.inspect.manualSource'
        : 'goal.inspect.sourceUnavailable'
      : record.source.type === 'TASK_TEMPLATE'
        ? 'goal.inspect.taskPlanSource'
        : 'goal.inspect.taskOccurrenceSource',
  );
}
async function loadRecords(session: number): Promise<void> {
  if (!props.keyResult || recordLoading.value) return;
  recordLoading.value = true;
  recordError.value = false;
  try {
    const result = await service.getGoalRecordsByKeyResult(
      String(props.goal.id),
      String(props.keyResult.id),
      { limit: pageSize, offset: records.value.length },
    );
    if (session !== generation) return;
    if (!result.ok) {
      recordError.value = true;
      return;
    }
    // Preserve canonical recordedAt/id descending order across pages; no chart arithmetic here.
    const page = result.data.records.map((record) => record.toDTO());
    if (!page.length && records.value.length < result.data.total) {
      recordError.value = true;
      return;
    }
    records.value.push(...page);
    recordTotal.value = result.data.total;
  } catch {
    if (session === generation) recordError.value = true;
  } finally {
    if (session === generation) recordLoading.value = false;
  }
}
async function loadTasks(session: number): Promise<void> {
  if (!props.keyResult || taskLoading.value || props.taskAvailability !== 'Available') return;
  taskLoading.value = true;
  taskError.value = false;
  try {
    const result = await service.getGoalWorkspaceTasks(String(props.goal.id), {
      keyResultId: String(props.keyResult.id),
      limit: pageSize,
      offset: tasks.value.length,
    });
    if (session !== generation) return;
    if (!result.ok) {
      taskError.value = true;
      return;
    }
    if (!result.data.items.length && tasks.value.length < result.data.total) {
      taskError.value = true;
      return;
    }
    tasks.value.push(...result.data.items);
    taskTotal.value = result.data.total;
  } catch {
    if (session === generation) taskError.value = true;
  } finally {
    if (session === generation) taskLoading.value = false;
  }
}
watch(
  () => [props.goal.id, props.keyResult?.id, props.recordRevision, props.taskAvailability],
  () => {
    const session = ++generation;
    records.value = [];
    tasks.value = [];
    recordTotal.value = taskTotal.value = 0;
    recordLoading.value = taskLoading.value = recordError.value = taskError.value = false;
    void loadRecords(session);
    void loadTasks(session);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation += 1;
});
</script>
