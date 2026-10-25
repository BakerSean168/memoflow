<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { APP_DISPLAY_NAME, logo128 } from '@memoflow/assets';
import { Button } from '@memoflow/ui-vue-shadcn/components/ui/button';
import { Input } from '@memoflow/ui-vue-shadcn/components/ui/input';
import { Loader2 } from '@lucide/vue';
import { useDeviceAuthorization } from './useDeviceAuthorization';

const query = new URLSearchParams(window.location.search);
const enteredCode = ref(query.get('user_code') ?? '');
const auth = useDeviceAuthorization(enteredCode.value);
const displayCode = computed(() => auth.userCode.value.replace(/(.{4})(?=.)/g, '$1-'));
const loginReturnTo = computed(
  () =>
    `/auth?${new URLSearchParams({
      returnTo: `/auth/device?${new URLSearchParams({ user_code: auth.userCode.value })}`,
    }).toString()}`,
);

function submitCode() {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ user_code: enteredCode.value }).toString();
  window.location.replace(url.toString());
}

onMounted(auth.load);
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-12 text-white">
    <section class="w-full max-w-sm" aria-labelledby="device-auth-title">
      <header class="mb-7 text-center">
        <img :src="logo128" :alt="APP_DISPLAY_NAME" class="mx-auto mb-4 h-16 w-16" />
        <h1 id="device-auth-title" class="text-2xl font-semibold">连接 MemoFlow Desktop</h1>
        <p class="mt-2 text-sm leading-6 text-white/55">
          确认这次连接请求后，桌面端将能够同步你的云端数据。
        </p>
      </header>

      <div
        v-if="auth.state.value === 'loading'"
        data-testid="device-auth-loading"
        class="flex justify-center py-8"
      >
        <Loader2 class="h-6 w-6 animate-spin" />
      </div>

      <form
        v-else-if="auth.state.value === 'invalid' && !auth.userCode.value"
        class="grid gap-3"
        @submit.prevent="submitCode"
      >
        <Input
          v-model="enteredCode"
          autocomplete="one-time-code"
          placeholder="输入桌面端显示的授权码"
        />
        <Button type="submit">继续</Button>
      </form>

      <section
        v-else-if="auth.state.value === 'sign_in_required'"
        data-testid="device-auth-sign-in"
        class="grid gap-3"
      >
        <p class="text-center text-sm text-white/65">授权码</p>
        <strong class="text-center text-2xl tracking-widest">{{ displayCode }}</strong>
        <Button type="button" @click="auth.startGithubLogin">使用 GitHub 登录并继续</Button>
        <Button as-child variant="outline"><a :href="loginReturnTo">使用邮箱登录</a></Button>
      </section>

      <section
        v-else-if="auth.state.value === 'ready_to_approve'"
        data-testid="device-auth-approval"
        class="grid gap-4"
      >
        <div class="border border-white/10 bg-white/[0.03] p-4 text-sm">
          <p class="text-white/55">正在连接</p>
          <p class="mt-1 font-medium">MemoFlow Desktop</p>
          <p class="mt-4 text-white/55">当前账号</p>
          <p class="mt-1 break-all">{{ auth.account.value?.email }}</p>
          <p class="mt-4 text-white/55">授权码</p>
          <strong class="mt-1 block text-xl tracking-widest">{{ displayCode }}</strong>
        </div>
        <Button data-testid="device-auth-approve" type="button" @click="auth.approve"
          >允许连接</Button
        >
        <Button data-testid="device-auth-deny" type="button" variant="outline" @click="auth.deny"
          >拒绝</Button
        >
      </section>

      <section
        v-else-if="auth.state.value === 'approved'"
        data-testid="device-auth-approved"
        class="border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-100"
      >
        已允许连接。你可以关闭此页面并返回 MemoFlow Desktop。
      </section>

      <section
        v-else-if="auth.state.value === 'denied'"
        data-testid="device-auth-denied"
        class="border border-white/10 p-4 text-center text-sm text-white/65"
      >
        已拒绝这次连接请求，可以安全关闭此页面。
      </section>

      <section
        v-else-if="auth.state.value === 'expired'"
        data-testid="device-auth-expired"
        class="border border-red-400/20 bg-red-400/10 p-4 text-center text-sm text-red-100"
        role="alert"
      >
        授权码已过期。请返回 MemoFlow Desktop 重新发起连接。
      </section>

      <section
        v-else
        class="grid gap-3 border border-red-400/20 bg-red-400/10 p-4 text-center text-sm text-red-100"
        role="alert"
      >
        <p>
          {{
            auth.state.value === 'invalid'
              ? '授权码无效。'
              : (auth.error.value?.message ?? '无法处理连接请求。')
          }}
        </p>
        <Button type="button" variant="outline" @click="auth.load">重试</Button>
      </section>
    </section>
  </main>
</template>
