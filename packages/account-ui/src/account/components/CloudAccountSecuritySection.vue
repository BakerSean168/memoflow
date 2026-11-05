<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AccountSecuritySession } from '@memoflow/cloud-auth-contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from '@memoflow/ui-vue-shadcn';
import { CLOUD_ACCOUNT_SECURITY_KEY, accountUiHost } from '../../account-ui-host';
import { useAccountSignOut } from '../composables/useAccountSignOut';

const props = defineProps<{ email: string | null }>();
const { t } = useI18n();
const service = inject(CLOUD_ACCOUNT_SECURITY_KEY, null);
const { SettingsDangerZone } = accountUiHost.components;
const { isDesktopSignOut, executeSignOut } = useAccountSignOut();
const maskedEmail = computed(() => props.email?.replace(/^(.).*(@.*)$/, '$1***$2') ?? '—');
const emailOpen = ref(false);
const emailStage = ref<'password' | 'email' | 'sent'>('password');
const password = ref('');
const newEmail = ref('');
const deleteOpen = ref(false);
const deletePassword = ref('');
const confirmation = ref('');
const sessions = ref<AccountSecuritySession[]>([]);
const busy = ref(false);
const error = ref('');

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
  if (!result.ok) throw new Error(result.error.message);
  sessions.value = result.data;
}
async function submitEmail() {
  if (!service) return;
  await run(async () => {
    const result =
      emailStage.value === 'password'
        ? await service.verifyAccountPassword(password.value)
        : await service.requestEmailChange({ password: password.value, newEmail: newEmail.value });
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
watch(emailOpen, () => {
  password.value = '';
  newEmail.value = '';
  emailStage.value = 'password';
  error.value = '';
});
watch(deleteOpen, () => {
  deletePassword.value = '';
  confirmation.value = '';
  error.value = '';
});
onMounted(() => {
  if (service) void run(loadSessions);
});
</script>

<template>
  <div v-if="service" class="space-y-6" data-testid="cloud-account-security">
    <Card>
      <CardHeader
        ><CardTitle>{{ t('account.security.title') }}</CardTitle
        ><CardDescription>{{ t('account.security.emailDescription') }}</CardDescription></CardHeader
      >
      <CardContent class="flex items-center justify-between gap-4">
        <span data-testid="account-login-email">{{ maskedEmail }}</span>
        <Button data-testid="account-change-email" variant="outline" @click="emailOpen = true">{{
          t('account.security.changeEmail')
        }}</Button>
      </CardContent>
    </Card>
    <Card>
      <CardHeader
        ><CardTitle>{{ t('account.security.sessions') }}</CardTitle
        ><CardDescription>{{
          t('account.security.sessionsDescription')
        }}</CardDescription></CardHeader
      >
      <CardContent class="space-y-3">
        <p v-if="error && !emailOpen && !deleteOpen" role="alert">{{ error }}</p>
        <Button variant="outline" :disabled="busy" @click="run(loadSessions)">{{
          t('common.refresh')
        }}</Button>
        <p v-if="!sessions.length && !busy">{{ t('account.security.noSessions') }}</p>
        <ul class="space-y-3" data-testid="account-sessions">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="flex items-center justify-between gap-4 rounded-md border p-3"
          >
            <div class="min-w-0 space-y-1 text-sm">
              <p class="break-words">
                {{ session.userAgent || t('account.security.unknownDevice') }}
              </p>
              <p class="text-muted-foreground">
                {{ session.ipAddress || '—' }} · {{ new Date(session.createdAt).toLocaleString() }}
              </p>
              <p v-if="session.current">{{ t('account.security.currentDevice') }}</p>
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
      </CardContent>
    </Card>
    <SettingsDangerZone
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
    </SettingsDangerZone>
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
