<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AccountSecuritySession } from '@memoflow/cloud-auth-contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import { ArrowLeft, ChevronRight, Monitor } from '@lucide/vue';
import { CLOUD_ACCOUNT_SECURITY_KEY, accountUiHost } from '../../account-ui-host';
import { parseSessionUserAgent } from '../lib/session-device';
import { useAccountSignOut } from '../composables/useAccountSignOut';
import AccountEmailVerificationDialog from './AccountEmailVerificationDialog.vue';

const page = defineModel<'overview' | 'devices'>('page', { default: 'overview' });
const props = defineProps<{ email: string | null }>();
const { t } = useI18n();
const service = inject(CLOUD_ACCOUNT_SECURITY_KEY, null);
const { SettingsSection } = accountUiHost.components;
const { isDesktopSignOut, executeSignOut } = useAccountSignOut();
const maskedEmail = computed(() => props.email?.replace(/^(.).*(@.*)$/, '$1***$2') ?? '—');
const emailOpen = ref(false);
const emailVerificationOpen = ref(false);
const emailVerificationToken = ref('');
const emailStage = ref<'password' | 'email' | 'sent'>('password');
const password = ref('');
const newEmail = ref('');
const deleteOpen = ref(false);
const deletePassword = ref('');
const confirmation = ref('');
const sessions = ref<AccountSecuritySession[]>([]);
const sessionsLoaded = ref(false);
const busy = ref(false);
const error = ref('');

/** Friendly device title; the raw User-Agent is never shown as the label. */
function sessionDeviceLabel(userAgent: string | null): string {
  const { client, os } = parseSessionUserAgent(userAgent);
  if (client === 'unknown') return t('account.security.unknownDevice');
  const clientLabel = t(`account.security.deviceClient.${client}`);
  if (os === 'unknown') return clientLabel;
  return `${clientLabel} · ${t(`account.security.deviceOs.${os}`)}`;
}

