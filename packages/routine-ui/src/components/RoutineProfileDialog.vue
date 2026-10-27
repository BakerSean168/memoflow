<template>
  <ProductEditorFrame
    :open="open"
    test-id="routine-profile-dialog"
    :presentation="presentation"
    :close-disabled="saving"
    title-id="routine-profile-panel-title"
    pane-size="compact"
    recipe="form"
    content-class="sm:max-w-[440px]"
    @update:open="handleOpenChange"
    initial-focus-selector="[data-testid='routine-profile-name-input']"
    return-focus-selector="[data-testid='routine-profile-filter']"
  >
    <template #title>{{
      profile ? t('routine.profile.edit') : t('routine.profile.create')
    }}</template>

    <form id="routine-profile-form" class="flex flex-col gap-5" @submit.prevent="submit">
      <section class="space-y-3">
        <div>
          <ProductAutoTextarea
            v-model="name"
            :max-length="100"
            :rows="1"
            data-testid="routine-profile-name-input"
            class="min-h-10 text-xl font-semibold leading-tight text-foreground"
            :placeholder="t('routine.profile.namePlaceholder')"
            :aria-label="t('routine.profile.name')"
            focus-ring
            :aria-invalid="Boolean(nameError)"
            :aria-describedby="nameError ? 'routine-profile-name-feedback' : undefined"
            :disabled="saving"
            @limit-exceeded="nameLimitFeedback.show()"
            @blur="nameTouched = true"
          />
          <ProductInlineValidation
            id="routine-profile-name-feedback"
            :visible="Boolean(nameError)"
            :message="nameError"
          />
        </div>

        <div>
          <ProductAutoTextarea
            v-model="description"
            :max-length="2000"
            :rows="2"
            data-testid="routine-profile-description-input"
            class="min-h-8 text-sm leading-5 text-muted-foreground"
            :placeholder="t('routine.profile.descriptionPlaceholder')"
            :aria-label="t('routine.profile.description')"
            focus-ring
            :aria-invalid="descriptionLimitFeedback.visible.value"
            :aria-describedby="
              descriptionLimitFeedback.visible.value
                ? 'routine-profile-description-feedback'
                : undefined
            "
            :disabled="saving"
            @limit-exceeded="descriptionLimitFeedback.show()"
          />
          <ProductInlineValidation
            id="routine-profile-description-feedback"
            :visible="descriptionLimitFeedback.visible.value"
            :message="t('routine.profile.descriptionLimitExceeded')"
          />
        </div>
      </section>
      <ProductInlineValidation
        test-id="routine-profile-submit-error"
        :visible="Boolean(submitError)"
        :message="submitError ?? ''"
      />
    </form>

    <template #footer>
      <Button type="button" variant="ghost" :disabled="saving" @click="requestClose()">
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
  </ProductEditorFrame>
</template>

<script setup lang="ts">
import { routineUiHost } from '../routine-ui-host';
const { useDialogCloseGuard, useTransientFeedback } = routineUiHost;
const { ProductAutoTextarea, ProductEditorFrame, ProductInlineValidation } = routineUiHost.components;

import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import type { RoutineProfileDto } from '@memoflow/routine-contracts';




const props = withDefaults(
  defineProps<{
    open: boolean;
    saving?: boolean;
    submitError?: string | null;
    presentation?: 'dialog' | 'panel';
    profile?: RoutineProfileDto | null;
  }>(),
  { saving: false, profile: null, presentation: 'dialog', submitError: null },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  'dirty-change': [dirty: boolean];
  save: [value: { name: string; description: string | null }];
}>();

const { t } = useI18n();
const name = ref('');
const nameTouched = ref(false);
const nameError = computed(() =>
  nameTouched.value && !name.value.trim()
    ? t('routine.profile.nameRequired')
    : nameLimitFeedback.visible.value
      ? t('routine.profile.nameLimitExceeded')
      : '',
);
const description = ref('');
const baseline = ref('');
const nameLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();
watch(
  () => name.value,
  (value) => {
    if (value.length < 100) nameLimitFeedback.hide();
  },
);

function snapshot(): string {
  return JSON.stringify({ name: name.value, description: description.value });
}

const isDirty = computed(() => props.open && snapshot() !== baseline.value);
watch(isDirty, (dirty) => emit('dirty-change', dirty), { immediate: true });
const { requestClose } = useDialogCloseGuard({
  dirty: isDirty,
  busy: () => props.saving,
  onClose: () => emit('update:open', false),
});

watch(
  () => [props.open, props.profile?.id, props.profile?.version],
  () => {
    if (!props.open) return;
    nameTouched.value = false;
    name.value = props.profile?.name ?? '';
    description.value = props.profile?.description ?? '';
    nameLimitFeedback.hide();
    descriptionLimitFeedback.hide();
    baseline.value = snapshot();
  },
  { immediate: true },
);

function handleOpenChange(value: boolean): void {
  if (value) {
    emit('update:open', true);
    return;
  }
  void requestClose();
}

function submit(): void {
  nameTouched.value = true;
  const normalized = name.value.trim();
  if (!normalized || props.saving) return;
  emit('save', {
    name: normalized,
    description: description.value.trim() || null,
  });
}
</script>
