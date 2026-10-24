<script setup lang="ts">
/**
 * GlobalComposer — shell-owned AI input host (UI 重构 V2 §8)
 *
 * 壳层负责宿主矩形、密度与 focus 浮动定位；真实输入控件仍由 AIChatView
 * 通过 Teleport 挂到本组件 mount 节点，避免拆分 chat session 状态。
 *
 * - inline：贴 AI 列底部（STATE A/B）
 * - floating：相对业务工作区宿主居中（STATE C），底边稳定、宽度封顶
 * - settings：壳不渲染本组件
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SHELL_COMPOSER_MOUNT_KEY } from '../../di/keys';
import {
  COMPOSER_BOTTOM_GAP,
  computeComposerLayout,
  type ComposerLayoutMode,
} from './panel-geometry';

const props = withDefaults(
  defineProps<{
    mode?: ComposerLayoutMode;
    /** 宿主宽度（floating 居中封顶；inline 可传 AI 列宽供观测）。 */
    hostWidth?: number;
    visible?: boolean;
  }>(),
  {
    mode: 'inline',
    hostWidth: 0,
    visible: true,
  },
);

const emit = defineEmits<{
  (e: 'height-change', height: number): void;
}>();

const mountEl = ref<HTMLElement | null>(null);
const shellMount = inject(SHELL_COMPOSER_MOUNT_KEY, null);

const layout = computed(() => computeComposerLayout(props.hostWidth || 0));

const hostStyle = computed(() => {
  if (props.mode !== 'floating') {
    return {
      width: '100%',
    } as Record<string, string>;
  }
  return {
    width: `${layout.value.width}px`,
    maxWidth: '100%',
    bottom: `${COMPOSER_BOTTOM_GAP}px`,
  } as Record<string, string>;
});

function registerMount(el: HTMLElement | null) {
  if (!shellMount) return;
  shellMount.value = el;
}

function publishHeight() {
  const height = mountEl.value?.offsetHeight ?? 0;
  emit('height-change', height);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  void nextTick(() => {
    registerMount(mountEl.value);
    publishHeight();
    if (typeof ResizeObserver !== 'undefined' && mountEl.value) {
      resizeObserver = new ResizeObserver(() => publishHeight());
      resizeObserver.observe(mountEl.value);
    }
  });
});

watch(mountEl, (el) => {
  registerMount(el);
  publishHeight();
});

watch(
  () => props.mode,
  () => {
    void nextTick(() => {
      registerMount(mountEl.value);
      publishHeight();
    });
  },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (shellMount && shellMount.value === mountEl.value) {
    shellMount.value = null;
  }
});
</script>

<template>
  <div
    v-show="visible"
    class="global-composer pointer-events-none z-40"
    :class="
      mode === 'floating'
        ? 'absolute inset-x-0 bottom-0 flex justify-center px-2'
        : 'relative w-full shrink-0'
    "
    data-testid="global-composer"
    :data-composer-mode="mode"
  >
    <div
      ref="mountEl"
      class="pointer-events-auto w-full"
      :style="hostStyle"
      data-testid="global-composer-mount"
    />
  </div>
</template>
