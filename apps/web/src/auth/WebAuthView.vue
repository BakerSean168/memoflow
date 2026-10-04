<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { APP_DISPLAY_NAME, logo128 } from '@memoflow/assets';
import { Button } from '@memoflow/ui-vue-shadcn/components/ui/button';
import { Input } from '@memoflow/ui-vue-shadcn/components/ui/input';
import { Label } from '@memoflow/ui-vue-shadcn/components/ui/label';
import { Loader2 } from '@lucide/vue';
import {
  usePassword,
  useAuthenticationStore,
} from '@memoflow/app-vue/modules/authentication';
import { loadWebAuthCapabilities } from './capabilities';
import { useWebAuth } from './useWebAuth';
import {
  applyAuthLocale,
  applyAuthTheme,
  normalizeLocale,
  readPresentationPreferenceState,
  writePresentationPreferenceState,
  type AuthLocale,
} from './presentation';
import {
  firstInvalidField,
  validateForgotPassword,
  validateLogin,
  validateRegistration,
  validateResetPassword,
  type ForgotField,
  type LoginField,
  type RegisterField,
  type ResetField,
  type ValidationErrors,
} from './validation';

type Scene = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

const { t, locale } = useI18n();
const initialPresentation = readPresentationPreferenceState();
const currentLocale = ref<AuthLocale>(initialPresentation.locale);
applyAuthTheme();
applyAuthLocale(currentLocale.value);
locale.value = currentLocale.value;

