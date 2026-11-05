<script setup lang="ts">
/**
 * AccountProfileSection — 账户资料 + 登出（UI_PAGE_REDESIGN_PLAN §13）
 *
 * 从 AccountCenterView 原样迁入（表单/登出确认逻辑不变），
 * 作为设置页「账户与隐私」分组的一节。`account-center-view` /
 * `account-logout-button` testid 随组件迁移（auth e2e 契约）。
 */
import { computed, inject, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
} from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';
import { LockKeyhole, LogOut } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useAccount } from '../composables/useAccount';
import { useAccountSignOut } from '../composables/useAccountSignOut';
import { useAccountAvatar } from '../avatar/useAccountAvatar';
import AccountAvatarUploader from './AccountAvatarUploader.vue';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import { ProfileAccessChannels } from '@memoflow/desktop-contracts';

const { t } = useI18n();
const { SettingsDangerZone } = accountUiHost.components;
const { isDesktopSignOut, confirmSignOut, executeSignOut } = useAccountSignOut();
const desktopBridge = inject(accountUiHost.DESKTOP_BRIDGE_KEY, null);
const desktopAccess = inject(accountUiHost.DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null));
const authStore = useAuthenticationStore();
const localPassword = ref('');
const localPasswordConfirmation = ref('');
const localPasswordBusy = ref(false);

const {
  currentAccount,
  isLoading,
  error,
  email,
  isEmailVerified,
  isGuest,
  loadMyProfile,
  updateMyProfile,
} = useAccount();

const form = reactive({
  nickname: '',
  bio: '',
});

const hasAccount = computed(() => currentAccount.value !== null);
const initials = computed(() => (form.nickname || 'DU').slice(0, 2).toUpperCase());
// Local avatar wins; a legacy URL still renders when no local file exists, but
// the URL itself is no longer editable (Issue #858 one-way compatibility read).
const { avatarUrl } = useAccountAvatar(() => currentAccount.value?.profile?.avatarUrl ?? null);
const isLocalAccount = computed(
  () => desktopAccess.value?.profile?.profileKind === 'local' && Boolean(desktopBridge),
);

watch(
  currentAccount,
  (account) => {
    if (!account) {
      return;
    }
    form.nickname = account.profile.nickname || '';
    form.bio = account.profile.bio || '';
  },
  { immediate: true },
);

async function handleSave() {
  await updateMyProfile({
    nickname: form.nickname,
    bio: form.bio || null,
  });
}

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

async function changeLocalPassword(): Promise<void> {
  if (!desktopBridge) return;
  if (localPassword.value.length < 8) {
    toast.error(t('account.localPassword.tooShort'));
    return;
  }
  if (localPassword.value !== localPasswordConfirmation.value) {
    toast.error(t('account.localPassword.mismatch'));
    return;
  }
  localPasswordBusy.value = true;
  const result = (await desktopBridge.invoke(
    ProfileAccessChannels.PASSWORD_SET,
    localPassword.value,
  )) as {
    ok?: boolean;
    error?: { message?: string };
  };
  localPasswordBusy.value = false;
  if (!result.ok) {
    toast.error(result.error?.message ?? t('account.localPassword.failed'));
    return;
  }
  localPassword.value = '';
  localPasswordConfirmation.value = '';
  toast.success(t('account.localPassword.saved'));
}

onMounted(() => {
  void loadMyProfile();
});
</script>

<template>
  <div data-testid="account-center-view" class="space-y-6">
    <Card class="border-border/70">
      <CardHeader>
        <CardTitle>{{ t('account.center') }}</CardTitle>
        <CardDescription>{{ t('account.description') }}</CardDescription>
      </CardHeader>

      <CardContent v-if="hasAccount" class="space-y-8">
        <div class="flex flex-col gap-5 md:flex-row md:items-center">
          <AccountAvatarUploader
            :avatar-url="avatarUrl"
            :initials="initials"
            :disabled="isLoading"
            test-id="account-profile-avatar"
          />

          <div class="space-y-1">
            <div class="text-xl font-semibold">{{ form.nickname }}</div>
            <div class="text-sm text-muted-foreground">
              {{ isGuest ? t('account.guestLabel') : email }}
            </div>
            <div v-if="!isGuest && email" class="text-xs text-muted-foreground">
              {{ isEmailVerified ? t('account.emailVerified') : t('account.emailUnverified') }}
            </div>
          </div>
        </div>

        <Separator />

        <div class="grid gap-5 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="nickname">{{ t('account.profile.nickname') }}</Label>
            <Input
              id="nickname"
              v-model="form.nickname"
              data-testid="account-profile-nickname"
              :placeholder="t('account.placeholder.nickname')"
              :disabled="isLoading"
            />
          </div>

          <div class="space-y-2 md:col-span-2">
            <Label for="bio">{{ t('account.profile.bio') }}</Label>
            <Input
              id="bio"
              v-model="form.bio"
              :placeholder="t('account.placeholder.bio')"
              :disabled="isLoading"
            />
          </div>
        </div>
      </CardContent>

      <CardContent
        v-else-if="error"
        data-testid="account-profile-error"
        class="space-y-3 text-sm text-muted-foreground"
        role="alert"
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
      </CardContent>

      <CardContent
        v-else
        data-testid="account-profile-loading"
        class="text-sm text-muted-foreground"
      >
        {{ t('account.status.loading') }}
      </CardContent>

      <CardFooter class="justify-end border-t border-border/60 bg-muted/40 px-6 py-4">
        <Button
          data-testid="account-profile-save"
          :disabled="isLoading || !hasAccount"
          @click="handleSave"
        >
          {{ t('account.actions.saveProfile') }}
        </Button>
      </CardFooter>
    </Card>

    <Card v-if="isLocalAccount" class="border-border/70">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <LockKeyhole class="h-4 w-4" />
          {{ t('account.localPassword.title') }}
        </CardTitle>
        <CardDescription>{{ t('account.localPassword.description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          class="grid gap-3 sm:grid-cols-2"
          data-testid="account-local-password"
          @submit.prevent="changeLocalPassword"
        >
          <div class="space-y-2">
            <Label for="local-profile-password">{{ t('account.localPassword.newPassword') }}</Label>
            <Input
              id="local-profile-password"
              v-model="localPassword"
              data-testid="account-local-password-new"
              type="password"
              autocomplete="new-password"
              :placeholder="t('account.localPassword.placeholder')"
            />
          </div>
          <div class="space-y-2">
            <Label for="local-profile-password-confirmation">{{
              t('account.localPassword.confirmPassword')
            }}</Label>
            <Input
              id="local-profile-password-confirmation"
              v-model="localPasswordConfirmation"
              data-testid="account-local-password-confirmation"
              type="password"
              autocomplete="new-password"
              :placeholder="t('account.localPassword.confirmPassword')"
            />
          </div>
          <div class="flex justify-end sm:col-span-2">
            <Button
              type="submit"
              data-testid="account-local-password-save"
              :disabled="localPasswordBusy || !localPassword"
            >
              {{ t('account.localPassword.save') }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Destructive account actions stay explicit while sharing the Settings danger-zone grammar. -->
    <SettingsDangerZone
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
    </SettingsDangerZone>
  </div>
</template>
