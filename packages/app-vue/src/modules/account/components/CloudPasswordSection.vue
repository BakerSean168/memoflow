<script setup lang="ts">
/**
 * CloudPasswordSection — 云端账户密码管理（W6 P1-3 认证 receipt 恢复闭环）
 *
 * 消费 usePassword()（changePassword / forgotPassword）并把结构化密码变更
 * 失败 receipt 渲染回用户界面：安全 message、request id 与按 retryable 提供的
 * 重试动作。receipt 由 store 从 localStorage 恢复，因此页面刷新/卸载重挂后
 * 用户仍能看到上次失败的可操作错误，而不是只看到空表单。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
} from '@memoflow/ui-vue-shadcn';
import { KeyRound, Mail, RotateCcw, X } from '@lucide/vue';
import { usePassword } from '../../authentication/composables/usePassword';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';

const { t } = useI18n();
const store = useAuthenticationStore();
const { isLoading: passwordLoading, changePassword, forgotPassword } = usePassword();

const changeForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const forgotEmail = ref(store.currentIdentity?.email ?? '');

const receipt = computed(() => store.passwordMutationError);
const isAuthenticated = computed(() => store.isAuthenticated);

const passwordMismatch = computed(
  () =>
    changeForm.value.newPassword.length > 0 &&
    changeForm.value.confirmPassword.length > 0 &&
    changeForm.value.newPassword !== changeForm.value.confirmPassword,
);

watch(
  () => store.currentIdentity?.email,
  (email) => {
    if (email) {
      forgotEmail.value = email;
    }
  },
  { immediate: true },
);

async function handleChangePassword() {
  if (passwordMismatch.value) {
    return;
  }
  const changed = await changePassword({
    currentPassword: changeForm.value.currentPassword,
    newPassword: changeForm.value.newPassword,
  });
  if (changed) {
    changeForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
  }
}

async function handleSendResetEmail() {
  await forgotPassword({ email: forgotEmail.value });
}

/** Retry the failed operation. Reset tokens are never persisted by design, so a
 * reset-password receipt retries by re-issuing a reset email instead. */
async function handleRetry() {
  const current = receipt.value;
  if (!current) {
    return;
  }
  if (current.operation === 'change-password') {
    await handleChangePassword();
    return;
  }
  await handleSendResetEmail();
}

function handleDismiss() {
  store.clearPasswordMutationError();
}
</script>

<template>
  <Card v-if="isAuthenticated" class="border-border/70">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <KeyRound class="h-4 w-4" />
        {{ t('account.password.title') }}
      </CardTitle>
      <CardDescription>{{ t('account.password.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      <div
        v-if="receipt"
        role="alert"
        class="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/8 p-4"
        data-testid="password-mutation-error"
      >
        <p class="text-sm font-medium text-destructive" data-testid="password-mutation-error-message">
          {{ receipt.message }}
        </p>
        <p
          v-if="receipt.requestId"
          class="text-xs text-muted-foreground"
          data-testid="password-mutation-error-request-id"
        >
          {{ t('account.password.requestId') }}: {{ receipt.requestId }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="receipt.retryable"
            size="sm"
            variant="outline"
            data-testid="password-mutation-error-retry"
            @click="handleRetry"
          >
            <RotateCcw class="mr-2 h-4 w-4" />
            {{ t('account.password.retry') }}
          </Button>
          <Button size="sm" variant="ghost" data-testid="password-mutation-error-dismiss" @click="handleDismiss">
            <X class="mr-2 h-4 w-4" />
            {{ t('account.password.dismiss') }}
          </Button>
        </div>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-medium">{{ t('account.password.changeTitle') }}</h3>
        <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="handleChangePassword">
          <div class="space-y-2 sm:col-span-2">
            <Label for="cloud-current-password">{{ t('account.password.currentPassword') }}</Label>
            <Input
              id="cloud-current-password"
              v-model="changeForm.currentPassword"
              data-testid="cloud-password-current"
              type="password"
              autocomplete="current-password"
            />
          </div>
          <div class="space-y-2">
            <Label for="cloud-new-password">{{ t('account.password.newPassword') }}</Label>
            <Input
              id="cloud-new-password"
              v-model="changeForm.newPassword"
              data-testid="cloud-password-new"
              type="password"
              autocomplete="new-password"
            />
          </div>
          <div class="space-y-2">
            <Label for="cloud-confirm-password">{{ t('account.password.confirmPassword') }}</Label>
            <Input
              id="cloud-confirm-password"
              v-model="changeForm.confirmPassword"
              data-testid="cloud-password-confirm"
              type="password"
              autocomplete="new-password"
            />
          </div>
          <p
            v-if="passwordMismatch"
            class="text-xs text-destructive sm:col-span-2"
            data-testid="cloud-password-mismatch"
          >
            {{ t('account.password.passwordMismatch') }}
          </p>
          <div class="flex justify-end sm:col-span-2">
            <Button
              type="submit"
              data-testid="cloud-password-change-button"
              :disabled="passwordLoading"
            >
              {{ t('account.password.changePassword') }}
            </Button>
          </div>
        </form>
      </div>

      <Separator />

      <div class="space-y-3">
        <h3 class="text-sm font-medium">{{ t('account.password.forgotTitle') }}</h3>
        <p class="text-sm text-muted-foreground">{{ t('account.password.forgotDescription') }}</p>
        <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="handleSendResetEmail">
          <div class="min-w-0 flex-1 space-y-2">
            <Label for="cloud-forgot-email">{{ t('account.password.resetEmail') }}</Label>
            <Input
              id="cloud-forgot-email"
              v-model="forgotEmail"
              data-testid="cloud-password-forgot-email"
              type="email"
              autocomplete="email"
            />
          </div>
          <Button type="submit" variant="outline" data-testid="cloud-password-forgot-button" :disabled="passwordLoading">
            <Mail class="mr-2 h-4 w-4" />
            {{ t('account.password.sendResetEmail') }}
          </Button>
        </form>
      </div>
    </CardContent>
  </Card>
</template>
