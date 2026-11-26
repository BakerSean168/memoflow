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
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';
import AccountProfileEditorDialog from './AccountProfileEditorDialog.vue';
import LocalPasswordDialog from './LocalPasswordDialog.vue';
import { LogOut } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useAccount } from '../composables/useAccount';
import { useAccountSignOut } from '../composables/useAccountSignOut';
import { useAccountAvatar } from '../avatar/useAccountAvatar';
import AccountAvatarUploader from './AccountAvatarUploader.vue';
import AccountAutoEnterSection from './AccountAutoEnterSection.vue';
import CloudAccountSecuritySection from './CloudAccountSecuritySection.vue';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';

withDefaults(defineProps<{ showProfile?: boolean }>(), { showProfile: true });

const { t } = useI18n();
const { SettingsSection } = accountUiHost.components;
const { isDesktopSignOut, confirmSignOut, executeSignOut } = useAccountSignOut();
const desktopBridge = inject(accountUiHost.DESKTOP_BRIDGE_KEY, null);
const desktopAccess = inject(accountUiHost.DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null));
const authStore = useAuthenticationStore();
const localPasswordOpen = ref(false);
const profileEditorOpen = ref(false);
const page = defineModel<'overview' | 'devices'>('page', { default: 'overview' });

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

onMounted(() => {
  void loadMyProfile();
});
</script>

<template>
  <div data-testid="account-center-view" class="space-y-6">
    <Card v-if="showProfile" class="border-border/70">
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
            <Textarea
              id="bio"
              v-model="form.bio"
              class="min-h-[76px] resize-none"
              :placeholder="t('account.placeholder.bio')"
              :disabled="isLoading"
              maxlength="500"
              rows="3"
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

    <CloudAccountSecuritySection v-model:page="page" :email="email">
      <template #profile>
        <div v-if="!showProfile" class="flex flex-wrap items-center justify-between gap-4 py-4">
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
        <p v-if="!showProfile && error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>
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