async function run(operation: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  try {
    await operation();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('common.operationFailed');
  } finally {
    busy.value = false;
  }
}
async function loadSessions() {
  if (!service) return;
  const result = await service.listAccountSessions();
  if (!result.ok) {
    // Only a successful load may render the list or a zero-session state; a
    // failed refresh must leave just the error and the retry action.
    sessionsLoaded.value = false;
    throw new Error(result.error.message);
  }
  sessions.value = result.data;
  sessionsLoaded.value = true;
}
async function submitEmail() {
  if (!service) return;
  await run(async () => {
    const result =
      emailStage.value === 'password'
        ? await service.verifyAccountPassword(password.value)
        : await service.requestEmailChange({
            password: password.value,
            newEmail: newEmail.value,
            verificationToken: emailVerificationToken.value,
          });
    if (!result.ok) throw new Error(result.error.message);
    if (emailStage.value === 'password') emailStage.value = 'email';
    else {
      emailStage.value = 'sent';
      password.value = '';
    }
  });
}
async function revoke(sessionId: string) {
  if (!service) return;
  const confirmed = await useConfirm({
    title: t('account.security.revokeConfirmTitle'),
    description: t('account.security.revokeConfirmDescription'),
    confirmText: t('account.security.revokeConfirmText'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  await run(async () => {
    const result = await service.revokeAccountSession(sessionId);
    if (!result.ok) throw new Error(result.error.message);
    await loadSessions();
  });
}
async function deleteAccount() {
  if (!service || confirmation.value !== 'DELETE') return;
  await run(async () => {
    const result = await service.deleteAccountPermanently({
      password: deletePassword.value,
      confirmation: 'DELETE',
    });
    if (!result.ok) throw new Error(result.error.message);
    deletePassword.value = '';
    if (!isDesktopSignOut.value) await executeSignOut();
  });
}
watch(emailOpen, (open) => {
  password.value = '';
  newEmail.value = '';
  emailStage.value = 'password';
  error.value = '';
  if (!open) emailVerificationToken.value = '';
});
watch(deleteOpen, () => {
  deletePassword.value = '';
  confirmation.value = '';
  error.value = '';
});
watch(page, async (value) => {
  if (value === 'devices') {
    await nextTick();
    devicesHeading.value?.focus();
    if (!sessionsLoaded.value && !busy.value && service) void run(loadSessions);
  } else {
    await nextTick();
    devicesTrigger.value?.$el.focus();
  }
});
const devicesHeading = ref<HTMLElement | null>(null);
const devicesTrigger = ref<{ $el: HTMLButtonElement } | null>(null);
onMounted(() => {
  if (service) void run(loadSessions);
});
</script>

<template>
  <div class="space-y-8" data-testid="cloud-account-security">
    <template v-if="page === 'overview'">
      <SettingsSection
        :title="t('account.settings.information')"
        class="[&_h2]:text-xl"
        test-id="account-information-section"
      >
        <slot name="profile" />
        <div v-if="service" class="flex flex-wrap items-center justify-between gap-4 py-4">
          <span class="text-sm font-medium">{{ t('account.password.resetEmail') }}</span>
          <div class="flex items-center gap-4">
            <span data-testid="account-login-email" class="text-sm text-muted-foreground">{{
              maskedEmail
            }}</span>
            <Button
              data-testid="account-change-email"
              variant="secondary"
              @click="emailVerificationOpen = true"
              >{{ t('account.security.changeEmail') }}</Button
            >
          </div>
        </div>
      </SettingsSection>
      <SettingsSection
        v-if="$slots.password || service"
        :title="t('account.settings.security')"
        class="[&_h2]:text-xl"
        test-id="account-password-security-section"
      >
        <slot name="password" />
        <Button
          variant="ghost"
          v-if="service"
          type="button"
          class="flex h-auto w-full items-center justify-between gap-4 whitespace-normal rounded-md py-4 text-left text-sm font-normal hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ref="devicesTrigger"
          data-testid="account-devices-open"
          @click="page = 'devices'"
        >
          <span class="font-medium">{{ t('account.security.sessions') }}</span>
          <span class="flex items-center gap-3 text-muted-foreground">
            <span v-if="sessionsLoaded">{{
              t('account.settings.deviceCount', { count: sessions.length })
            }}</span>
            <ChevronRight class="size-4" aria-hidden="true" />
          </span>
        </Button>
      </SettingsSection>
      <slot name="preferences" />
      <slot name="connections" />
      <div class="space-y-6 border-t border-border pt-6">
        <SettingsSection
          v-if="service"
          :title="t('account.security.deleteTitle')"
          :description="t('account.security.deleteDescription')"
          test-id="account-delete-section"
        >
          <template #actions
            ><Button
              variant="destructive"
              data-testid="account-delete-open"
              @click="deleteOpen = true"
              >{{ t('account.security.deleteTitle') }}</Button
            ></template
          >
        </SettingsSection>
        <slot name="actions" />
      </div>
    </template>
    <section v-else data-testid="account-devices-page" class="space-y-8">
      <Button
        variant="ghost"
        class="gap-2"
        data-testid="account-devices-back"
        @click="page = 'overview'"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />{{ t('account.settings.backToAccount') }}
      </Button>
      <header class="space-y-2">
        <h2
          ref="devicesHeading"
          tabindex="-1"
          class="text-2xl font-semibold tracking-tight outline-none"
          data-testid="account-devices-heading"
        >
          {{ t('account.security.sessions') }}
        </h2>
        <p class="text-sm leading-6 text-muted-foreground">
          {{ t('account.security.sessionsDescription') }}
        </p>
      </header>
      <div class="flex items-center justify-end gap-4">
        <p v-if="error" role="alert" class="mr-auto text-sm text-destructive">{{ error }}</p>
        <span v-else-if="busy" role="status" class="text-sm text-muted-foreground">{{
          t('account.sessions.loading')
        }}</span>
        <Button variant="outline" :disabled="busy" @click="run(loadSessions)">{{
          t('common.refresh')
        }}</Button>
      </div>
      <p
        v-if="sessionsLoaded && !sessions.length"
        data-testid="account-sessions-empty"
        class="text-sm text-muted-foreground"
      >
        {{ t('account.security.noSessions') }}
      </p>
      <div
        v-if="sessionsLoaded && sessions.length"
        data-testid="account-sessions"
        class="space-y-8"
      >
        <section v-for="group in [true, false]" :key="String(group)" class="space-y-3">
          <h3
            v-if="sessions.some((session) => session.current === group)"
            class="text-sm font-medium text-muted-foreground"
          >
            {{ group ? t('account.security.currentDevice') : t('account.settings.otherDevices') }}
          </h3>
          <ul class="divide-y divide-border">
            <li
              v-for="session in sessions.filter((session) => session.current === group)"
              :key="session.id"
              class="flex items-center gap-4 py-4"
            >
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Monitor class="size-5" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1 space-y-1 text-sm">
                <p class="break-words font-medium" data-testid="account-session-device">
                  {{ sessionDeviceLabel(session.userAgent) }}
                </p>
                <p class="break-words text-muted-foreground">
                  {{ session.ipAddress || '—' }} ·
                  {{ accountUiHost.formatProductDateTime(session.createdAt) }}
                </p>
              </div>
              <Button
                v-if="!session.current"
                variant="outline"
                :disabled="busy"
                data-testid="account-session-revoke"
                @click="revoke(session.id)"
                >{{ t('account.security.revoke') }}</Button
              >
            </li>
          </ul>
        </section>
      </div>
    </section>
    <Dialog
      :open="emailOpen"
      @update:open="
        (open) => {
          if (!busy) emailOpen = open;
        }
      "
    >
      <DialogContent data-testid="account-email-dialog" @interact-outside.prevent>
        <DialogTitle>{{ t('account.security.changeEmail') }}</DialogTitle>
        <DialogDescription>{{ t('account.security.emailDescription') }}</DialogDescription>
        <form v-if="emailStage !== 'sent'" class="space-y-4" @submit.prevent="submitEmail">
          <div v-if="emailStage === 'password'" class="space-y-2">
            <Label for="email-current-password">{{ t('account.password.currentPassword') }}</Label
            ><Input
              id="email-current-password"
              v-model="password"
              data-testid="account-email-password"
              type="password"
              autocomplete="current-password"
              required
              maxlength="100"
            />
          </div>
          <div v-else class="space-y-2">
            <Label for="account-new-email">{{ t('account.security.newEmail') }}</Label
            ><Input
              id="account-new-email"
              v-model="newEmail"
              data-testid="account-email-new"
              type="email"
              autocomplete="email"
              required
            />
          </div>
          <p v-if="error" role="alert" data-testid="account-security-error">{{ error }}</p>
          <Button type="submit" :disabled="busy" data-testid="account-email-submit">{{
            emailStage === 'password'
              ? t('account.security.continue')
              : t('account.security.sendConfirmation')
          }}</Button>
        </form>
        <p v-else data-testid="account-email-sent">{{ t('account.security.emailSent') }}</p>
      </DialogContent>
    </Dialog>
    <AccountEmailVerificationDialog
      v-model:open="emailVerificationOpen"
      purpose="change-email"
      :email="props.email"
      @verified="
        (token) => {
          emailVerificationToken = token;
          emailOpen = true;
        }
      "
    />
    <Dialog
      :open="deleteOpen"
      @update:open="
        (open) => {
          if (!busy) deleteOpen = open;
        }
      "
    >
      <DialogContent data-testid="account-delete-dialog" @interact-outside.prevent>
        <DialogTitle>{{ t('account.security.deleteTitle') }}</DialogTitle>
        <DialogDescription>{{ t('account.security.deleteDescription') }}</DialogDescription>
        <form class="space-y-4" @submit.prevent="deleteAccount">
          <div class="space-y-2">
            <Label for="delete-cloud-password">{{ t('account.password.currentPassword') }}</Label
            ><Input
              id="delete-cloud-password"
              v-model="deletePassword"
              data-testid="account-delete-password"
              type="password"
              autocomplete="current-password"
              required
              maxlength="100"
            />
          </div>
          <div class="space-y-2">
            <Label for="delete-confirmation">{{ t('account.security.confirmation') }}</Label
            ><Input
              id="delete-confirmation"
              v-model="confirmation"
              data-testid="account-delete-confirmation"
              autocomplete="off"
              required
            />
          </div>
          <p v-if="error" role="alert">{{ error }}</p>
          <Button
            type="submit"
            variant="destructive"
            data-testid="account-delete-submit"
            :disabled="busy || confirmation !== 'DELETE' || !deletePassword"
            >{{ t('account.security.deleteTitle') }}</Button
          >
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
