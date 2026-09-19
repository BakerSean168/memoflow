<template>
  <Dialog :open="visible" @update:open="(val) => (visible = val)">
    <ProductDialogShell
      :open="visible"
      test-id="goal-record-dialog"
      size="sm"
      initial-focus-selector="#change-amount"
    >
      <template #title>
        {{ isEditing ? t('goal.recordDialog.editTitle') : t('goal.recordDialog.addTitle') }}
      </template>
      <template #description>{{ t('goal.recordDialog.description') }}</template>

      <form id="goal-record-form" class="space-y-5" @submit.prevent="handleSave">
        <div class="space-y-2">
          <Label for="change-amount">{{ t('goal.recordDialog.incrementValue') }}</Label>
          <div class="relative flex items-center">
            <Plus class="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="change-amount"
              v-model.number="localRecord.changeAmount"
              type="number"
              class="h-11 pl-9 pr-16 text-lg font-semibold"
              min="0.1"
              step="0.1"
            />
            <Badge variant="secondary" class="absolute right-3 font-medium">
              {{ currentKeyResultUnit || t('goal.recordDialog.unit') }}
            </Badge>
          </div>
          <p v-if="validationError" class="text-xs text-destructive">{{ validationError }}</p>
          <p v-if="submitError" role="alert" class="text-xs text-destructive">
            {{ submitError }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2" :aria-label="t('goal.recordDialog.quickSelect')">
          <ProductPropertyChip
            v-for="quickValue in quickValues"
            :key="quickValue"
            :active="localRecord.changeAmount === quickValue"
            :data-testid="`quick-goal-record-${quickValue}`"
            :aria-label="`${t('goal.recordDialog.quickSelect')} ${quickValue}`"
            @click="localRecord.changeAmount = quickValue"
          >
            +{{ quickValue }}
          </ProductPropertyChip>
        </div>

        <div class="space-y-2">
          <Label for="record-note">{{ t('goal.recordDialog.remarks') }}</Label>
          <Textarea
            id="record-note"
            v-model="localRecord.note"
            :placeholder="t('goal.recordDialog.remarksPlaceholder')"
            :rows="3"
            class="resize-none"
          />
        </div>
      </form>

      <template #footer>
        <Button type="button" variant="ghost" :disabled="isSubmitting" @click="handleCancel">
          {{ t('goal.recordDialog.cancel') }}
        </Button>
        <Button
          type="button"
          data-testid="save-goal-record"
          :disabled="!isValid || isSubmitting"
          :loading="isSubmitting"
          @click="handleSave"
        >
          {{ t('goal.recordDialog.save') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GoalRecordClientDTO } from '@memoflow/contracts/goal';
import { Badge, Button, Dialog, Input, Label, Textarea } from '@memoflow/ui-vue-shadcn';
import { Plus } from '@lucide/vue';
import { ProductDialogShell, ProductPropertyChip } from '../../../../shared/components';
// composables
import { useGoal } from '../../composables/useGoal';

const { createGoalRecord, getKeyResultById } = useGoal();

const { t } = useI18n();

const visible = ref(false);
const propKeyResultId = ref<string>('');
const propGoalId = ref<string>('');
const propRecord = ref<GoalRecordClientDTO | null>(null);
const isSubmitting = ref(false);
const submitError = ref('');

const quickValues = [1, 2, 5, 10];

// 本地表单数据：只需要 changeAmount 和 note
const localRecord = ref({
  changeAmount: 0,
  note: '',
});

const isEditing = computed(() => !!propRecord.value);

const currentKeyResultUnit = computed(() => {
  const currentKeyResult = getKeyResultById(propKeyResultId.value);
  return currentKeyResult?.progress?.unit ?? '';
});

const valueRules = computed(() => [
  (v: number) => !!v || t('goal.recordDialog.valueRequired'),
  (v: number) => v > 0 || t('goal.recordDialog.valuePositive'),
  (v: number) => v <= 10000 || t('goal.recordDialog.valueMax'),
]);

const validationError = computed(() => {
  const v = localRecord.value.changeAmount;
  for (const rule of valueRules.value) {
    const result = rule(v);
    if (result !== true) return result;
  }
  return '';
});

const isValid = computed(() => !validationError.value && localRecord.value.changeAmount > 0);

const handleCreateKeyResult = async (): Promise<boolean> => {
  if (!propGoalId.value) {
    submitError.value = t('goal.recordDialog.goalNotFound');
    return false;
  }

  const currentKeyResult = getKeyResultById(propKeyResultId.value);
  if (!currentKeyResult) {
    submitError.value = t('goal.recordDialog.krNotFound');
    return false;
  }

  // ✅ 新的数据模型：value 就是本次记录的独立值
  // 不需要再加上 previousValue
  const createdRecord = await createGoalRecord(propGoalId.value, propKeyResultId.value, {
    value: localRecord.value.changeAmount, // ✅ 直接传递用户输入的值
    note: localRecord.value.note,
    recordedAt: Date.now(),
  });
  if (!createdRecord) {
    submitError.value = t('goal.error.createRecordFailed');
    return false;
  }
  return true;
};

const handleSave = async () => {
  if (!isValid.value || isSubmitting.value) return;

  if (isEditing.value) {
    submitError.value = t('goal.recordDialog.editNotAllowed');
    return;
  }

  submitError.value = '';
  isSubmitting.value = true;
  try {
    if (await handleCreateKeyResult()) {
      closeDialog();
    }
  } finally {
    isSubmitting.value = false;
  }
};

const handleCancel = () => {
  closeDialog();
};

const openDialog = (goalId: string, keyResultId: string, record?: GoalRecordClientDTO) => {
  propGoalId.value = goalId;
  propKeyResultId.value = keyResultId;
  propRecord.value = record || null;
  submitError.value = '';
  visible.value = true;
};

const closeDialog = () => {
  visible.value = false;
};

// 监听弹窗显示，重置表单
watch(
  () => visible.value,
  (show) => {
    if (show) {
      if (propRecord.value) {
        // 编辑模式：显示已有记录
        localRecord.value = {
          changeAmount: propRecord.value.value, // 使用 value 属性
          note: propRecord.value.comment || '',
        };
      } else {
        // 创建模式：重置表单
        localRecord.value = {
          changeAmount: 0,
          note: '',
        };
      }
    }
  },
);

defineExpose({
  openDialog,
});
</script>
