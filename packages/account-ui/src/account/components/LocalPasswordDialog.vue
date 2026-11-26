<script setup lang="ts">
import { inject, ref, watch } from 'vue';
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
import { ProfileAccessChannels } from '@memoflow/desktop-contracts';
import { toast } from 'vue-sonner';
import { accountUiHost } from '../../account-ui-host';

const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const desktopBridge = inject(accountUiHost.DESKTOP_BRIDGE_KEY, null);
const localCurrentPassword = ref('');
const localPassword = ref('');
const localPasswordConfirmation = ref('');
const localPasswordBusy = ref(false);
watch(open, () => {
  localCurrentPassword.value = '';
  localPassword.value = '';
  localPasswordConfirmation.value = '';
});
async function changeLocalPassword(): Promise<void> {
  if (!desktopBridge || localPasswordBusy.value) return;
  if (localPassword.value.length < 8) {
    toast.error(t('account.localPassword.tooShort'));
    return;
  }
  if (localPassword.value !== localPasswordConfirmation.value) {
    toast.error(t('account.localPassword.mismatch'));
    return;
  }
  localPasswordBusy.value = true;
  try {
    const result = (await desktopBridge.invoke(ProfileAccessChannels.PASSWORD_SET, {
      currentPassword: localCurrentPassword.value,
      newPassword: localPassword.value,
    })) as { ok?: boolean; error?: { message?: string } };
    if (!result.ok) {
      toast.error(result.error?.message ?? t('account.localPassword.failed'));
      return;
    }
    localCurrentPassword.value = '';
    localPassword.value = '';
    localPasswordConfirmation.value = '';
    open.value = false;
    toast.success(t('account.localPassword.saved'));
  } catch {
    toast.error(t('account.localPassword.failed'));
  } finally {
    localPasswordBusy.value = false;
  }
}
</script>
<template>
  <Dialog
    :open="open"
    @update:open="
      (value) => {
        if (!localPasswordBusy) open = value;
      }
    "
  >
    <DialogContent data-testid="account-local-password-dialog" @interact-outside.prevent>
      <DialogTitle>{{ t('account.localPassword.title') }}</DialogTitle>
      <DialogDescription>{{ t('account.localPassword.description') }}</DialogDescription>
      <form
        class="space-y-4"
        data-testid="account-local-password"
        @submit.prevent="changeLocalPassword"
      >
        <div class="space-y-2 sm:col-span-2">
          <Label for="local-current-password">{{ t('account.password.currentPassword') }}</Label>
          <Input
            id="local-current-password"
            v-model="localCurrentPassword"
            data-testid="account-local-password-current"
            :disabled="localPasswordBusy"
            type="password"
            autocomplete="current-password"
          />
          <p class="text-xs text-muted-foreground">
            {{ t('account.localPassword.rememberReset') }}
          </p>
        </div>
        <div class="space-y-2">
          <Label for="local-profile-password">{{ t('account.localPassword.newPassword') }}</Label>
          <Input
            id="local-profile-password"
            v-model="localPassword"
            data-testid="account-local-password-new"
            :disabled="localPasswordBusy"
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
            :disabled="localPasswordBusy"
            type="password"
            autocomplete="new-password"
            :placeholder="t('account.localPassword.confirmPassword')"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            data-testid="account-local-password-cancel"
            variant="outline"
            :disabled="localPasswordBusy"
            @click="open = false"
            >{{ t('common.cancel') }}</Button
          >
          <Button
            type="submit"
            data-testid="account-local-password-save"
            :disabled="localPasswordBusy || !localPassword"
          >
            {{ t('account.localPassword.save') }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
