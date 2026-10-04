<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <ProductDialogShell
      :open="open"
      test-id="routine-profile-dialog"
      size="sm"
      initial-focus-selector="[data-testid='routine-profile-name-input']"
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
              :disabled="saving"
              @limit-exceeded="nameLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="nameLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
              >
                {{ t('routine.profile.nameLimitExceeded') }}
              </p>
            </Transition>
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
              :disabled="saving"
              @limit-exceeded="descriptionLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="descriptionLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
              >
                {{ t('routine.profile.descriptionLimitExceeded') }}
              </p>
            </Transition>
          </div>
        </section>
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
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import type { RoutineProfileDto } from '@memoflow/contracts/routine';
import { ProductAutoTextarea, ProductDialogShell } from '../../../shared/components';
import { useTransientFeedback } from '../../../shared/composables/useTransientFeedback';
import { useDialogCloseGuard } from '../../../shared/composables/useDialogCloseGuard';

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
  save: [value: { name: string; description: string | null }];
}>();

const { t } = useI18n();
const name = ref('');
const description = ref('');
const baseline = ref('');
const nameLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();

function snapshot(): string {
  return JSON.stringify({ name: name.value, description: description.value });
}

const isDirty = computed(() => props.open && snapshot() !== baseline.value);
const { requestClose } = useDialogCloseGuard({
  dirty: isDirty,
  busy: () => props.saving,
  onClose: () => emit('update:open', false),
});

watch(
  () => [props.open, props.profile?.id, props.profile?.version],
  () => {
    if (!props.open) return;
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
  const normalized = name.value.trim();
  if (!normalized || props.saving) return;
  emit('save', {
    name: normalized,
    description: description.value.trim() || null,
  });
}
</script>
