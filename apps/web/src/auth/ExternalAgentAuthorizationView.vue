<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EXTERNAL_AGENT_SERVICE_KEY } from '@memoflow/app-vue/di';
import type { ExternalAgentConsent, ExternalAgentFailureCode } from '@memoflow/agent-gateway';
import { Button } from '@memoflow/ui-vue-shadcn/components/ui/button';
import { Checkbox } from '@memoflow/ui-vue-shadcn';
import { APP_DISPLAY_NAME, logo128 } from '@memoflow/assets';
import { useAuthService } from './service';
import { startGithubPopupSignIn } from './github-popup-sign-in';
import { loadWebAuthCapabilities } from './capabilities';

interface ScopeItem {
  readonly scope: string;
  readonly label: string;
  readonly description: string;
}
interface ScopeGroup {
  readonly title: string;
  readonly items: readonly ScopeItem[];
}
/**
 * Consent is grouped by business domain, with reads and writes listed
 * separately. Write entries state the concrete side effect, not just "write".
 * `offline_access` is a continuation grant, so it lives in its own group.
 */
const SCOPE_GROUPS: readonly ScopeGroup[] = [
  {
    title: '目标',
    items: [
      {
        scope: 'goals:read',
        label: '读取目标和关键结果',
        description: '查看目标的名称、状态、进度和关键结果。',
      },
      {
        scope: 'goals:write',
        label: '创建和修改目标、关键结果',
        description: '可以新建或修改 Goal/KR，不会自动激活目标，也不能整组替换关键结果。',
      },
    ],
  },
  {
    title: '任务',
    items: [
      { scope: 'tasks:read', label: '读取任务', description: '查看任务定义、计划和发生记录。' },
      {
        scope: 'tasks:write',
        label: '创建、修改和完成任务',
        description: '完成任务可能按既有贡献配置改变目标进度；修改任务所属目标还需目标写权限。',
      },
    ],
  },
  {
    title: '例行',
    items: [
      { scope: 'routines:read', label: '读取例行', description: '查看例行定义和即将发生的安排。' },
      {
        scope: 'routines:write',
        label: '创建、暂停或删除例行',
        description: '可以永久删除例行和它的安排，删除后无法恢复。',
      },
    ],
  },
  {
    title: '通知',
    items: [
      { scope: 'notifications:read', label: '读取通知', description: '查看通知内容和未读数量。' },
      {
        scope: 'notifications:write',
        label: '把通知标记为已读',
        description: '只改变已读状态，不会代替你执行通知里的动作。',
      },
    ],
  },
  {
    title: '日程',
    items: [
      { scope: 'schedules:read', label: '读取日程', description: '查看日历条目和时间安排。' },
    ],
  },
  {
    title: '标签',
    items: [{ scope: 'labels:read', label: '读取标签', description: '查看标签名称和颜色。' }],
  },
  {
    title: '关系',
    items: [
      {
        scope: 'relations:read',
        label: '读取跨域关系',
        description: '查看目标、任务、知识之间的关联。',
      },
    ],
  },
  {
    title: 'AI',
    items: [
      {
        scope: 'ai:read',
        label: '读取 AI 会话与 Agent',
        description: '查看 AI 会话正文和 Agent 归档信息。',
      },
    ],
  },
  {
    title: '连接',
    items: [
      {
        scope: 'offline_access',
        label: '保持离线连接',
        description: '允许在你关闭浏览器后继续访问，无需每次重新登录。',
      },
    ],
  },
];

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
  'EAG_SERVICE_UNAVAILABLE',
);
const retryable = computed(() =>
  [
    'EAG_NETWORK_ERROR',
    'EAG_SERVICE_UNAVAILABLE',
    'EAG_RATE_LIMITED',
    'EAG_INVALID_RESPONSE',
    'SIGN_IN_FAILED',
  ].includes(error.value),
);
const email = ref('');
const consent = ref<ExternalAgentConsent>();
const github = ref(false);
const selected = reactive<Record<string, boolean>>({});

const requestedScopes = computed<readonly string[]>(() => consent.value?.scopes ?? []);
const existingScopes = computed(() => new Set<string>(consent.value?.existingScopes ?? []));
const newScopes = computed(() =>
  requestedScopes.value.filter((scope) => !existingScopes.value.has(scope)),
);
const groups = computed(() =>
  SCOPE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => requestedScopes.value.includes(item.scope)),
  })).filter((group) => group.items.length > 0),
);
const selectedScopes = computed(() =>
  requestedScopes.value.filter((scope) => selected[scope] === true),
);
const writeScopes = computed(() => requestedScopes.value.filter((s) => s.endsWith(':write')));
const hasReadScopes = computed(() => requestedScopes.value.some((s) => s.endsWith(':read')));
const hasWriteSelected = computed(() => selectedScopes.value.some((s) => s.endsWith(':write')));
const canApprove = computed(() => selectedScopes.value.length > 0 && state.value === 'consent');

