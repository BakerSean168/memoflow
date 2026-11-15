<script setup lang="ts">
/**
 * PanelErrorBoundary
 *
 * 业务面板内容区错误边界（UI redesign V2 S5 cleanup）。
 * 用 onErrorCaptured 拦住面板内致命渲染错误，避免拖垮 AI 常驻层与壳。
 * 与 GlobalErrorBoundary 分工：全局兜底整应用；本组件只兜 BusinessPanel slot。
 */
import { onErrorCaptured, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { createLogger } from '@memoflow/utils/logger';

const props = withDefaults(
  defineProps<{
    /** 激活 Tab 变化时自动重置错误态，便于切走再回来重挂载视图。 */
    resetKey?: string | null;
  }>(),
  {
    resetKey: null,
  },
);

const { t } = useI18n();
const logger = createLogger('PanelErrorBoundary');

const error = ref<Error | null>(null);
const contentKey = ref(0);

onErrorCaptured((err: unknown) => {
  const captured = err instanceof Error ? err : new Error(String(err));
  error.value = captured;
  logger.error('Captured panel error', captured);

  // @ts-expect-error Sentry may be injected globally
  if (globalThis.Sentry) {
    // @ts-expect-error
    globalThis.Sentry.captureException(captured);
  }

  // Stop propagation so GlobalErrorBoundary / shell AI layer stay alive.
  return false;
});

watch(
  () => props.resetKey,
  (next, prev) => {
    if (next !== prev && error.value) {
      handleRetry();
    }
  },
);

function handleRetry() {
  error.value = null;
  contentKey.value += 1;
}

/** 测试与调试入口：手动注入错误态。 */
function reportError(err: unknown) {
  const captured = err instanceof Error ? err : new Error(String(err));
  error.value = captured;
}

defineExpose({
  error,
  contentKey,
  handleRetry,
  reportError,
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="panel-error-boundary">
    <div
      v-if="error"
      key="panel-error-fallback"
      class="flex h-full min-h-0 flex-1 items-center justify-center bg-background p-6"
      data-testid="panel-error-fallback"
      role="alert"
    >
      <div class="mx-auto max-w-md space-y-4 text-center">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <div class="space-y-1.5">
          <h2 class="text-lg font-semibold tracking-tight text-foreground">
            {{ t('shell.panel.contentErrorTitle') }}
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ error.message || t('shell.panel.contentErrorDescription') }}
          </p>
        </div>

        <Button
          size="lg"
          data-testid="panel-error-retry"
          class="shadow hover:bg-primary/90"
          @click="handleRetry"
        >
          {{ t('common.retry') }}
        </Button>

        <details v-if="error.stack" class="text-left">
          <summary
            class="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ t('common.viewErrorDetails') }}
          </summary>
          <pre
            class="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground"
            >{{ error.stack }}</pre>
        </details>
      </div>
    </div>

    <div
      v-show="!error"
      class="flex h-full min-h-0 flex-1 flex-col"
      data-testid="panel-error-content"
    >
      <slot />
    </div>
  </div>
</template>
