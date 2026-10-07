<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EXTERNAL_AGENT_SERVICE_KEY } from '@memoflow/app-vue/di';
import type {
  ExternalAgentConsent,
  ExternalAgentFailureCode,
} from '@memoflow/contracts/agent-gateway';
import { Button } from '@memoflow/ui-vue-shadcn/components/ui/button';
import { APP_DISPLAY_NAME, logo128 } from '@memoflow/assets';
import { useAuthService } from './service';
import { startGithubPopupSignIn } from './github-popup-sign-in';
import { loadWebAuthCapabilities } from './capabilities';

const agents = inject(EXTERNAL_AGENT_SERVICE_KEY);
if (!agents) throw new Error('External agent service is required');
const service = agents;
const auth = useAuthService();
const { t } = useI18n();
// Keep the provider-signed query intact. It is never saved in browser storage.
const oauthQuery = window.location.search.slice(1);
const loginUrl = `/auth?${new URLSearchParams({ returnTo: `/auth/external-agent?${oauthQuery}` })}`;
const state = ref<'loading' | 'login' | 'consent' | 'error' | 'leaving'>('loading');
const error = ref<ExternalAgentFailureCode | 'EMAIL_VERIFICATION_REQUIRED' | 'SIGN_IN_FAILED'>(
  'SERVICE_UNAVAILABLE',
);
const retryable = computed(() =>
  [
    'NETWORK_ERROR',
    'SERVICE_UNAVAILABLE',
    'RATE_LIMITED',
    'INVALID_RESPONSE',
    'SIGN_IN_FAILED',
  ].includes(error.value),
);
const email = ref('');
const consent = ref<ExternalAgentConsent>();
const github = ref(false);

async function load() {
  state.value = 'loading';
  const session = await auth.getSession();
  if (!session.ok) {
    error.value = 'SERVICE_UNAVAILABLE';
    state.value = 'error';
    return;
  }
  if (!session.data.account) {
    state.value = 'login';
    return;
  }
  if (!session.data.account.emailVerified) {
    error.value = 'EMAIL_VERIFICATION_REQUIRED';
    state.value = 'error';
    return;
  }
  email.value = session.data.account.email;
  const result = await service.consentRequest(oauthQuery);
  if (!result.ok) {
    error.value = result.error.code;
    state.value = 'error';
    return;
  }
  consent.value = result.data;
  state.value = 'consent';
}
async function decide(accept: boolean) {
  state.value = 'leaving';
  const result = await service.decideConsent(oauthQuery, accept);
  if (!result.ok) {
    error.value = result.error.code;
    state.value = 'error';
    return;
  }
  window.location.assign(result.data.url);
}
async function githubLogin() {
  state.value = 'loading';
  const result = await startGithubPopupSignIn(auth);
  if (result.kind === 'failed') {
    error.value = 'SIGN_IN_FAILED';
    state.value = 'error';
    return;
  }
  await load();
}
onMounted(async () => {
  github.value = (await loadWebAuthCapabilities()).github;
  await load();
});
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-12 text-white">
    <section
      class="w-full max-w-md space-y-5"
      aria-labelledby="external-agent-title"
      :aria-busy="state === 'loading' || state === 'leaving'"
    >
      <header class="text-center">
        <img :src="logo128" :alt="APP_DISPLAY_NAME" class="mx-auto mb-4 h-16 w-16" />
        <h1 id="external-agent-title" class="text-2xl font-semibold">连接外部应用</h1>
      </header>
      <p
        v-if="state === 'loading' || state === 'leaving'"
        role="status"
        class="text-center text-white/65"
      >
        {{ state === 'leaving' ? '正在返回客户端…' : '正在验证连接请求…' }}
      </p>
      <div v-else-if="state === 'login'" class="grid gap-3">
        <p class="text-sm text-white/65">登录 MemoFlow 后，你可以查看并决定是否允许这次访问。</p>
        <Button v-if="github" @click="githubLogin">使用 GitHub 登录</Button>
        <Button as-child variant="outline"><a :href="loginUrl">使用邮箱登录</a></Button>
      </div>
      <div v-else-if="state === 'consent' && consent" class="space-y-5">
        <div class="rounded-lg border border-white/15 p-4">
          <p class="font-medium">{{ consent.name }} 请求访问 MemoFlow</p>
          <p class="mt-2 break-all text-xs text-white/55">{{ consent.clientId }}</p>
          <p class="mt-4 text-sm">当前账户：{{ email }}</p>
        </div>
        <div>
          <h2 class="font-medium">允许此应用</h2>
          <ul class="mt-2 list-inside list-disc space-y-1 text-sm text-white/75">
            <li v-if="consent.scopes.includes('goals:read')">查看你的 Goals</li>
            <li v-if="consent.scopes.includes('tasks:read')">查看你的 Tasks</li>
            <li v-if="consent.scopes.includes('offline_access')">离线保持连接，无需每次重新登录</li>
          </ul>
        </div>
        <p class="text-sm leading-6 text-white/60">
          此应用不能创建或修改 Goal、创建或完成 Task，也不能访问其他用户的数据。连接最长保留 90
          天，你可以随时在账户设置中撤销。
        </p>
        <div class="flex gap-3">
          <Button class="flex-1" variant="outline" @click="decide(false)">取消</Button>
          <Button class="flex-1" data-testid="oauth-consent-allow" @click="decide(true)"
            >允许只读访问</Button
          >
        </div>
      </div>
      <div v-else role="alert" class="space-y-3 text-sm text-red-200">
        <p>{{ t(`errors.${error}`) }}</p>
        <Button v-if="error === 'UNAUTHORIZED'" as-child variant="outline"
          ><a :href="loginUrl">重新登录</a></Button
        >
        <Button v-else-if="retryable" variant="outline" @click="load">重试</Button>
        <p v-else>请返回外部客户端，重新发起连接。</p>
      </div>
    </section>
  </main>
</template>
