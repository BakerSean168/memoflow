<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  Input,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
} from '@memoflow/ui-vue-shadcn';
import { ArrowLeft } from '@lucide/vue';
import {
  useDesktopProfiles,
  type DesktopRegisterMode,
} from '../shared/composables/useDesktopProfiles';
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
  loginEmail,
  loginPassword,
  loginRemember,
  signInBusy,
  githubPending,
  githubUserCode,
  registerMode,
  registerEmail,
  registerName,
  registerPassword,
  registerPasswordConfirm,
  registerBusy,
  enterLoginState,
  enterRegisterState,
  enterPasswordState,
  backToSelect,
  submitPassword,
  signInWithPassword,
  signInWithGithub,
  cancelGithubSignIn,
  forgotPassword,
  submitCloudRegistration,
  submitLocalRegistration,
  refreshProfiles,
  setAccessWindowHeight,
  disposeAuth,
} = presenter;

const passwordInitials = computed(() => {
  const name = passwordTarget.value?.displayName ?? '';
  return name.trim().slice(0, 2).toUpperCase() || 'MF';
});
const vFocusPassword = { mounted: (element: HTMLElement) => element.focus() };
const vFocusLogin = { mounted: (element: HTMLElement) => element.focus() };
const registerModes: readonly DesktopRegisterMode[] = ['cloud', 'local'];

