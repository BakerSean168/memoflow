<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Avatar, AvatarFallback, Button, Checkbox, Input } from '@memoflow/ui-vue-shadcn';
import { useDesktopProfiles } from '../shared/composables/useDesktopProfiles';
import DesktopProfileList from '../shared/components/DesktopProfileList.vue';

const { t } = useI18n();
const presenter = useDesktopProfiles({ accessWindow: true });
const {
  profiles,
  busyProfileId,
  accessView,
  passwordTarget,
  password,
  remember,
  newName,
  newPassword,
  newPasswordConfirm,
  createLocalAccount,
  enterPasswordState,
  backToSelect,
  submitPassword,
  refreshProfiles,
} = presenter;
const creatingLocalAccount = ref(false);
const passwordInitials = computed(() => {
  const name = passwordTarget.value?.displayName ?? '';
  return name.trim().slice(0, 2).toUpperCase() || 'MF';
});
const vFocusPassword = { mounted: (element: HTMLElement) => element.focus() };

function openCreateState(): void {
  newName.value = '';
  newPassword.value = '';
  newPasswordConfirm.value = '';
  creatingLocalAccount.value = true;
}

async function submitCreate(): Promise<void> {
  await createLocalAccount();
  // The composable clears the nickname only when the account was created.
  if (!newName.value) creatingLocalAccount.value = false;
}

onMounted(async () => {
  await refreshProfiles();
  const query = window.location.hash.split('?')[1];
  const targetId = new URLSearchParams(query).get('profileId');
  const target = profiles.value.find((profile) => profile.profileId === targetId);
  // A host-supplied target arrives preselected, never opened: only a target that
  // actually has a password has a state to show.
  if (target?.hasCredential) enterPasswordState(target);
});
</script>

<template>
  <main
    class="flex min-h-screen w-full items-center justify-center bg-background px-4 py-6 text-foreground"
  >
    <div
      v-if="accessView === 'select'"
      class="flex w-full max-w-sm flex-col items-center gap-4"
      data-testid="desktop-profile-access"
    >
      <DesktopProfileList :presenter="presenter" @add="openCreateState" />

      <form
        v-if="creatingLocalAccount"
        class="grid w-full gap-2 rounded-xl border bg-card p-3"
        data-testid="desktop-profile-create-form"
        @submit.prevent="submitCreate"
      >
        <Input
          v-model="newName"
          maxlength="80"
          :aria-label="t('auth.profileAccess.name')"
          :placeholder="t('auth.profileAccess.name')"
        />
        <Input
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          :aria-label="t('auth.profileAccess.password')"
          :placeholder="t('auth.profileAccess.password')"
        />
        <Input
          v-model="newPasswordConfirm"
          type="password"
          autocomplete="new-password"
          :aria-label="t('auth.field.confirmPassword')"
          :placeholder="t('auth.field.confirmPassword')"
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="creatingLocalAccount = false">{{
            t('common.cancel')
          }}</Button>
          <Button type="submit" :disabled="busyProfileId !== null">{{
            t('auth.profileAccess.create')
          }}</Button>
        </div>
      </form>
    </div>

    <section
      v-else-if="passwordTarget"
      class="flex w-full max-w-sm flex-col items-center gap-4"
      data-testid="desktop-profile-password-state"
    >
      <Avatar size="base" class="border bg-muted/60">
        <AvatarFallback class="font-semibold text-muted-foreground">{{
          passwordInitials
        }}</AvatarFallback>
      </Avatar>
      <p class="w-full truncate text-center text-sm font-medium">
        {{ passwordTarget.displayName }}
      </p>
      <form class="w-full space-y-3" @submit.prevent="submitPassword">
        <Input
          v-focus-password
          v-model="password"
          :data-testid="`desktop-profile-password-${passwordTarget.profileId}`"
          type="password"
          autocomplete="current-password"
          :placeholder="t('auth.profileAccess.password')"
          autofocus
        />
        <label class="flex w-fit items-center gap-2 text-xs text-muted-foreground">
          <Checkbox v-model="remember" data-testid="desktop-profile-remember" />
          {{ t('auth.profileAccess.rememberMe') }}
        </label>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            class="flex-1"
            data-testid="desktop-profile-back"
            @click="backToSelect"
            >{{ t('common.back') }}</Button
          >
          <Button
            type="submit"
            class="flex-1"
            data-testid="desktop-profile-enter"
            :disabled="!password || busyProfileId !== null"
            >{{ t('auth.profileAccess.enter') }}</Button
          >
        </div>
      </form>
    </section>
  </main>
</template>
