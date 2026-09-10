<template>
  <div>
    <Button
      :disabled="!hasQuota || isGenerating"
      @click="openDialog"
      data-testid="ai-generate-kr-button"
    >
      <Sparkles class="mr-2 h-4 w-4" />
      <span>{{ t('goal.aiGenerateKR.title') }}</span>
      <Badge v-if="quota" :variant="hasQuota ? 'default' : 'destructive'" class="ml-2">
        {{ quota.remainingQuota }}/{{ quota.quotaLimit }}
      </Badge>
    </Button>

    <Dialog v-model:open="showDialog">
      <DialogContent class="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Sparkles class="h-5 w-5" />
            {{ t('goal.aiGenerateKR.subtitle') }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <Alert v-if="quota" :variant="hasQuota ? 'default' : 'destructive'">
            <Info class="h-4 w-4" />
            <AlertTitle>{{ t('goal.aiGenerateKR.todayQuota') }}</AlertTitle>
            <AlertDescription>
              {{ quota.remainingQuota }} / {{ quota.quotaLimit }}
              {{ t('goal.aiGenerateKR.quotaUnit') }}
              <span v-if="timeToReset" class="ml-2 text-xs"
                >({{ timeToReset }}{{ t('goal.aiGenerateKR.quotaReset') }})</span
              >
            </AlertDescription>
          </Alert>

          <div class="space-y-4">
            <div class="space-y-2">
              <Label for="goalTitle">{{ t('goal.aiGenerateKR.goalTitle') }}</Label>
              <Input
                id="goalTitle"
                v-model="formData.goalTitle"
                :placeholder="t('goal.aiGenerateKR.goalTitlePlaceholder')"
                :disabled="isGenerating"
                data-testid="goal-title-input"
              />
            </div>

            <div class="space-y-2">
              <Label for="goalDescription">{{ t('goal.aiGenerateKR.goalDesc') }}</Label>
              <Textarea
                id="goalDescription"
                v-model="formData.goalDescription"
                :placeholder="t('goal.aiGenerateKR.goalDescPlaceholder')"
                rows="3"
                :disabled="isGenerating"
                data-testid="goal-description-input"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="startDate">{{ t('goal.aiGenerateKR.startDate') }}</Label>
                <Input
                  id="startDate"
                  v-model="formData.startDate"
                  type="date"
                  :disabled="isGenerating"
                  data-testid="start-date-input"
                />
              </div>

              <div class="space-y-2">
                <Label for="endDate">{{ t('goal.aiGenerateKR.endDate') }}</Label>
                <Input
                  id="endDate"
                  v-model="formData.endDate"
                  type="date"
                  :disabled="isGenerating"
                  data-testid="end-date-input"
                />
              </div>
            </div>

            <div class="space-y-2">
              <Label for="goalContext">{{ t('goal.aiGenerateKR.extraContext') }}</Label>
              <Textarea
                id="goalContext"
                v-model="formData.goalContext"
                :placeholder="t('goal.aiGenerateKR.extraContextPlaceholder')"
                rows="2"
                :disabled="isGenerating"
                data-testid="goal-context-input"
              />
            </div>

            <Alert v-if="error" variant="destructive" data-testid="error-alert">
              <AlertCircle class="h-4 w-4" />
              <AlertTitle>{{ t('goal.aiGenerateKR.error') }}</AlertTitle>
              <AlertDescription>{{ error }}</AlertDescription>
            </Alert>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            @click="closeDialog"
            :disabled="isGenerating"
            data-testid="cancel-button"
          >
            {{ t('goal.aiGenerateKR.cancel') }}
          </Button>
          <Button
            :disabled="!formValid || !hasQuota || isGenerating"
            @click="handleGenerate"
            data-testid="generate-button"
          >
            <Sparkles class="mr-2 h-4 w-4" />
            {{ isGenerating ? t('goal.aiGenerateKR.generating') : t('goal.aiGenerateKR.generate') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Badge } from '@memoflow/ui-vue-shadcn';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@memoflow/ui-vue-shadcn';
import { Input } from '@memoflow/ui-vue-shadcn';
import { Label } from '@memoflow/ui-vue-shadcn';
import { Textarea } from '@memoflow/ui-vue-shadcn';
import { Alert, AlertTitle, AlertDescription } from '@memoflow/ui-vue-shadcn';
import { Sparkles, Info, AlertCircle } from '@lucide/vue';
import {
  fromProductDateInputValue,
  getProductTime,
  toProductDateInputValue,
} from '../../../shared/utils/product-time';

const props = withDefaults(
  defineProps<{
    initialGoalTitle?: string;
    initialGoalDescription?: string;
    initialStartDate?: number;
    initialEndDate?: number;
    isGenerating?: boolean;
    error?: string | null;
    quota?: { remainingQuota: number; quotaLimit: number } | null;
    hasQuota?: boolean;
    timeToReset?: string | null;
  }>(),
  {
    isGenerating: false,
    hasQuota: true,
  },
);

const { t } = useI18n();

const emit = defineEmits<{
  generated: [
    result: {
      keyResults?: Array<{ title: string; targetValue: number; unit: string; weight?: number }>;
    },
  ];
  error: [error: string];
  generate: [data: Record<string, unknown>];
  loadQuota: [];
  clearError: [];
}>();

const showDialog = ref(false);
const formData = ref({
  goalTitle: '',
  goalDescription: '',
  startDate: '',
  endDate: '',
  goalContext: '',
});

const formValid = computed(() => {
  return !!(
    formData.value.goalTitle &&
    formData.value.startDate &&
    formData.value.endDate &&
    formData.value.endDate >= formData.value.startDate
  );
});

function dateToTimestamp(dateStr: string): number {
  const instant = fromProductDateInputValue(dateStr);
  if (instant == null) throw new TypeError(`Invalid Product Time date: ${dateStr}`);
  return instant;
}

function timestampToDateStr(timestamp: number): string {
  return toProductDateInputValue(timestamp);
}

async function openDialog() {
  showDialog.value = true;

  if (props.initialGoalTitle) {
    formData.value.goalTitle = props.initialGoalTitle;
  }
  if (props.initialGoalDescription) {
    formData.value.goalDescription = props.initialGoalDescription;
  }
  const now = Date.now();
  if (props.initialStartDate) {
    formData.value.startDate = timestampToDateStr(props.initialStartDate);
  } else {
    formData.value.startDate = timestampToDateStr(now);
  }
  if (props.initialEndDate) {
    formData.value.endDate = timestampToDateStr(props.initialEndDate);
  } else {
    const defaultEnd = getProductTime().calendar.addDays(now, 30);
    formData.value.endDate = timestampToDateStr(Number(defaultEnd));
  }

  emit('loadQuota');
}

function closeDialog() {
  if (!props.isGenerating) {
    showDialog.value = false;
    resetForm();
  }
}

function resetForm() {
  formData.value = {
    goalTitle: '',
    goalDescription: '',
    startDate: '',
    endDate: '',
    goalContext: '',
  };
  emit('clearError');
}

function handleGenerate() {
  if (!formValid.value || !props.hasQuota) {
    return;
  }

  emit('generate', {
    goalTitle: formData.value.goalTitle,
    goalDescription: formData.value.goalDescription || undefined,
    startDate: dateToTimestamp(formData.value.startDate),
    endDate: dateToTimestamp(formData.value.endDate),
    goalContext: formData.value.goalContext || undefined,
  });
}

watch(
  () => showDialog.value,
  (isOpen) => {
    if (!isOpen) {
      resetForm();
    }
  },
);

defineExpose({
  openDialog,
  closeDialog,
});
</script>