function switchRegisterMode(value: unknown): void {
  if (value === 'cloud' || value === 'local') registerMode.value = value;
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

onBeforeUnmount(disposeAuth);

// Only the registration state is taller (1024×780); every other state keeps the
// 1024×640 skeleton.
watch(
  accessView,
  (view) => {
    void setAccessWindowHeight(view === 'register' ? 780 : 640);
  },
  { immediate: true },
);
</script>

<template>
  <main class="flex h-full w-full items-center justify-center text-foreground">
    <!-- 选择账号 -->
    <section
      v-if="accessView === 'select'"
      class="flex w-full max-w-xl flex-col items-center gap-6"
      data-testid="desktop-profile-access"
    >
      <h1 class="text-sm font-medium tracking-[0.02em] text-foreground/85">
        {{ t('auth.profileAccess.selectTitle') }}
      </h1>

      <DesktopProfileList :presenter="presenter" @add="enterLoginState" />
    </section>

    <!-- 登录 -->
    <section
      v-else-if="accessView === 'login'"
      class="flex w-full max-w-xs flex-col gap-5"
      data-testid="desktop-profile-login-state"
    >
      <h1 class="text-center text-sm font-medium tracking-[0.02em] text-foreground/85">
        {{ t('auth.profileAccess.signInTitle') }}
      </h1>

      <form
        class="space-y-3"
        data-testid="desktop-profile-login-form"
        @submit.prevent="signInWithPassword"
      >
        <Input
          v-focus-login
          v-model="loginEmail"
          type="email"
          autocomplete="username"
          :aria-label="t('auth.field.email')"
          :placeholder="t('auth.field.email')"
          data-testid="desktop-profile-login-email"
        />
        <Input
          v-model="loginPassword"
          type="password"
          autocomplete="current-password"
          :aria-label="t('auth.field.password')"
          :placeholder="t('auth.field.password')"
          data-testid="desktop-profile-login-password"
        />

        <div class="flex items-center justify-between">
          <label class="flex w-fit items-center gap-2 text-xs text-foreground/65">
            <Checkbox
              v-model="loginRemember"
              class="border-white/25 data-[state=checked]:border-brand-gold-via data-[state=checked]:bg-brand-gold-via data-[state=checked]:text-brand-gold-foreground"
              :aria-label="t('auth.profileAccess.rememberMe')"
              data-testid="desktop-profile-login-remember"
            />
            {{ t('auth.profileAccess.rememberMe') }}
          </label>
          <button
            type="button"
            class="text-xs text-foreground/60 transition-colors hover:text-foreground/90"
            data-testid="desktop-profile-forgot-password"
            @click="forgotPassword"
          >
            {{ t('auth.profileAccess.forgotPassword') }}
          </button>
        </div>

        <Button
          type="submit"
          class="w-full bg-linear-to-r from-brand-gold-from via-brand-gold-via to-brand-gold-to text-brand-gold-foreground hover:brightness-105"
          data-testid="desktop-profile-login-submit"
          :disabled="signInBusy || !loginEmail || !loginPassword"
          >{{ t('auth.profileAccess.signInAction') }}</Button
        >
      </form>

      <Separator class="bg-white/10" />

      <div
        v-if="githubPending"
        class="space-y-2 text-center"
        data-testid="desktop-profile-github-waiting"
      >
        <p class="text-xs leading-relaxed text-foreground/70">
          {{ t('auth.profileAccess.githubWaiting') }}
        </p>
        <p v-if="githubUserCode" class="font-mono text-sm tracking-[0.2em] text-foreground/90">
          {{ githubUserCode }}
        </p>
        <Button
          type="button"
          variant="ghost"
          class="w-full"
          data-testid="desktop-profile-github-cancel"
          @click="cancelGithubSignIn"
          >{{ t('common.cancel') }}</Button
        >
      </div>
      <Button
        v-else
        type="button"
        variant="outline"
        class="flex w-full items-center justify-center gap-2 border-white/15 bg-white/5 text-foreground/90 hover:bg-white/10"
        data-testid="desktop-profile-github-signin"
        :disabled="signInBusy"
        @click="signInWithGithub"
      >
        <!-- Lucide 1.x dropped brand glyphs; the GitHub mark is inlined here. -->
        <svg
          class="h-4 w-4"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
        {{ t('auth.profileAccess.githubSignIn') }}
      </Button>

      <div class="flex items-center justify-between text-xs text-foreground/60">
        <button
          type="button"
          class="flex items-center gap-1 transition-colors hover:text-foreground/90"
          data-testid="desktop-profile-back-to-select"
          @click="backToSelect"
        >
          <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
          {{ t('auth.profileAccess.backToSelect') }}
        </button>
        <button
          type="button"
          class="transition-colors hover:text-foreground/90"
          data-testid="desktop-profile-go-register"
          @click="enterRegisterState('cloud')"
        >
          {{ t('auth.profileAccess.noAccount') }}
          <span class="text-brand-gold-via">{{ t('auth.profileAccess.registerAction') }}</span>
        </button>
      </div>
    </section>

    <!-- 注册 -->
    <section
      v-else-if="accessView === 'register'"
      class="flex w-full max-w-xs flex-col gap-5"
      data-testid="desktop-profile-register-state"
    >
      <h1 class="text-center text-sm font-medium tracking-[0.02em] text-foreground/85">
        {{ t('auth.profileAccess.registerTitle') }}
      </h1>

      <ToggleGroup
        type="single"
        :model-value="registerMode"
        class="grid w-full grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/35 p-1"
        data-testid="desktop-profile-register-mode"
        @update:model-value="switchRegisterMode"
      >
        <ToggleGroupItem
          v-for="mode in registerModes"
          :key="mode"
          :value="mode"
          class="rounded-lg text-xs data-[state=on]:bg-white/10 data-[state=on]:text-foreground"
          :data-testid="`desktop-profile-register-mode-${mode}`"
          >{{ t(`auth.profileAccess.registerMode.${mode}`) }}</ToggleGroupItem
        >
      </ToggleGroup>

      <form
        v-if="registerMode === 'cloud'"
        class="space-y-3"
        data-testid="desktop-profile-register-cloud-form"
        @submit.prevent="submitCloudRegistration"
      >
        <Input
          v-model="registerEmail"
          type="email"
          autocomplete="username"
          :aria-label="t('auth.field.email')"
          :placeholder="t('auth.field.email')"
          data-testid="desktop-profile-register-email"
        />
        <Input
          v-model="registerPassword"
          type="password"
          autocomplete="new-password"
          :aria-label="t('auth.field.password')"
          :placeholder="t('auth.field.password')"
          data-testid="desktop-profile-register-password"
        />
        <Input
          v-model="registerPasswordConfirm"
          type="password"
          autocomplete="new-password"
          :aria-label="t('auth.field.confirmPassword')"
          :placeholder="t('auth.field.confirmPassword')"
          data-testid="desktop-profile-register-confirm"
        />
        <Button
          type="submit"
          class="w-full bg-linear-to-r from-brand-gold-from via-brand-gold-via to-brand-gold-to text-brand-gold-foreground hover:brightness-105"
          data-testid="desktop-profile-register-submit"
          :disabled="registerBusy"
          >{{ t('auth.profileAccess.registerAction') }}</Button
        >
      </form>

      <form
        v-else
        class="space-y-3"
        data-testid="desktop-profile-register-local-form"
        @submit.prevent="submitLocalRegistration"
      >
        <Input
          v-model="registerName"
          maxlength="80"
          :aria-label="t('auth.field.name')"
          :placeholder="t('auth.field.name')"
          data-testid="desktop-profile-register-name"
        />
        <Input
          v-model="registerPassword"
          type="password"
          autocomplete="new-password"
          :aria-label="t('auth.field.password')"
          :placeholder="t('auth.field.password')"
          data-testid="desktop-profile-register-password"
        />
        <Input
          v-model="registerPasswordConfirm"
          type="password"
          autocomplete="new-password"
          :aria-label="t('auth.field.confirmPassword')"
          :placeholder="t('auth.field.confirmPassword')"
          data-testid="desktop-profile-register-confirm"
        />
        <Button
          type="submit"
          class="w-full bg-linear-to-r from-brand-gold-from via-brand-gold-via to-brand-gold-to text-brand-gold-foreground hover:brightness-105"
          data-testid="desktop-profile-register-submit"
          :disabled="registerBusy"
          >{{ t('auth.profileAccess.registerAction') }}</Button
        >
      </form>

      <div class="flex items-center justify-between text-xs text-foreground/60">
        <button
          type="button"
          class="flex items-center gap-1 transition-colors hover:text-foreground/90"
          data-testid="desktop-profile-back-to-select"
          @click="backToSelect"
        >
          <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
          {{ t('auth.profileAccess.backToSelect') }}
        </button>
        <button
          type="button"
          class="transition-colors hover:text-foreground/90"
          data-testid="desktop-profile-go-login"
          @click="enterLoginState"
        >
          {{ t('auth.profileAccess.haveAccount') }}
          <span class="text-brand-gold-via">{{ t('auth.profileAccess.signInAction') }}</span>
        </button>
      </div>
    </section>

    <!-- 本地账户密码态 -->
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
        {{ passwordTarget?.displayName }}
      </p>
      <form class="w-full space-y-3" @submit.prevent="submitPassword">
        <Input
          v-focus-password
          v-model="password"
          :data-testid="`desktop-profile-password-${passwordTarget?.profileId}`"
          type="password"
          autocomplete="current-password"
          :placeholder="t('auth.profileAccess.password')"
          autofocus
        />
        <label class="flex w-fit items-center gap-2 text-xs text-foreground/65">
          <Checkbox
            v-model="remember"
            class="border-white/25 data-[state=checked]:border-brand-gold-via data-[state=checked]:bg-brand-gold-via data-[state=checked]:text-brand-gold-foreground"
            :aria-label="t('auth.profileAccess.rememberMe')"
            data-testid="desktop-profile-remember"
          />
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
