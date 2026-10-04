import { ref, toValue, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from '@memoflow/ui-vue-shadcn';

export interface DialogCloseGuardOptions {
  dirty: MaybeRefOrGetter<boolean>;
  busy?: MaybeRefOrGetter<boolean>;
  onClose: () => void | Promise<void>;
}

/**
 * Canonical user-initiated dialog dismissal contract.
 *
 * Controlled dialogs keep their model value open while this async guard runs.
 * Programmatic owner closes (for example after a successful save) can still
 * update the model directly without prompting.
 */
export function useDialogCloseGuard(options: DialogCloseGuardOptions) {
  const { t } = useI18n();
  const confirming = ref(false);

  async function requestClose(): Promise<boolean> {
    if (toValue(options.busy ?? false) || confirming.value) return false;

    if (toValue(options.dirty)) {
      confirming.value = true;
      try {
        const approved = await useConfirm({
          title: t('common.unsavedChangesTitle'),
          description: t('common.unsavedChangesDescription'),
          confirmText: t('common.discardChanges'),
          cancelText: t('common.cancel'),
          variant: 'destructive',
        });
        if (!approved) return false;
      } finally {
        confirming.value = false;
      }
    }

    await options.onClose();
    return true;
  }

  return {
    confirming,
    requestClose,
  };
}
