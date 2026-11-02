/**
 * useAccountSignOut — the single confirmation gate for "退出账号".
 *
 * Both in-app entries (the shell account menu and the Settings account section)
 * ask this composable for the confirmation and then run the injected execution
 * handler. The handler never confirms: it only performs the platform sign-out,
 * so one click can never produce two dialogs.
 *
 * Desktop copy branches on `profileKind` because the two account types lose
 * different things. Web keeps its cloud-only wording verbatim — there the
 * account survives and only the cloud session ends.
 */
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';

export function useAccountSignOut() {
  const { t } = useI18n();
  const logoutHandler = inject(accountUiHost.LOGOUT_HANDLER_KEY, null);
  const desktopBridge = inject(accountUiHost.DESKTOP_BRIDGE_KEY, null);
  const desktopAccess = inject(accountUiHost.DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null));

  const profile = computed(() =>
    desktopBridge && desktopAccess.value?.profile ? desktopAccess.value.profile : null,
  );
  const isDesktopSignOut = computed(() => profile.value !== null);
  const profileKind = computed(() => profile.value?.profileKind ?? null);

  /** Returns true when the user confirmed (or when the host needs no dialog). */
  async function confirmSignOut(): Promise<boolean> {
    const kind = profileKind.value;
    if (kind) {
      const scope = kind === 'local' ? 'local' : 'registered';
      return useConfirm({
        title: t(`account.signOut.confirm.${scope}.title`),
        description: t(`account.signOut.confirm.${scope}.description`),
        confirmText: t('account.signOut.action'),
        cancelText: t('common.cancel'),
        variant: 'destructive',
      });
    }
    return useConfirm({
      title: t('account.logoutConfirm.title'),
      description: t('account.logoutConfirm.description'),
      confirmText: t('account.logoutConfirm.confirmText'),
      cancelText: t('account.logoutConfirm.cancelText'),
      variant: 'destructive',
    });
  }

  /** Runs the host's execution-only sign-out. */
  async function executeSignOut(): Promise<void> {
    if (!logoutHandler) throw new Error(t('account.logoutHandlerUnavailable'));
    await logoutHandler();
  }

  return { isDesktopSignOut, profileKind, confirmSignOut, executeSignOut };
}
