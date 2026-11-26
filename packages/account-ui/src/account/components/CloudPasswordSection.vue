<script setup lang="ts">
/**
 * CloudPasswordSection — 云端账户密码管理（W6 P1-3 认证 receipt 恢复闭环）
 *
 * 消费 usePassword()（changePassword / forgotPassword）并把结构化密码变更
 * 失败 receipt 渲染回用户界面：安全 message、request id 与按 retryable 提供的
 * 重试动作。receipt 由 store 从 localStorage 恢复，因此页面刷新/卸载重挂后
 * 用户仍能看到上次失败的可操作错误，而不是只看到空表单。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
} from '@memoflow/ui-vue-shadcn';
import { Copy, Mail, RotateCcw, X } from '@lucide/vue';
import { usePassword } from '../../authentication/composables/usePassword';
import { useAuthenticationStore } from '../../authentication/stores/authentication-store';
import AccountEmailVerificationDialog from './AccountEmailVerificationDialog.vue';

const { t } = useI18n();
const changeOpen = ref(false);
const verificationOpen = ref(false);
const verificationToken = ref('');
watch(changeOpen, (open) => {
  changeForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
  if (!open) verificationToken.value = '';
});
const store = useAuthenticationStore();
const { isLoading: passwordLoading, changePassword, forgotPassword } = usePassword();

const changeForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const forgotEmail = ref(store.currentIdentity?.email ?? '');
const maskedResetEmail = computed(() => forgotEmail.value.replace(/^(.).*(@.*)$/, '$1***$2'));

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
  if (
    passwordLoading.value ||
    passwordMismatch.value ||
    !changeForm.value.currentPassword ||
    !changeForm.value.newPassword ||
    !changeForm.value.confirmPassword ||
    !verificationToken.value
  ) {
    return;
  }
  const changed = await changePassword({
    currentPassword: changeForm.value.currentPassword,
    newPassword: changeForm.value.newPassword,
    verificationToken: verificationToken.value,
  });
  if (changed) {
    changeForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    changeOpen.value = false;
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
    // A failed attempt may have consumed or expired the grant; always restart
    // from the mailbox proof instead of retrying a stale token.
    changeOpen.value = false;
    verificationOpen.value = true;
    return;
  }
  await handleSendResetEmail();
}

function handleDismiss() {
  store.clearPasswordMutationError();
}

/**
 * The request id is a support handle, not an action item: it stays out of the
 * receipt's main copy and only surfaces inside the expandable detail, where it
 * can be copied for a support conversation.
 */
const requestIdCopied = ref(false);
let requestIdCopiedTimer: ReturnType<typeof setTimeout> | null = null;

function clearRequestIdCopiedTimer() {
  if (requestIdCopiedTimer) {
    clearTimeout(requestIdCopiedTimer);
    requestIdCopiedTimer = null;
  }
}

async function copyRequestId() {
  const requestId = receipt.value?.requestId;
  if (!requestId) {
    return;
  }
  try {
    await navigator.clipboard.writeText(requestId);
  } catch {
    requestIdCopied.value = false;
    return;
  }
  requestIdCopied.value = true;
  clearRequestIdCopiedTimer();
  requestIdCopiedTimer = setTimeout(() => {
    requestIdCopied.value = false;
    requestIdCopiedTimer = null;
  }, 2000);
}

watch(
  () => receipt.value?.requestId,
  () => {
    clearRequestIdCopiedTimer();
    requestIdCopied.value = false;
  },
);

onBeforeUnmount(clearRequestIdCopiedTimer);
</script>

