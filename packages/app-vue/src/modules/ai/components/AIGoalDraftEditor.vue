<template>
  <div class="rounded-2xl border border-border/60 bg-muted/20 p-4">
    <div v-if="hasDraft" class="space-y-5">
      <div class="grid gap-2">
        <Input
          :model-value="goal.name"
          :placeholder="t('goal.dialog.goalTitlePlaceholder')"
          @update:model-value="updateGoalField('name', String($event ?? ''))"
        />
        <Textarea
          :model-value="goal.summary"
          :placeholder="t('goal.dialog.summaryPlaceholder')"
          class="min-h-20"
          @update:model-value="updateGoalField('summary', String($event ?? ''))"
        />
      </div>

      <div class="grid gap-3 @sm/ai:grid-cols-2">
        <label class="grid gap-2 text-xs text-muted-foreground">
          {{ t('goal.dialog.startDate') }}
          <Input
            type="date"
            :model-value="toProductYmdInputValue(goal.startDate)"
            @update:model-value="
              updateGoalField('startDate', fromProductYmdInputValue(String($event ?? '')))
            "
          />
        </label>
        <div class="grid gap-2 text-xs text-muted-foreground">
          {{ t('goal.detail.status') }}
          <Select
            :model-value="goal.status"
            @update:model-value="updateGoalField('status', $event as EditableGoal['status'])"
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Planned">{{
                t('aiAssistant.goalDraft.statusPlanned')
              }}</SelectItem>
              <SelectItem value="InProgress">{{
                t('aiAssistant.goalDraft.statusInProgress')
              }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div class="grid gap-2">
        <p class="text-xs text-muted-foreground">{{ t('goal.dialog.targetDate') }}</p>
        <Input
          v-if="goal.target == null || goal.target.kind === 'day'"
          type="date"
          :model-value="goal.target?.kind === 'day' ? toProductYmdInputValue(goal.target.date) : ''"
          @update:model-value="updateExactTarget(String($event ?? ''))"
        />
        <div v-else class="rounded-xl border bg-background/70 px-3 py-2 text-sm text-foreground">
          {{ goalTimeframeLabel(goal.target, locale) }}
        </div>
      </div>

      <div
        v-for="(item, index) in keyResults"
        :key="item.draftRef"
        class="space-y-3 rounded-xl border bg-background/70 p-3"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-[10px] font-mono text-muted-foreground">{{ item.draftRef }}</span>
          <Button variant="outline" size="sm" @click="emit('remove-key-result', index)">
            {{ t('aiAssistant.goalDraft.removeKeyResult') }}
          </Button>
        </div>
        <div class="grid gap-2 @sm/ai:grid-cols-2">
          <Input
            :model-value="item.title"
            :placeholder="t('goal.krDialog.namePlaceholder')"
            @update:model-value="updateKeyResult(index, { title: String($event ?? '') })"
          />
          <Input
            :model-value="item.unit"
            :placeholder="t('aiAssistant.goalDraft.unit')"
            @update:model-value="updateKeyResult(index, { unit: String($event ?? '') })"
          />
        </div>
        <Textarea
          :model-value="item.description"
          :placeholder="t('goal.krDialog.descPlaceholder')"
          class="min-h-16"
          @update:model-value="updateKeyResult(index, { description: String($event ?? '') })"
        />
        <div class="grid gap-2 @sm/ai:grid-cols-3">
          <Select
            :model-value="item.aggregationMethod"
            @update:model-value="
              updateKeyResult(index, {
                aggregationMethod: $event as EditableKeyResult['aggregationMethod'],
              })
            "
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in methods" :key="option" :value="option">
                {{ option }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            :model-value="String(item.initialValue)"
            @update:model-value="
              updateKeyResult(index, { initialValue: num($event, item.initialValue) })
            "
          />
          <Input
            type="number"
            :model-value="String(item.currentValue)"
            @update:model-value="
              updateKeyResult(index, { currentValue: num($event, item.currentValue) })
            "
          />
          <Input
            type="number"
            :model-value="String(item.targetValue)"
            @update:model-value="
              updateKeyResult(index, { targetValue: num($event, item.targetValue) })
            "
          />
          <Input
            type="number"
            min="1"
            max="5"
            :model-value="String(item.weight)"
            @update:model-value="
              updateKeyResult(index, {
                weight: Math.max(1, Math.min(5, Math.round(num($event, item.weight)))),
              })
            "
          />
        </div>
      </div>

      <Button variant="outline" class="w-full" @click="emit('add-key-result')">
        {{ t('aiAssistant.goalDraft.addKeyResult') }}
      </Button>
      <Button
        v-if="showConfirmAction"
        class="w-full"
        :disabled="isSubmitting || !goal.name.trim()"
        @click="emit('confirm')"
      >
        {{
          isSubmitting
            ? t('aiAssistant.goalDraft.creatingGoal')
            : t('aiAssistant.goalDraft.createGoal')
        }}
      </Button>
    </div>
    <div
      v-else
      class="flex min-h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground"
    >
      {{ t('aiAssistant.goalDraft.emptyState') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { goalTimeframeLabel, KeyResultCalculationMethod } from '@memoflow/contracts/goal';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import {
  fromProductYmdInputValue,
  toProductYmdInputValue,
} from '../../../shared/utils/product-time';
import type { EditableGoal, EditableKeyResult } from '../composables';

const props = defineProps<{
  goal: EditableGoal;
  keyResults: EditableKeyResult[];
  isSubmitting: boolean;
  showConfirmAction?: boolean;
}>();
const emit = defineEmits<{
  confirm: [];
  'add-key-result': [];
  'remove-key-result': [number];
  'update-goal': [EditableGoal];
  'update-key-result': [{ index: number; value: EditableKeyResult }];
}>();
const { t, locale } = useI18n();
const hasDraft = computed(() =>
  Boolean(props.goal.name || props.goal.summary || props.keyResults.length),
);
const showConfirmAction = computed(() => props.showConfirmAction !== false);
const methods = Object.values(KeyResultCalculationMethod);

function updateGoalField<K extends keyof EditableGoal>(key: K, value: EditableGoal[K]) {
  emit('update-goal', { ...props.goal, [key]: value });
}

function updateExactTarget(raw: string) {
  const date = fromProductYmdInputValue(raw);
  updateGoalField('target', date ? { kind: 'day', date } : null);
}

function updateKeyResult(index: number, patch: Partial<EditableKeyResult>) {
  emit('update-key-result', {
    index,
    value: { ...props.keyResults[index], ...patch } as EditableKeyResult,
  });
}

function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
</script>