const query = new URLSearchParams(window.location.search);
const resetToken = query.get('token') ?? '';
function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/')) return '/';
  try {
    const resolved = new URL(value, window.location.origin);
    if (resolved.origin !== window.location.origin) return '/';
    if (resolved.pathname === '/auth' || resolved.pathname.startsWith('/auth/')) {
      return resolved.pathname === '/auth/device'
        ? `${resolved.pathname}${resolved.search}${resolved.hash}`
        : '/';
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}
const returnTo = normalizeReturnTo(query.get('returnTo') ?? query.get('redirect'));
const scene = ref<Scene>(
  query.get('scene') === 'reset' && resetToken
    ? 'reset'
    : query.get('scene') === 'verify-email'
      ? 'verify'
      : 'login',
);
const email = ref(query.get('email') ?? '');
const password = ref('');
const confirmPassword = ref('');
const name = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const action = ref<Scene | 'github' | null>(null);
const githubLoginAvailable = ref(false);

const loginErrors = reactive<ValidationErrors<LoginField>>({});
const registerErrors = reactive<ValidationErrors<RegisterField>>({});
const forgotErrors = reactive<ValidationErrors<ForgotField>>({});
const resetErrors = reactive<ValidationErrors<ResetField>>({});

const {
  loginByEmail,
  registerByEmail,
  startGithubLogin,
  isLoading,
  errorMessage,
  successMessage,
  pendingVerificationEmail,
  clearError,
  clearSuccessMessage,
} = useWebAuth();

// Forgot/reset-password go through the unified password mutation receipt path
// (usePassword + authentication store). Failures persist a structured, safe
// receipt (localized allowlist message + request id + retryability) that is
// restored from localStorage when the page is unmounted and remounted. The
// reset token itself is never persisted — a reset-password failure retries by
// re-issuing a fresh reset link.
const passwordActions = usePassword();
const authStore = useAuthenticationStore();
const receipt = computed(() => authStore.passwordMutationError);
const passwordLoading = computed(() => passwordActions.isLoading.value);
const localSuccessMessage = ref<string | null>(null);

onMounted(() => {
  void loadWebAuthCapabilities().then((capabilities) => {
    githubLoginAvailable.value = capabilities.github;
  });
});

const INPUT_CLASS =
  'h-10 rounded-md border-white/10 bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/25 focus-visible:border-blue-400/60 focus-visible:ring-1 focus-visible:ring-blue-400/40 aria-[invalid=true]:border-red-400/70';

const localeOptions = computed(() => [
  { value: 'zh-CN' as const, label: t('auth.page.locales.zhCN') },
  { value: 'en-US' as const, label: t('auth.page.locales.enUS') },
]);
const legalTermsHref = computed(() =>
  currentLocale.value === 'zh-CN' ? '/legal/terms.zh-CN.html' : '/legal/terms.en-US.html',
);
const legalPrivacyHref = computed(() =>
  currentLocale.value === 'zh-CN' ? '/legal/privacy.zh-CN.html' : '/legal/privacy.en-US.html',
);
const title = computed(() => ({
  login: t('auth.login.heading', { app: APP_DISPLAY_NAME }),
  register: t('auth.register.heading', { app: APP_DISPLAY_NAME }),
  forgot: t('auth.forgot.heading'),
  reset: t('auth.reset.heading'),
  verify: t('auth.verify.heading'),
})[scene.value]);
const description = computed(() => ({
  login: t('auth.page.description'),
  register: t('auth.register.description'),
  forgot: t('auth.forgot.description'),
  reset: t('auth.reset.description'),
  verify: t('auth.verify.description', {
    email: pendingVerificationEmail.value || email.value,
  }),
})[scene.value]);

function setLocale(next: AuthLocale) {
  const normalized = normalizeLocale(next);
  currentLocale.value = normalized;
  locale.value = normalized;
  applyAuthLocale(normalized);
  writePresentationPreferenceState({ locale: normalized });
}

function replaceErrors<T extends string>(
  target: ValidationErrors<T>,
  next: ValidationErrors<T>,
) {
  for (const key of Object.keys(target)) delete target[key as T];
  Object.assign(target, next);
}

function clearValidationErrors() {
  replaceErrors(loginErrors, {});
  replaceErrors(registerErrors, {});
  replaceErrors(forgotErrors, {});
  replaceErrors(resetErrors, {});
}

function switchScene(next: Scene, options?: { keepSuccess?: boolean }) {
  action.value = null;
  clearError();
  if (!options?.keepSuccess) {
    clearSuccessMessage();
    localSuccessMessage.value = null;
  }
  clearValidationErrors();
  scene.value = next;
}

async function focusField<T extends string>(field: T | null, ids: Record<T, string>) {
  if (!field) return;
  await nextTick();
  document.getElementById(ids[field])?.focus();
}

async function submitLogin() {
  const errors = validateLogin({ email: email.value, password: password.value });
  replaceErrors(loginErrors, errors);
  const invalid = firstInvalidField(errors, ['email', 'password']);
  if (invalid) return focusField(invalid, { email: 'email', password: 'password' });

  action.value = 'login';
  const outcome = await loginByEmail(
    { email: email.value.trim(), password: password.value },
    returnTo,
  );
  action.value = null;
  if (outcome === 'needs-email-verification') switchScene('verify', { keepSuccess: true });
}

async function submitRegistration() {
  const errors = validateRegistration({
    email: email.value,
    password: password.value,
    confirmPassword: confirmPassword.value,
  });
  replaceErrors(registerErrors, errors);
  const invalid = firstInvalidField(errors, ['email', 'password', 'confirmPassword']);
  if (invalid) {
    return focusField(invalid, {
      email: 'reg-email',
      password: 'reg-password',
      confirmPassword: 'confirm-password',
    });
  }

  action.value = 'register';
  const outcome = await registerByEmail(
    {
      email: email.value.trim(),
      password: password.value,
      name: name.value.trim() || undefined,
    },
    returnTo,
  );
  action.value = null;
  if (outcome === 'needs-email-verification') switchScene('verify', { keepSuccess: true });
}

async function submitForgotPassword() {
  const errors = validateForgotPassword({ email: email.value });
  replaceErrors(forgotErrors, errors);
  const invalid = firstInvalidField(errors, ['email']);
  if (invalid) return focusField(invalid, { email: 'forgot-email' });
  action.value = 'forgot';
  const sent = await passwordActions.forgotPassword({ email: email.value.trim() });
  action.value = null;
  if (sent) {
    localSuccessMessage.value = t('auth.forgot.sent');
    clearError();
  }
}

async function submitResetPassword() {
  const errors = validateResetPassword({
    newPassword: newPassword.value,
    confirmPassword: confirmNewPassword.value,
  });
  replaceErrors(resetErrors, errors);
  const invalid = firstInvalidField(errors, ['newPassword', 'confirmPassword']);
  if (invalid) {
    return focusField(invalid, {
      newPassword: 'new-password',
      confirmPassword: 'confirm-new-password',
    });
  }
  if (!resetToken) return;
  action.value = 'reset';
  const success = await passwordActions.resetPassword({
    token: resetToken,
    newPassword: newPassword.value,
  });
  action.value = null;
  if (success) {
    localSuccessMessage.value = t('auth.reset.success');
    switchScene('login', { keepSuccess: true });
  }
}

/** Recover from a persisted receipt. The reset token is never stored, so a
 * reset-password receipt recovers by re-issuing a fresh reset link (forgot
 * flow with the email pre-filled); a forgot-password receipt re-sends the
 * reset email directly. */
async function handleReceiptRetry() {
  const current = receipt.value;
  if (!current) {
    return;
  }
  if (current.operation === 'reset-password') {
    switchScene('forgot');
    return;
  }
  await submitForgotPassword();
}

function handleReceiptDismiss() {
  authStore.clearPasswordMutationError();
}

async function handleGithubLogin() {
  action.value = 'github';
  await startGithubLogin(returnTo);
  action.value = null;
}

watch([email, password], () => {
  clearError();
  const next = validateLogin({ email: email.value, password: password.value });
  if (loginErrors.email && !next.email) delete loginErrors.email;
  if (loginErrors.password && !next.password) delete loginErrors.password;
  const forgot = validateForgotPassword({ email: email.value });
  if (forgotErrors.email && !forgot.email) delete forgotErrors.email;
});
watch([email, password, confirmPassword], () => {
  const next = validateRegistration({
    email: email.value,
    password: password.value,
    confirmPassword: confirmPassword.value,
  });
  for (const field of ['email', 'password', 'confirmPassword'] as const) {
    if (registerErrors[field] && !next[field]) delete registerErrors[field];
  }
});
watch([newPassword, confirmNewPassword], () => {
  clearError();
  const next = validateResetPassword({
    newPassword: newPassword.value,
    confirmPassword: confirmNewPassword.value,
  });
  for (const field of ['newPassword', 'confirmPassword'] as const) {
    if (resetErrors[field] && !next[field]) delete resetErrors[field];
  }
});
</script>

<template>
  <main
    data-testid="web-auth-page"
    class="flex min-h-screen flex-col items-center justify-center overflow-x-hidden overflow-y-auto bg-neutral-950 px-4 py-16 text-white"
  >
    <div
      role="group"
      :aria-label="t('auth.page.languageSelector')"
      data-testid="auth-language-selector"
      class="fixed right-4 top-4 flex border border-white/10 bg-neutral-900 p-0.5"
    >
      <Button
        v-for="option in localeOptions"
        :key="option.value"
        size="sm"
        :variant="currentLocale === option.value ? 'default' : 'ghost'"
        :aria-pressed="currentLocale === option.value"
        :data-testid="`auth-locale-${option.value}`"
        class="h-7 px-2.5 text-xs"
        @click="setLocale(option.value)"
      >
        {{ option.label }}
      </Button>
    </div>

    <section class="w-full max-w-sm" aria-labelledby="auth-title">
      <header class="mb-7 text-center">
        <img :src="logo128" :alt="APP_DISPLAY_NAME" class="mx-auto mb-4 h-16 w-16" />
        <h1 id="auth-title" class="text-2xl font-semibold">{{ title }}</h1>
        <p class="mt-2 text-sm leading-6 text-white/55">{{ description }}</p>
      </header>

      <p
        v-if="errorMessage"
        data-testid="auth-error-banner"
        class="mb-4 border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        {{ errorMessage }}
      </p>
      <p
        v-if="successMessage || localSuccessMessage"
        data-testid="auth-success-banner"
        class="mb-4 border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
        role="status"
      >
        {{ successMessage || localSuccessMessage }}
      </p>

      <div
        v-if="receipt && (scene === 'forgot' || scene === 'reset')"
        role="alert"
        data-testid="web-auth-password-receipt"
        class="mb-4 flex flex-col gap-2 border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
      >
        <p data-testid="web-auth-password-receipt-message">{{ receipt.message }}</p>
        <p
          v-if="receipt.requestId"
          data-testid="web-auth-password-receipt-request-id"
          class="text-xs text-white/55"
        >
          {{ t('auth.receipt.requestId') }}: {{ receipt.requestId }}
        </p>
        <div class="flex gap-3">
          <button
            v-if="receipt.retryable"
            type="button"
            data-testid="web-auth-password-receipt-retry"
            class="underline underline-offset-2 hover:text-white"
            @click="handleReceiptRetry"
          >
            {{ t('auth.receipt.retry') }}
          </button>
          <button
            type="button"
            data-testid="web-auth-password-receipt-dismiss"
            class="underline underline-offset-2 hover:text-white"
            @click="handleReceiptDismiss"
          >
            {{ t('auth.receipt.dismiss') }}
          </button>
        </div>
      </div>

      <form v-if="scene === 'login'" data-testid="login-form" class="grid gap-4" novalidate @submit.prevent="submitLogin">
        <div data-testid="login-username-input" class="grid gap-1.5">
          <Label for="email">{{ t('auth.field.email') }}</Label>
          <Input id="email" v-model="email" type="email" autocomplete="email" :class="INPUT_CLASS" :aria-invalid="Boolean(loginErrors.email)" :aria-describedby="loginErrors.email ? 'email-error' : undefined" />
          <p v-if="loginErrors.email" id="email-error" data-testid="login-email-error" class="text-xs text-red-300">{{ t(loginErrors.email) }}</p>
        </div>
        <div data-testid="login-password-input" class="grid gap-1.5">
          <Label for="password">{{ t('auth.field.password') }}</Label>
          <Input id="password" v-model="password" type="password" autocomplete="current-password" :class="INPUT_CLASS" :aria-invalid="Boolean(loginErrors.password)" :aria-describedby="loginErrors.password ? 'password-error' : undefined" />
          <p v-if="loginErrors.password" id="password-error" data-testid="login-password-error" class="text-xs text-red-300">{{ t(loginErrors.password) }}</p>
        </div>
        <button data-testid="login-forgot-link" type="button" class="justify-self-end text-xs text-white/55 hover:text-white" @click="switchScene('forgot')">{{ t('auth.login.forgotLink') }}</button>
        <Button data-testid="login-submit-button" type="submit" :disabled="isLoading">
          <Loader2 v-if="isLoading && action === 'login'" class="mr-2 h-4 w-4 animate-spin" />
          {{ t(isLoading && action === 'login' ? 'auth.login.submitting' : 'auth.login.submit') }}
        </Button>
        <Button v-if="githubLoginAvailable" data-testid="login-github-button" type="button" variant="outline" :disabled="isLoading" @click="handleGithubLogin">
          {{ t('auth.login.github', 'Continue with GitHub') }}
        </Button>
      </form>

      <form v-else-if="scene === 'register'" data-testid="register-form" class="grid gap-4" novalidate @submit.prevent="submitRegistration">
        <div class="grid gap-1.5">
          <Label for="name">{{ t('auth.field.name', 'Name') }}</Label>
          <Input id="name" v-model="name" autocomplete="name" :class="INPUT_CLASS" />
        </div>
        <div class="grid gap-1.5">
          <Label for="reg-email">{{ t('auth.field.email') }}</Label>
          <Input id="reg-email" v-model="email" type="email" autocomplete="email" :class="INPUT_CLASS" :aria-invalid="Boolean(registerErrors.email)" />
          <p v-if="registerErrors.email" data-testid="register-email-error" class="text-xs text-red-300">{{ t(registerErrors.email) }}</p>
        </div>
        <div class="grid gap-1.5">
          <Label for="reg-password">{{ t('auth.field.password') }}</Label>
          <Input id="reg-password" v-model="password" type="password" autocomplete="new-password" :class="INPUT_CLASS" :aria-invalid="Boolean(registerErrors.password)" />
          <p v-if="registerErrors.password" data-testid="register-password-error" class="text-xs text-red-300">{{ t(registerErrors.password) }}</p>
        </div>
        <div class="grid gap-1.5">
          <Label for="confirm-password">{{ t('auth.field.confirmPassword') }}</Label>
          <Input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" :class="INPUT_CLASS" :aria-invalid="Boolean(registerErrors.confirmPassword)" />
          <p v-if="registerErrors.confirmPassword" data-testid="register-confirm-password-error" class="text-xs text-red-300">{{ t(registerErrors.confirmPassword) }}</p>
        </div>
        <Button data-testid="register-submit-button" type="submit" :disabled="isLoading">
          <Loader2 v-if="isLoading && action === 'register'" class="mr-2 h-4 w-4 animate-spin" />
          {{ t(isLoading && action === 'register' ? 'auth.register.submitting' : 'auth.register.submit') }}
        </Button>
      </form>

      <form v-else-if="scene === 'forgot'" data-testid="forgot-form" class="grid gap-4" novalidate @submit.prevent="submitForgotPassword">
        <div class="grid gap-1.5">
          <Label for="forgot-email">{{ t('auth.field.email') }}</Label>
          <Input id="forgot-email" v-model="email" type="email" autocomplete="email" :class="INPUT_CLASS" :aria-invalid="Boolean(forgotErrors.email)" />
          <p v-if="forgotErrors.email" class="text-xs text-red-300">{{ t(forgotErrors.email) }}</p>
        </div>
        <Button data-testid="forgot-submit-button" type="submit" :disabled="passwordLoading">
          <Loader2 v-if="passwordLoading && action === 'forgot'" class="mr-2 h-4 w-4 animate-spin" />
          {{ t(passwordLoading && action === 'forgot' ? 'auth.forgot.submitting' : 'auth.forgot.submit') }}
        </Button>
      </form>

      <form v-else-if="scene === 'reset'" data-testid="reset-form" class="grid gap-4" novalidate @submit.prevent="submitResetPassword">
        <div class="grid gap-1.5">
          <Label for="new-password">{{ t('auth.field.newPassword') }}</Label>
          <Input id="new-password" v-model="newPassword" type="password" autocomplete="new-password" :class="INPUT_CLASS" :aria-invalid="Boolean(resetErrors.newPassword)" />
          <p v-if="resetErrors.newPassword" class="text-xs text-red-300">{{ t(resetErrors.newPassword) }}</p>
        </div>
        <div class="grid gap-1.5">
          <Label for="confirm-new-password">{{ t('auth.field.confirmPassword') }}</Label>
          <Input id="confirm-new-password" v-model="confirmNewPassword" type="password" autocomplete="new-password" :class="INPUT_CLASS" :aria-invalid="Boolean(resetErrors.confirmPassword)" />
          <p v-if="resetErrors.confirmPassword" class="text-xs text-red-300">{{ t(resetErrors.confirmPassword) }}</p>
        </div>
        <Button data-testid="reset-submit-button" type="submit" :disabled="passwordLoading">{{ t('auth.reset.submit') }}</Button>
      </form>

      <section v-else data-testid="verify-email-form" class="border border-white/10 bg-white/[0.03] p-4 text-center text-sm leading-6 text-white/65">
        {{ t('auth.verify.linkInstruction', 'Open the verification link in your email. You can close this page afterward.') }}
      </section>

      <div class="mt-5 flex justify-center text-sm text-white/55">
        <button v-if="scene === 'login'" type="button" @click="switchScene('register')">{{ t('auth.login.registerLink') }}</button>
        <button v-else type="button" data-testid="auth-back-to-login" @click="switchScene('login')">{{ t('auth.verify.backToLogin') }}</button>
      </div>
    </section>

    <footer data-testid="auth-legal-footer" class="mt-7 max-w-sm text-center text-xs leading-5 text-white/40">
      <span>{{ t('auth.page.legalNoticePrefix') }}</span>
      <a :href="legalTermsHref" target="_blank" rel="noopener noreferrer" data-testid="auth-terms-link" class="underline underline-offset-2">{{ t('auth.page.termsOfService') }}</a>
      <span>{{ t('auth.page.legalNoticeMid') }}</span>
      <a :href="legalPrivacyHref" target="_blank" rel="noopener noreferrer" data-testid="auth-privacy-link" class="underline underline-offset-2">{{ t('auth.page.privacyPolicy') }}</a>
      <span>{{ t('auth.page.legalNoticeSuffix') }}</span>
    </footer>
  </main>
</template>
