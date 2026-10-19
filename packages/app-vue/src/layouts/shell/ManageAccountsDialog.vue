<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import ProductDialogShell from '../../shared/components/ProductDialogShell.vue';
import DesktopProfileList from '../../shared/components/DesktopProfileList.vue';
import type { useDesktopProfiles } from '../../shared/composables/useDesktopProfiles';

const props = defineProps<{
  open: boolean;
  presenter: ReturnType<typeof useDesktopProfiles>;
  returnFocus?: HTMLElement | null;
}>();
const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'add-account'): void;
  (event: 'import-profile'): void;
  (event: 'pin-settings'): void;
}>();
const { t } = useI18n();
const { snapshot, busyProfileId, pin, selectedProfileId, editingProfileId } = props.presenter;
watch(
  () => props.open,
  async (open) => {
    if (open) await props.presenter.refreshProfiles();
    else {
      pin.value = '';
      selectedProfileId.value = null;
      editingProfileId.value = null;
    }
  },
  { immediate: true },
);
async function restoreFocus(event: Event): Promise<void> {
  if (!props.returnFocus?.isConnected) return;
  event.preventDefault();
  await nextTick();
  props.returnFocus.focus({ preventScroll: true });
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell
      :open="open"
      test-id="manage-accounts-dialog"
      recipe="config"
      @close-auto-focus="restoreFocus"
    >
      <template #title>{{ t('shell.account.manageProfiles') }}</template>
      <template #description>{{ t('shell.account.manageDescription') }}</template>
      <div class="mb-4 flex flex-wrap gap-2">
        <Button
          data-testid="shell-add-account"
          :disabled="busyProfileId !== null"
          @click="emit('add-account')"
        >
          {{ t('shell.account.addAccount') }}
        </Button>
        <Button
          v-if="snapshot?.profile?.profileKind === 'registered'"
          data-testid="shell-import-profile"
          variant="outline"
          :disabled="busyProfileId !== null"
          @click="emit('import-profile')"
          >{{ t('shell.profileImport.title') }}</Button
        >
      </div>
      <DesktopProfileList :presenter="presenter" management @pin-settings="emit('pin-settings')" />
      <template #footer>
        <Button variant="outline" @click="emit('update:open', false)">{{
          t('common.close')
        }}</Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>
