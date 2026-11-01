<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Avatar, AvatarFallback, Button, Checkbox, Input } from '@memoflow/ui-vue-shadcn';
import { Cloud, UserPlus } from '@lucide/vue';
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
  selectProfile,
  submitPassword,
  refreshProfiles,
} = presenter;
/**
 * The "+" tile opens two entries: a new local account, or the cloud sign-in
 * relay. The relay has no window of its own in this segment, so it explains
 * the only path the main process allows today (enter with a local account
 * first) and, when one exists, enters with it in one click.
 */
const addPanel = ref<'none' | 'menu' | 'create' | 'cloud'>('none');
const recentLocalAccount = computed(
  () => profiles.value.find((profile) => profile.profileKind === 'local') ?? null,
);
const passwordInitials = computed(() => {
  const name = passwordTarget.value?.displayName ?? '';
  return name.trim().slice(0, 2).toUpperCase() || 'MF';
});
const vFocusPassword = { mounted: (element: HTMLElement) => element.focus() };

function openAddMenu(): void {
  addPanel.value = 'menu';
}

function openCreateState(): void {
  newName.value = '';
  newPassword.value = '';
  newPasswordConfirm.value = '';
  addPanel.value = 'create';
}

function openCloudEntry(): void {
  addPanel.value = 'cloud';
}

async function submitCreate(): Promise<void> {
  await createLocalAccount();
  // The composable clears the nickname only when the account was created.
  if (!newName.value) addPanel.value = 'none';
}

async function continueToCloud(): Promise<void> {
  const account = recentLocalAccount.value;
  if (!account) {
    openCreateState();
    return;
  }
  addPanel.value = 'none';
  await selectProfile(account);
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
  <main class="flex h-full w-full items-center justify-center text-foreground">
    <section
      v-if="accessView === 'select' || !passwordTarget"
      class="flex w-full max-w-xl flex-col items-center gap-6"
      data-testid="desktop-profile-access"
    >
      <h1 class="text-sm font-medium tracking-[0.02em] text-foreground/85">
        {{ t('auth.profileAccess.selectTitle') }}
      </h1>

      <DesktopProfileList :presenter="presenter" @add="openAddMenu" />

      <div
        v-if="addPanel === 'menu'"
        class="w-full max-w-xs rounded-2xl border border-white/10 bg-black/45 p-1.5 backdrop-blur"
        data-testid="desktop-profile-add-menu"
      >
        <Button
          variant="ghost"
          class="w-full justify-start gap-2"
          data-testid="desktop-profile-add-local"
          @click="openCreateState"
        >
          <UserPlus class="h-4 w-4" aria-hidden="true" />
          {{ t('auth.profileAccess.create') }}
        </Button>
        <Button
          variant="ghost"
          class="w-full justify-start gap-2"
          data-testid="desktop-profile-add-cloud"
          @click="openCloudEntry"
        >
          <Cloud class="h-4 w-4" aria-hidden="true" />
          {{ t('auth.profileAccess.cloudSignIn') }}
        </Button>
      </div>

      <form
        v-if="addPanel === 'create'"
        class="grid w-full max-w-xs gap-2 rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur"
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
          <Button type="button" variant="ghost" @click="addPanel = 'none'">{{
            t('common.cancel')
          }}</Button>
          <Button
            type="submit"
            class="bg-linear-to-r from-brand-gold-from via-brand-gold-via to-brand-gold-to text-brand-gold-foreground hover:brightness-105"
            :disabled="busyProfileId !== null"
            >{{ t('auth.profileAccess.create') }}</Button
          >
        </div>
      </form>

      <div
        v-if="addPanel === 'cloud'"
        class="w-full max-w-xs space-y-3 rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur"
        data-testid="desktop-profile-cloud-entry"
      >
        <p class="text-xs leading-relaxed text-foreground/70">
          {{
            recentLocalAccount
              ? t('auth.profileAccess.cloudGuidance')
              : t('auth.profileAccess.cloudNeedsLocal')
          }}
        </p>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" @click="addPanel = 'none'">{{
            t('common.cancel')
          }}</Button>
          <Button
            type="button"
            class="bg-linear-to-r from-brand-gold-from via-brand-gold-via to-brand-gold-to text-brand-gold-foreground hover:brightness-105"
            data-testid="desktop-profile-cloud-continue"
            :disabled="busyProfileId !== null"
            @click="continueToCloud"
            >{{
              recentLocalAccount
                ? t('auth.profileAccess.cloudContinue', { name: recentLocalAccount.displayName })
                : t('auth.profileAccess.create')
            }}</Button
          >
        </div>
      </div>
    </section>

    <section
      v-else
      class="flex w-full max-w-xs flex-col items-center gap-4"
      data-testid="desktop-profile-password-state"
    >
      <Avatar size="base" class="border border-white/15 bg-white/5">
        <AvatarFallback class="font-semibold text-foreground/80">{{
          passwordInitials
        }}</AvatarFallback>
      </Avatar>
      <p class="w-full truncate text-center text-sm font-medium text-foreground/90">
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
        <label class="flex w-fit items-center gap-2 text-xs text-foreground/65">
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
            class="flex-1 bg-linear-to-r from-brand-gold-from via-brand-gold-via to-brand-gold-to text-brand-gold-foreground hover:brightness-105"
            data-testid="desktop-profile-enter"
            :disabled="!password || busyProfileId !== null"
            >{{ t('auth.profileAccess.enter') }}</Button
          >
        </div>
      </form>
    </section>
  </main>
</template>
