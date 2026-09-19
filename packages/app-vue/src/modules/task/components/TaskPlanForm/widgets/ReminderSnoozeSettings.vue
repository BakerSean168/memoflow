<!-- widgets/ReminderSnoozeSettings.vue -->
<template>
  <div class="w-full">
    <div class="grid grid-cols-12 gap-4">
      <div class="col-span-12">
        <div class="flex items-center gap-2">
          <Switch
            :model-value="localSnooze.enabled"
            :aria-label="t('task.reminderSnooze.allowSnooze')"
            @update:model-value="updateEnabled"
          />
          <Label>{{ t('task.reminderSnooze.allowSnooze') }}</Label>
        </div>
      </div>

      <template v-if="localSnooze.enabled">
        <div class="col-span-12 md:col-span-6">
          <Label>{{ t('task.reminderSnooze.snoozeInterval') }}</Label>
          <Input
            :model-value="localSnooze.interval"
            @update:model-value="updateInterval"
            type="number"
            min="1"
            max="60"
            class="mt-1"
          />
        </div>

        <div class="col-span-12 md:col-span-6">
          <Label>{{ t('task.reminderSnooze.maxRepeats') }}</Label>
          <Input
            :model-value="localSnooze.maxCount"
            @update:model-value="updateMaxCount"
            type="number"
            min="1"
            max="10"
            class="mt-1"
          />
        </div>

        <div class="col-span-12">
          <Alert>
            <Info class="h-4 w-4" />
            <AlertDescription>
              {{ t('task.reminderSnooze.alertText') }}
            </AlertDescription>
          </Alert>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Switch, Label, Input, Alert, AlertDescription } from '@memoflow/ui-vue-shadcn';
import { Info } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// 本地 SnoozeConfig 类型定义 (此功能可能尚未实现)
interface SnoozeConfig {
  enabled: boolean;
  interval: number;
  maxCount: number;
}

const props = defineProps<{
  modelValue: SnoozeConfig;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: SnoozeConfig];
}>();

const localSnooze = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const updateEnabled = (value: boolean) => {
  emit('update:modelValue', { ...props.modelValue, enabled: value });
};

const updateInterval = (value: string | number) => {
  emit('update:modelValue', { ...props.modelValue, interval: Number(value) });
};

const updateMaxCount = (value: string | number) => {
  emit('update:modelValue', { ...props.modelValue, maxCount: Number(value) });
};
</script>
