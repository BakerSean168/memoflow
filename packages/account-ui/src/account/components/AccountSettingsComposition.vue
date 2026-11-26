<script setup lang="ts">
/**
 * AccountSettingsComposition — account-owned settings body (Issue #1099).
 *
 * Composes the account summary, cloud security (email, devices, deletion),
 * local password, launch-time auto enter, connected apps and sign-out.
 * Profile editing belongs to `AccountProfileEditorDialog`; this component never
 * renders an inline profile form. `account-center-view` / `account-logout-button`
 * testids stay here for the auth e2e and Desktop contracts.
 */
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';
import AccountProfileEditorDialog from './AccountProfileEditorDialog.vue';
import LocalPasswordDialog from './LocalPasswordDialog.vue';
import { LogOut } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useAccount } from '../composables/useAccount';
import { useAccountSignOut } from '../composables/useAccountSignOut';
import AccountAutoEnterSection from './AccountAutoEnterSection.vue';
import CloudAccountSecuritySection from './CloudAccountSecuritySection.vue';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';

const { t } = useI18n();
const { SettingsSection } = accountUiHost.components;
const { isDesktopSignOut, confirmSignOut, executeSignOut } = useAccountSignOut();
const desktopBridge = inject(accountUiHost.DESKTOP_BRIDGE_KEY, null);
const desktopAccess = inject(accountUiHost.DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null));
const authStore = useAuthenticationStore();
const localPasswordOpen = ref(false);
const profileEditorOpen = ref(false);
const page = defineModel<'overview' | 'devices'>('page', { default: 'overview' });

const { currentAccount, isLoading, error, email, loadMyProfile } = useAccount();

const hasAccount = computed(() => currentAccount.value !== null);
const isLocalAccount = computed(
  () => desktopAccess.value?.profile?.profileKind === 'local' && Boolean(desktopBridge),
);

async function handleLogout() {
  const confirmed = await confirmSignOut();
  if (!confirmed) {
    return;
  }

  try {
    await executeSignOut();
    // The desktop handler leaves for the account chooser, so only the web
    // surface still has a window to report into.
    if (!isDesktopSignOut.value) toast.success(t('auth.toast.loggedOut'));
  } catch (error) {
    toast.error(t('auth.toast.operationFailed'), {
      description: accountUiHost.translateResultError(error, t, {
        fallbackKey: 'common.operationFailed',
      }),
    });
  }
}

onMounted(() => {
  void loadMyProfile();
});
</script>

<template>
  <div data-testid="account-center-view" class="space-y-6">
    <CloudAccountSecuritySection v-model:page="page" :email="email">
      <template #profile>
        <div class="flex flex-wrap items-center justify-between gap-4 py-4">
          <span class="text-sm font-medium">{{ t('account.profile.nickname') }}</span>
          <div class="flex items-center gap-4">
            <span data-testid="account-settings-nickname" class="text-sm text-muted-foreground">{{
              currentAccount?.profile.nickname || (isLoading ? t('account.status.loading') : '—')
            }}</span>
            <Button
              variant="secondary"
              :disabled="!hasAccount || isLoading"
              data-testid="account-settings-profile-edit"
              @click="profileEditorOpen = true"
              >{{ t('common.edit') }}</Button
            >
          </div>
        </div>
        <div
          v-if="error"
          data-testid="account-profile-error"
          role="alert"
          class="flex flex-wrap items-center justify-between gap-2 pb-4 text-sm text-muted-foreground"
        >
          <p>{{ error }}</p>
          <Button
            data-testid="account-profile-retry"
            variant="outline"
            size="sm"
            :disabled="isLoading"
            @click="loadMyProfile"
          >
            {{ t('common.retry') }}
          </Button>
        </div>
      </template>
      <template v-if="isLocalAccount || $slots.password" #password>
        <div v-if="isLocalAccount" class="flex flex-wrap items-center justify-between gap-4 py-4">
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-sm font-medium">{{ t('account.localPassword.title') }}</p>
            <p class="max-w-lg text-xs leading-5 text-muted-foreground">
              {{ t('account.localPassword.description') }}
            </p>
          </div>

          <Button
            variant="outline"
            data-testid="account-local-password-open"
            @click="localPasswordOpen = true"
          >
            {{ t('account.localPassword.save') }}
          </Button>
        </div>
        <slot name="password" />
      </template>
      <template #preferences><AccountAutoEnterSection /></template>
      <template #connections><slot name="connections" /></template>
      <template #actions>
        <!-- Keep the destructive action explicit without adding another container. -->
        <SettingsSection
          v-if="authStore.isAuthenticated || isDesktopSignOut"
          :title="isDesktopSignOut ? t('account.signOut.action') : t('account.actions.logout')"
          :description="isDesktopSignOut ? t('account.signOut.hint') : t('account.logoutHint')"
          test-id="account-logout-section"
        >
          <p v-if="!isDesktopSignOut" class="mt-2 text-xs leading-5 text-muted-foreground">
            {{ t('account.logoutConfirm.description') }}
          </p>

          <template #actions>
            <Button
              data-testid="account-logout-button"
              variant="destructive"
              :disabled="isLoading"
              @click="handleLogout"
            >
              <LogOut class="mr-2 h-4 w-4" />
              {{ isDesktopSignOut ? t('account.signOut.action') : t('account.actions.logout') }}
            </Button>
          </template>
        </SettingsSection>
      </template>
    </CloudAccountSecuritySection>
    <LocalPasswordDialog v-if="isLocalAccount" v-model:open="localPasswordOpen" />
    <AccountProfileEditorDialog v-if="profileEditorOpen" v-model:open="profileEditorOpen" />
  </div>
</template>
