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
  Avatar,
  AvatarFallback,
  AvatarImage,
  Separator,
  Switch,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import { LockKeyhole, LogOut } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useAccount } from '../composables/useAccount';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import { ProfileAccessChannels } from '@memoflow/contracts/electron';
import {
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_LOCK_HANDLER_KEY,
} from '../../../di/keys';
import { translateResultError } from '../../../shared/utils/translate-result-error';

const { t } = useI18n();
const logout = inject(LOGOUT_HANDLER_KEY);
const lockProfile = inject(PROFILE_LOCK_HANDLER_KEY, null);
const desktopBridge = inject(DESKTOP_BRIDGE_KEY, null);
const desktopAccess = inject(DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null));
const authStore = useAuthenticationStore();
const pinSetupOpen = ref(false);
const localPin = ref('');
const localPinConfirmation = ref('');
const pinBusy = ref(false);

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
  avatar: '',
});

const hasAccount = computed(() => currentAccount.value !== null);
const initials = computed(() => (form.nickname || 'DU').slice(0, 2).toUpperCase());
const hasLocalPin = computed(() => desktopAccess.value?.profile?.hasPin === true);
const canConfigureLocalPin = computed(() => Boolean(desktopBridge && desktopAccess.value?.profile));

watch(
  currentAccount,
  (account) => {
    if (!account) {
      return;
    }
    form.nickname = account.profile.nickname || '';
    form.bio = account.profile.bio || '';
    form.avatar = account.profile.avatarUrl || '';
  },
  { immediate: true },
);

async function handleSave() {
  await updateMyProfile({
    nickname: form.nickname,
    bio: form.bio || null,
    avatar: form.avatar || null,
  });
}

async function handleLogout() {
  const confirmed = await useConfirm({
    title: t('account.logoutConfirm.title'),
    description: t('account.logoutConfirm.description'),
    confirmText: t('account.logoutConfirm.confirmText'),
    cancelText: t('account.logoutConfirm.cancelText'),
    variant: 'destructive',
  });

  if (!confirmed) {
    return;
  }

  if (!logout) {
    toast.error(t('auth.toast.operationFailed'), {
      description: t('account.logoutHandlerUnavailable'),
    });
    return;
  }

  try {
    await logout();
    toast.success(t('auth.toast.loggedOut'));
  } catch (error) {
    toast.error(t('auth.toast.operationFailed'), {
      description: translateResultError(error, t, {
        fallbackKey: 'common.operationFailed',
      }),
    });
  }
}

async function handleLockProfile() {
  if (!lockProfile) return;
  await lockProfile();
}

function updateLocalPinSnapshot(hasPin: boolean): void {
  const current = desktopAccess.value;
  if (!current?.profile) return;
  desktopAccess.value = {
    ...current,
    profile: { ...current.profile, hasPin },
  };
}

async function enableLocalPin(): Promise<void> {
  if (!desktopBridge) return;
  if (!/^\d{6,12}$/.test(localPin.value)) {
    toast.error(t('account.localProtection.invalidPin'));
    return;
  }
  if (localPin.value !== localPinConfirmation.value) {
    toast.error(t('account.localProtection.pinMismatch'));
    return;
  }
  pinBusy.value = true;
  const result = (await desktopBridge.invoke(ProfileAccessChannels.PIN_SET, localPin.value)) as {
    ok?: boolean;
    error?: { message?: string };
  };
  pinBusy.value = false;
  if (!result.ok) {
    toast.error(result.error?.message ?? t('account.localProtection.enableFailed'));
    return;
  }
  updateLocalPinSnapshot(true);
  pinSetupOpen.value = false;
  localPin.value = '';
  localPinConfirmation.value = '';
  toast.success(t('account.localProtection.enabled'));
}