<template>
  <div v-if="isAuthenticated">
    <div class="flex items-center justify-between gap-4 py-4">
      <span class="text-sm font-medium">{{ t('account.password.title') }}</span>
      <Button
        variant="secondary"
        data-testid="cloud-password-open"
        @click="verificationOpen = true"
        >{{ t('account.password.changePassword') }}</Button
      >
    </div>
    <div class="space-y-6">
      <div
        v-if="receipt"
        role="alert"
        class="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/8 p-4"
        data-testid="password-mutation-error"
      >
        <p
          class="text-sm font-medium text-destructive"
          data-testid="password-mutation-error-message"
        >
          {{ receipt.message }}
        </p>
        <details
          v-if="receipt.requestId"
          class="text-xs text-muted-foreground"
          data-testid="password-mutation-error-request-id-details"
        >
          <summary class="cursor-pointer select-none">
            {{ t('account.password.requestIdDetails') }}
          </summary>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="shrink-0">{{ t('account.password.requestId') }}</span>
            <code
              class="min-w-0 break-all font-mono text-xs"
              data-testid="password-mutation-error-request-id"
            >
              {{ receipt.requestId }}
            </code>
            <Button
              size="sm"
              variant="ghost"
              class="h-7 px-2 text-xs"
              data-testid="password-mutation-error-copy-request-id"
              @click="copyRequestId"
            >
              <Copy class="mr-1 h-3.5 w-3.5" />
              {{
                requestIdCopied
                  ? t('account.password.copiedRequestId')
                  : t('account.password.copyRequestId')
              }}
            </Button>
          </div>
          <p class="mt-1">{{ t('account.password.requestIdPurpose') }}</p>
        </details>
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
          <Button
            size="sm"
            variant="ghost"
            data-testid="password-mutation-error-dismiss"
            @click="handleDismiss"
          >
            <X class="mr-2 h-4 w-4" />
            {{ t('account.password.dismiss') }}
          </Button>
        </div>
      </div>

      <Dialog
        :open="changeOpen"
        @update:open="
          (open) => {
            if (!passwordLoading) changeOpen = open;
          }
        "
      >
        <DialogContent
          class="max-h-dvh overflow-y-auto"
          data-testid="cloud-password-dialog"
          @interact-outside.prevent
        >
          <DialogTitle>{{ t('account.password.changeTitle') }}</DialogTitle>
          <DialogDescription>{{ t('account.password.description') }}</DialogDescription>
          <p v-if="receipt" role="alert" class="text-sm text-destructive">{{ receipt.message }}</p>
          <form class="space-y-4" @submit.prevent="handleChangePassword">
            <div class="space-y-2 sm:col-span-2">
              <Label for="cloud-current-password">{{
                t('account.password.currentPassword')
              }}</Label>
              <Input
                id="cloud-current-password"
                v-model="changeForm.currentPassword"
                data-testid="cloud-password-current"
                :disabled="passwordLoading"
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
                :disabled="passwordLoading"
                type="password"
                autocomplete="new-password"
              />
            </div>
            <div class="space-y-2">
              <Label for="cloud-confirm-password">{{
                t('account.password.confirmPassword')
              }}</Label>
              <Input
                id="cloud-confirm-password"
                v-model="changeForm.confirmPassword"
                data-testid="cloud-password-confirm"
                :disabled="passwordLoading"
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
            <div class="flex justify-end gap-2">
              <Button
                type="button"
                data-testid="cloud-password-cancel"
                variant="outline"
                :disabled="passwordLoading"
                @click="changeOpen = false"
                >{{ t('common.cancel') }}</Button
              >
              <Button
                type="submit"
                data-testid="cloud-password-change-button"
                :disabled="passwordLoading"
              >
                {{ t('account.password.changePassword') }}
              </Button>
            </div>
          </form>
          <div class="space-y-3">
            <h3 class="text-sm font-medium">{{ t('account.password.forgotTitle') }}</h3>
            <p class="text-sm text-muted-foreground">
              {{ t('account.password.forgotDescription') }}
            </p>
            <form
              class="flex flex-col gap-3 sm:flex-row sm:items-end"
              @submit.prevent="handleSendResetEmail"
            >
              <div class="min-w-0 flex-1 space-y-2">
                <p class="text-sm">{{ t('account.password.resetEmail') }}</p>
                <p
                  data-testid="cloud-password-reset-recipient"
                  class="text-sm text-muted-foreground"
                >
                  {{ maskedResetEmail }}
                </p>
              </div>
              <Button
                type="submit"
                variant="outline"
                data-testid="cloud-password-forgot-button"
                :disabled="passwordLoading"
              >
                <Mail class="mr-2 h-4 w-4" />
                {{ t('account.password.sendResetEmail') }}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    <AccountEmailVerificationDialog
      v-model:open="verificationOpen"
      purpose="change-password"
      :email="forgotEmail"
      @verified="
        (token) => {
          verificationToken = token;
          changeOpen = true;
        }
      "
    />
  </div>
</template>
