<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <ProductDialogShell :open="modelValue" test-id="task-occurrence-inspect" recipe="inspect">
      <template #title>{{ planName }}</template>
      <template #description>{{ t('task.inspect.description') }}</template>
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt class="text-muted-foreground">{{ t('task.inspect.status') }}</dt>
        <dd>
          <Badge variant="secondary">{{
            t(`task.occurrence.status.${occurrence.status.toLowerCase()}`)
          }}</Badge>
        </dd>
        <dt class="text-muted-foreground">{{ t('task.inspect.scheduled') }}</dt>
        <dd>{{ getTaskOccurrenceScheduleLabel(t, occurrence) }}</dd>
        <template v-if="occurrence.actualStartAt !== null">
          <dt class="text-muted-foreground">{{ t('task.inspect.actualStart') }}</dt>
          <dd>{{ formatProductDateTime(occurrence.actualStartAt) }}</dd>
        </template>
      </dl>
      <section v-if="occurrence.checklistState.length" class="mt-4 space-y-2">
        <h3 class="text-xs font-medium text-muted-foreground">{{ t('task.inspect.checklist') }}</h3>
        <label
          v-for="item in occurrence.checklistState"
          :key="item.definitionId"
          class="flex items-start gap-2 text-sm"
        >
          <Checkbox
            :model-value="item.completed"
            :disabled="busy"
            :aria-label="item.titleSnapshot"
            @update:model-value="
              emit(
                'checklist-change',
                String(occurrence.id),
                item.definitionId,
                Boolean($event),
                occurrence.version,
              )
            "
          />
          <span
            class="min-w-0 break-words"
            :class="{ 'line-through text-muted-foreground': item.completed }"
            >{{ item.titleSnapshot }}</span
          >
        </label>
      </section>
      <dl
        v-if="occurrence.result"
        class="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"
      >
        <dt class="text-muted-foreground">{{ t('task.inspect.recordedAt') }}</dt>
        <dd>{{ formatProductDateTime(occurrence.result.recordedAt) }}</dd>
        <template v-if="occurrence.result.kind === 'Completed'">
          <template v-if="occurrence.result.actualDurationMinutes !== null">
            <dt class="text-muted-foreground">{{ t('task.inspect.duration') }}</dt>
            <dd>
              {{ t('task.inspect.minutes', { count: occurrence.result.actualDurationMinutes }) }}
            </dd>
          </template>
          <template v-if="occurrence.result.rating !== null">
            <dt class="text-muted-foreground">{{ t('task.inspect.rating') }}</dt>
            <dd>{{ occurrence.result.rating }}</dd>
          </template>
          <template v-if="occurrence.result.note">
            <dt class="text-muted-foreground">{{ t('task.inspect.note') }}</dt>
            <dd class="whitespace-pre-wrap break-words">{{ occurrence.result.note }}</dd>
          </template>
        </template>
        <template v-else-if="occurrence.result.reason">
          <dt class="text-muted-foreground">{{ t('task.inspect.reason') }}</dt>
          <dd class="whitespace-pre-wrap break-words">{{ occurrence.result.reason }}</dd>
        </template>
      </dl>
      <section class="mt-4 border-t pt-3 text-sm" data-testid="task-inspect-goal-context">
        <h3 class="mb-1 text-xs font-medium text-muted-foreground">
          {{ t('task.inspect.goalContext') }}
        </h3>
        <p v-if="query.isPending.value">{{ t('task.inspect.contextLoading') }}</p>
        <p v-else-if="query.isError.value || !workspace">
          {{ t('task.detail.goalContextUnavailable') }}
        </p>
        <template v-else-if="workspace.goalContext?.availability === 'Available'">
          <p class="break-words">{{ workspace.goalContext.goal.name }}</p>
          <p v-if="workspace.goalContext.keyResult" class="mt-1 break-words text-muted-foreground">
            {{ workspace.goalContext.keyResult.title }}
          </p>
          <p v-else-if="workspace.goalContext.keyResultId" class="text-muted-foreground">
            {{ t('task.inspect.krMissing') }}
          </p>
        </template>
        <p v-else-if="workspace.goalContext">
          {{ t(`task.detail.goalContext${workspace.goalContext.availability}`) }}
        </p>
        <p v-else>{{ t('task.detail.goalBindingNone') }}</p>
      </section>
      <template #footer>
        <div class="flex w-full flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            data-testid="task-inspect-view-plan"
            @click="emit('view-plan', String(occurrence.planId))"
            >{{ t('task.inspect.viewPlan') }}</Button
          >
          <div class="flex-1" />
          <template v-if="occurrence.status === 'Pending' || occurrence.status === 'InProgress'">
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="emit('missed', String(occurrence.id))"
              >{{ t('task.occurrence.markMissed') }}</Button
            >
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="emit('skip', String(occurrence.id))"
              >{{ t('task.action.skip') }}</Button
            >
          </template>
          <Button
            v-if="occurrence.status === 'Completed'"
            size="sm"
            :disabled="busy"
            @click="emit('uncomplete', String(occurrence.id))"
            >{{ t('task.action.undoComplete') }}</Button
          >
          <Button
            v-else
            size="sm"
            :disabled="busy"
            @click="emit('complete', String(occurrence.id))"
            >{{ t('task.action.complete') }}</Button
          >
        </div>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Badge, Button, Checkbox, Dialog } from '@memoflow/ui-vue-shadcn';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import ProductDialogShell from '../../../../shared/components/ProductDialogShell.vue';
import { formatProductDateTime } from '../../../../shared/utils/product-time';
import { useTaskPlanWorkspaceQuery } from '../../composables/useTaskPlanWorkspaceQuery';
import { getTaskOccurrenceScheduleLabel } from '../../utils/task-occurrence-presentation';

const props = defineProps<{
  modelValue: boolean;
  occurrence: TaskOccurrenceClientDTO;
  planName: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  'view-plan': [planId: string];
  complete: [occurrenceId: string];
  uncomplete: [occurrenceId: string];
  missed: [occurrenceId: string];
  skip: [occurrenceId: string];
  'checklist-change': [
    occurrenceId: string,
    definitionId: string,
    completed: boolean,
    expectedVersion: number,
  ];
}>();
const { t } = useI18n();
const { workspace, query } = useTaskPlanWorkspaceQuery(
  () => (props.modelValue ? String(props.occurrence.planId) : null),
  { recentLimit: 1 },
);
</script>