async function removeLocalPin(): Promise<void> {
  if (!desktopBridge) return;
  const confirmed = await useConfirm({
    title: t('account.localProtection.removeTitle'),
    description: t('account.localProtection.removeDescription'),
    confirmText: t('account.localProtection.removeConfirm'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  pinBusy.value = true;
  const result = (await desktopBridge.invoke(ProfileAccessChannels.PIN_REMOVE)) as {
    ok?: boolean;
    error?: { message?: string };
  };
  pinBusy.value = false;
  if (!result.ok) {
    toast.error(result.error?.message ?? t('account.localProtection.removeFailed'));
    return;
  }
  updateLocalPinSnapshot(false);
  toast.success(t('account.localProtection.removed'));
}

function handleLocalProtectionToggle(enabled: boolean): void {
  if (enabled) {
    pinSetupOpen.value = true;
    return;
  }
  void removeLocalPin();
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
          <Avatar class="h-20 w-20 border border-border bg-muted/60">
            <AvatarImage :src="form.avatar" :alt="form.nickname" />
            <AvatarFallback class="text-xl font-semibold">{{ initials }}</AvatarFallback>
          </Avatar>

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

          <div class="space-y-2">
            <Label for="avatar">{{ t('account.profile.avatarUrl') }}</Label>
            <Input
              id="avatar"
              v-model="form.avatar"
              :placeholder="t('account.placeholder.avatarUrl')"
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

    <Card v-if="lockProfile" class="border-border/70">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <LockKeyhole class="h-4 w-4" />
          {{ t('account.actions.lockProfile') }}
        </CardTitle>
        <CardDescription>{{ t('account.lockProfileHint') }}</CardDescription>
      </CardHeader>
      <CardContent class="flex justify-end">
        <Button
          data-testid="account-lock-profile-button"
          variant="outline"
          @click="handleLockProfile"
        >
          <LockKeyhole class="mr-2 h-4 w-4" />
          {{ t('account.actions.lockProfile') }}
        </Button>
      </CardContent>
    </Card>

    <Card v-if="canConfigureLocalPin" class="border-border/70">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <LockKeyhole class="h-4 w-4" />
          {{ t('account.localProtection.title') }}
        </CardTitle>
        <CardDescription>{{ t('account.localProtection.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <Label for="local-profile-pin-toggle">{{ t('account.localProtection.toggle') }}</Label>
            <p class="text-sm text-muted-foreground">{{ t('account.localProtection.hint') }}</p>
          </div>
          <Switch
            id="local-profile-pin-toggle"
            data-testid="account-local-pin-toggle"
            :model-value="hasLocalPin"
            :disabled="pinBusy"
            @update:model-value="handleLocalProtectionToggle"
          />
        </div>

        <form
          v-if="pinSetupOpen && !hasLocalPin"
          class="grid gap-3 border-t pt-4 sm:grid-cols-2"
          @submit.prevent="enableLocalPin"
        >
          <div class="space-y-2">
            <Label for="local-profile-pin">{{ t('account.localProtection.pin') }}</Label>
            <Input
              id="local-profile-pin"
              v-model="localPin"
              data-testid="account-local-pin"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              :placeholder="t('account.localProtection.pinPlaceholder')"
            />
          </div>
          <div class="space-y-2">
            <Label for="local-profile-pin-confirmation">{{
              t('account.localProtection.confirmPin')
            }}</Label>
            <Input
              id="local-profile-pin-confirmation"
              v-model="localPinConfirmation"
              data-testid="account-local-pin-confirmation"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              :placeholder="t('account.localProtection.confirmPin')"
            />
          </div>
          <div class="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" @click="pinSetupOpen = false">
              {{ t('common.cancel') }}
            </Button>
            <Button type="submit" data-testid="account-local-pin-save" :disabled="pinBusy">
              {{ t('account.localProtection.enable') }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- 登出：破坏性动作分区（§0.1 危险区约定） -->
    <Card v-if="authStore.isAuthenticated" class="border-destructive/30 bg-destructive/8">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-destructive">
          <LogOut class="h-4 w-4" />
          {{ t('account.actions.logout') }}
        </CardTitle>
        <CardDescription>{{ t('account.logoutHint') }}</CardDescription>
      </CardHeader>

      <CardContent class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p class="text-sm leading-6 text-muted-foreground">
          {{ t('account.logoutConfirm.description') }}
        </p>

        <Button
          data-testid="account-logout-button"
          variant="destructive"
          :disabled="isLoading"
          @click="handleLogout"
        >
          <LogOut class="mr-2 h-4 w-4" />
          {{ t('account.actions.logout') }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
