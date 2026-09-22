<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell
      :open="open"
      test-id="routine-profile-dialog"
      size="sm"
      initial-focus-selector="[data-testid='routine-profile-name-input']"
    >
      <template #icon><Layers3 class="mt-0.5 h-5 w-5 text-primary" /></template>
      <template #title>{{ profile ? t('routine.profile.edit') : t('routine.profile.create') }}</template>
      <template #description>{{ t('routine.description') }}</template>

      <form id="routine-profile-form" class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="routine-profile-name">{{ t('routine.profile.name') }}</Label>
          <Input
            id="routine-profile-name"
            v-model="name"
            data-testid="routine-profile-name-input"
            maxlength="200"
            :disabled="saving"
          />
        </div>
        <div class="space-y-2">
          <Label for="routine-profile-description">{{ t('routine.profile.description') }}</Label>
          <Textarea
            id="routine-profile-description"
            v-model="description"
            rows="3"
            :disabled="saving"
          />
        </div>
        <div class="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
          <div>
            <p class="text-sm font-medium">{{ t('routine.profile.enabled') }}</p>
            <p class="text-xs text-muted-foreground">{{ t('routine.profile.title') }}</p>
          </div>
          <Switch
            :model-value="enabled"
            :disabled="saving"
            :aria-label="t('routine.profile.enabled')"
            @update:model-value="enabled = $event"
          />
        </div>
      </form>

      <template #footer>
        <Button type="button" variant="ghost" :disabled="saving" @click="emit('update:open', false)">
          {{ t('routine.form.cancel') }}
        </Button>
        <Button
          type="submit"
          form="routine-profile-form"
          data-testid="routine-profile-save"
          :disabled="!name.trim() || saving"
          :loading="saving"
        >
          {{ profile ? t('routine.form.save') : t('routine.form.create') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Layers3 } from '@lucide/vue';
import { Button, Dialog, Input, Label, Switch, Textarea } from '@memoflow/ui-vue-shadcn';
import type { RoutineProfileDto } from '@memoflow/contracts/routine';
import { ProductDialogShell } from '../../../shared/components';

const props = withDefaults(
  defineProps<{
    open: boolean;
    saving?: boolean;
    profile?: RoutineProfileDto | null;
  }>(),
  { saving: false, profile: null },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [value: { name: string; description: string | null; enabled: boolean }];
}>();

const { t } = useI18n();
const name = ref('');
const description = ref('');
const enabled = ref(true);

watch(
  () => [props.open, props.profile?.id, props.profile?.version],
  () => {
    if (!props.open) return;
    name.value = props.profile?.name ?? '';
    description.value = props.profile?.description ?? '';
    enabled.value = props.profile?.enabled ?? true;
  },
  { immediate: true },
);

function submit(): void {
  const normalized = name.value.trim();
  if (!normalized || props.saving) return;
  emit('save', {
    name: normalized,
    description: description.value.trim() || null,
    enabled: enabled.value,
  });
}
</script>
