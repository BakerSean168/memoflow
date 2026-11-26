<script setup lang="ts">
/**
 * AccountEmailVerificationDialog — 敏感账户操作前的当前邮箱所有权证明。
 *
 * 两步交互：说明并发送验证码 → 输入 6 位验证码。验证成功后只向上抛出一
 * 次性 grant，自身不执行任何密码或邮箱 mutation；服务端仍会再次绑定账户、
 * 当前邮箱、会话与操作用途。取消、重发倒计时、过期和错误都由这里呈现。
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AccountVerificationChallenge,
  AccountVerificationPurpose,
} from '@memoflow/cloud-auth-contracts';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label } from '@memoflow/ui-vue-shadcn';
import { CLOUD_ACCOUNT_SECURITY_KEY } from '../../account-ui-host';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ purpose: AccountVerificationPurpose; email: string | null }>();
const emit = defineEmits<{ verified: [verificationToken: string] }>();
const { t } = useI18n();
const service = inject(CLOUD_ACCOUNT_SECURITY_KEY, null);

const maskedEmail = computed(() => props.email?.replace(/^(.).*(@.*)$/, '$1***$2') ?? '—');
const step = ref<'explain' | 'code' | 'expired'>('explain');
const challenge = ref<AccountVerificationChallenge | null>(null);
const code = ref('');
const error = ref('');
const busy = ref(false);
const resendRemaining = ref(0);
const codeInput = ref<{ $el: HTMLInputElement } | null>(null);
const primaryAction = ref<{ $el: HTMLButtonElement } | null>(null);

let ticker: ReturnType<typeof setInterval> | null = null;
let resendAt = 0;
let expiresAt = 0;

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function updateCounters() {
  const now = Date.now();
  resendRemaining.value = Math.max(0, Math.ceil((resendAt - now) / 1000));
  if (step.value === 'code' && expiresAt > 0 && now >= expiresAt) {
    step.value = 'expired';
    error.value = '';
    stopTicker();
  }
}

function startTicker() {
  stopTicker();
  updateCounters();
  ticker = setInterval(updateCounters, 1000);
}

watch(open, async (isOpen) => {
  if (isOpen) {
    step.value = 'explain';
    challenge.value = null;
    code.value = '';
    error.value = '';
    busy.value = false;
    resendRemaining.value = 0;
    resendAt = 0;
    expiresAt = 0;
    stopTicker();
    await nextTick();
    primaryAction.value?.$el.focus();
    return;
  }
  stopTicker();
  challenge.value = null;
  code.value = '';
});

onBeforeUnmount(stopTicker);

async function sendCode() {
  if (!service || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await service.requestAccountVerification(props.purpose);
    if (!result.ok) {
      error.value = result.error.message;
      return;
    }
    challenge.value = result.data;
    step.value = 'code';
    code.value = '';
    resendAt = Date.now() + result.data.retryAfterSeconds * 1000;
    expiresAt = Date.now() + result.data.expiresInSeconds * 1000;
    startTicker();
    await nextTick();
    codeInput.value?.$el.focus();
  } finally {
    busy.value = false;
  }
}

async function verifyCode() {
  if (!service || !challenge.value || busy.value || code.value.length !== 6) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await service.verifyAccountVerification({
      purpose: props.purpose,
      challengeId: challenge.value.challengeId,
      code: code.value,
    });
    if (!result.ok) {
      error.value = result.error.message;
      code.value = '';
      await nextTick();
      codeInput.value?.$el.focus();
      return;
    }
    emit('verified', result.data.verificationToken);
    open.value = false;
  } finally {
    busy.value = false;
  }
}

async function backToExplain() {
  step.value = 'explain';
  challenge.value = null;
  code.value = '';
  error.value = '';
  stopTicker();
  await nextTick();
  primaryAction.value?.$el.focus();
}

function handleOpenChange(next: boolean) {
  if (busy.value) return;
  open.value = next;
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="max-h-dvh overflow-y-auto sm:max-w-md"
      data-testid="account-email-verification-dialog"
      @interact-outside.prevent
    >
      <DialogTitle class="text-lg font-semibold tracking-tight">
        {{ t('account.verification.title') }}
      </DialogTitle>
      <DialogDescription>
        {{ t('account.verification.description', { email: maskedEmail }) }}
      </DialogDescription>

      <template v-if="step === 'explain'">
        <p class="text-sm text-muted-foreground">
          {{ t('account.verification.explain') }}
        </p>
        <p v-if="error" role="alert" class="text-sm text-destructive" data-testid="account-verification-error">
          {{ error }}
        </p>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="account-verification-cancel"
            :disabled="busy"
            @click="open = false"
            >{{ t('common.cancel') }}</Button
          >
          <Button
            ref="primaryAction"
            type="button"
            data-testid="account-verification-send"
            :disabled="busy || !service"
            @click="sendCode"
          >
            {{ busy ? t('account.verification.sending') : t('account.verification.sendCode') }}
          </Button>
        </div>
      </template>

      <form
        v-else-if="step === 'code'"
        class="space-y-4"
        data-testid="account-verification-code-step"
        @submit.prevent="verifyCode"
      >
        <div class="space-y-2">
          <Label for="account-verification-code">{{ t('account.verification.codeLabel') }}</Label>
          <Input
            id="account-verification-code"
            ref="codeInput"
            v-model="code"
            data-testid="account-verification-code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            pattern="[0-9]{6}"
            :aria-invalid="Boolean(error)"
            :disabled="busy"
            :placeholder="t('account.verification.codePlaceholder')"
          />
          <p class="text-xs text-muted-foreground">
            {{ t('account.verification.codeHint', { email: maskedEmail }) }}
          </p>
        </div>
        <p v-if="error" role="alert" class="text-sm text-destructive" data-testid="account-verification-error">
          {{ error }}
        </p>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            data-testid="account-verification-resend"
            :disabled="busy || resendRemaining > 0"
            @click="sendCode"
          >
            {{
              resendRemaining > 0
                ? t('account.verification.resendIn', { seconds: resendRemaining })
                : t('account.verification.resend')
            }}
          </Button>
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="account-verification-back"
              :disabled="busy"
              @click="backToExplain"
              >{{ t('account.verification.changeEmail') }}</Button
            >
            <Button
              type="submit"
              data-testid="account-verification-verify"
              :disabled="busy || code.length !== 6"
              >{{ busy ? t('account.verification.verifying') : t('account.verification.verify') }}</Button
            >
          </div>
        </div>
      </form>

      <div v-else class="space-y-4" data-testid="account-verification-expired">
        <p role="alert" class="text-sm text-destructive">
          {{ t('account.verification.expired') }}
        </p>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="account-verification-cancel"
            :disabled="busy"
            @click="open = false"
            >{{ t('common.cancel') }}</Button
          >
          <Button
            type="button"
            data-testid="account-verification-resend"
            :disabled="busy"
            @click="sendCode"
            >{{ t('account.verification.sendNewCode') }}</Button
          >
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