function initSelection() {
  for (const scope of requestedScopes.value) {
    // Reads default on and writes default off: writing is never pre-selected.
    selected[scope] = scope === 'offline_access' || !scope.endsWith(':write');
  }
}
function allowReadOnly() {
  for (const scope of requestedScopes.value) selected[scope] = !scope.endsWith(':write');
}
async function load() {
  state.value = 'loading';
  const session = await auth.getSession();
  if (!session.ok) {
    error.value = 'EAG_SERVICE_UNAVAILABLE';
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
  initSelection();
  state.value = 'consent';
}
async function decide(accept: boolean, scopes?: readonly string[]) {
  state.value = 'leaving';
  const result = await service.decideConsent(oauthQuery, accept, scopes);
  if (!result.ok) {
    error.value = result.error.code;
    state.value = 'error';
    return;
  }
  window.location.assign(result.data.url);
}
async function approve() {
  if (!canApprove.value) return;
  await decide(true, selectedScopes.value);
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
          <p class="font-medium">{{ consent.name }} 请求访问你的 MemoFlow 数据</p>
          <p class="mt-2 text-xs text-white/55">
            域名：<span class="break-all font-mono">{{ consent.clientHost }}</span>
          </p>
          <p class="mt-1 break-all text-xs text-white/55">client_id：{{ consent.clientId }}</p>
          <p class="mt-4 text-sm">当前账户：{{ email }}</p>
          <p class="mt-2 text-xs leading-5 text-amber-200/80">
            客户端名称由该应用自行声明，请以域名核对身份。
          </p>
        </div>
        <div
          v-if="newScopes.length > 0"
          class="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100"
        >
          <p class="font-medium">本次新增授权</p>
          <p class="mt-1 break-all">{{ newScopes.join('、') }}</p>
        </div>
        <div class="space-y-4">
          <section v-for="group in groups" :key="group.title" class="space-y-2">
            <h2 class="text-sm font-medium text-white/80">{{ group.title }}</h2>
            <label
              v-for="item in group.items"
              :key="item.scope"
              class="flex gap-3 rounded-lg border p-3"
              :class="
                newScopes.includes(item.scope)
                  ? 'border-amber-300/50 bg-amber-300/5'
                  : 'border-white/10'
              "
            >
              <Checkbox v-model="selected[item.scope]" :aria-label="item.label" class="mt-0.5" />
              <span class="space-y-1">
                <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {{ item.label }}
                  <span
                    v-if="item.scope.endsWith(':write')"
                    class="rounded bg-rose-400/15 px-1.5 py-0.5 text-[11px] text-rose-200"
                    >写入</span
                  >
                  <span
                    v-if="newScopes.includes(item.scope)"
                    class="rounded bg-amber-300/20 px-1.5 py-0.5 text-[11px] text-amber-100"
                    >新增</span
                  >
                </span>
                <span class="block text-xs leading-5 text-white/55">{{ item.description }}</span>
              </span>
            </label>
          </section>
        </div>
        <p class="text-xs leading-5 text-white/55">
          连接最长保留 90 天；access token 有效 10 分钟，refresh token 最长 30 天。可随时在 个人中心
          → 已连接应用 撤销；撤销对后续请求立即生效，已提交的命令不会回滚。
        </p>
        <p
          v-if="writeScopes.length > 0 && !hasReadScopes"
          class="text-xs leading-5 text-amber-200/80"
        >
          该客户端只申请了写权限，没有可降级的只读范围；如需只读，请返回客户端重新发起。
        </p>
        <p v-if="selectedScopes.length === 0" class="text-xs leading-5 text-amber-200/80">
          请至少选择一项权限。
        </p>
        <div class="space-y-3">
          <Button
            v-if="writeScopes.length > 0"
            class="w-full"
            variant="outline"
            :disabled="!hasReadScopes"
            data-testid="oauth-consent-readonly"
            @click="allowReadOnly"
            >仅允许只读</Button
          >
          <div class="flex gap-3">
            <Button class="flex-1" variant="outline" @click="decide(false)">取消</Button>
            <Button
              class="flex-1"
              data-testid="oauth-consent-allow"
              :disabled="!canApprove"
              @click="approve"
              >{{ hasWriteSelected ? '允许写入' : '允许只读访问' }}</Button
            >
          </div>
        </div>
      </div>
      <div v-else role="alert" class="space-y-3 text-sm text-red-200">
        <p>{{ t(`errors.${error}`) }}</p>
        <Button v-if="error === 'EAG_UNAUTHORIZED'" as-child variant="outline"
          ><a :href="loginUrl">重新登录</a></Button
        >
        <Button v-else-if="retryable" variant="outline" @click="load">重试</Button>
        <p v-else>请返回外部客户端，重新发起连接。</p>
      </div>
    </section>
  </main>
</template>
