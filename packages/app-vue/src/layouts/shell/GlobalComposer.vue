<script setup lang="ts">
/**
 * GlobalComposer — shell-owned AI input host (UI 重构 V2 §8)
 *
 * 壳层负责宿主矩形；真实输入控件仍由 AIChatView 通过 Teleport 挂到本组件
 * mount 节点，避免拆分 chat session 状态。
 *
 * 宿主只在普通布局（chat / split）存在：专注布局不渲染本组件，mount 归零，
 * 对话页据此停止提供输入框（Issue #951）。
 */
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SHELL_COMPOSER_MOUNT_KEY } from '../../di/keys';

const mountEl = ref<HTMLElement | null>(null);
const shellMount = inject(SHELL_COMPOSER_MOUNT_KEY, null);

function registerMount(el: HTMLElement | null) {
  if (!shellMount) return;
  shellMount.value = el;
}

onMounted(() => {
  void nextTick(() => registerMount(mountEl.value));
});

watch(mountEl, (el) => registerMount(el));

onBeforeUnmount(() => {
  if (shellMount && shellMount.value === mountEl.value) {
    shellMount.value = null;
  }
});
</script>

<template>
  <div class="relative w-full shrink-0" data-testid="global-composer">
    <div ref="mountEl" class="w-full" data-testid="global-composer-mount" />
  </div>
</template>
