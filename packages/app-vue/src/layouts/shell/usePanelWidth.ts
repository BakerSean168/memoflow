/**
 * Panel Width Context (UI 重构 V2 §7：从"视口四档"到"面板两档")
 *
 * V2 的宽度适配对象是**面板本身**，不是视口。BusinessPanel 用 ResizeObserver
 * 测量自己的内容宽度，provide 给面板内的业务视图；视图据此在
 *   - 窄档（narrow）：split 态、面板 320–750px → 第二侧栏收下拉、网格 1–2 列、
 *     重交互（拖拽/图谱）禁用并提示"最大化后可用"
 *   - 宽档（wide）：focus 态满屏 → 完整布局，等价该页桌面形态
 * 之间切换。同一组件在 split 与 focus 下**自适应**，不再用 `md:`/`lg:`/`xl:`
 * 视口断点。
 *
 * 阈值 900px：略高于 split 上限 750，确保分栏态永远判定为 narrow，
 * 只有进入 focus（满屏）才升 wide。
 */
import { computed, inject, provide, readonly, ref, type InjectionKey, type Ref } from 'vue';
import type { PanelWidthContext, PanelWidthTier } from '@memoflow/ui-host-contracts';

export type { PanelWidthContext, PanelWidthTier } from '@memoflow/ui-host-contracts';

/** narrow ↔ wide 的临界像素宽度（面板内容宽度）。 */
export const PANEL_WIDE_THRESHOLD = 900;

const PANEL_WIDTH_KEY: InjectionKey<PanelWidthContext> = Symbol('PanelWidthContext');

/**
 * 面板容器侧调用：持有宽度 ref、派生档位并 provide。
 * BusinessPanel 用 ResizeObserver 把测得的宽度写进返回的 `width`。
 */
export function providePanelWidth(): { width: Ref<number | null> } {
  const width = ref<number | null>(null);
  const tier = computed<PanelWidthTier>(() =>
    width.value != null && width.value < PANEL_WIDE_THRESHOLD ? 'narrow' : 'wide',
  );
  provide(PANEL_WIDTH_KEY, {
    width: readonly(width),
    tier,
    isNarrow: computed(() => tier.value === 'narrow'),
    isWide: computed(() => tier.value === 'wide'),
  });
  return { width };
}

/**
 * 业务视图侧调用：读取面板宽度档位。
 * 面板外（不太可能，因为 router-view 只在 BusinessPanel 内）默认 wide，
 * 保证独立渲染/单测时是完整布局。
 */
export function usePanelWidth(): PanelWidthContext {
  const injected = inject(PANEL_WIDTH_KEY, null);
  if (injected) return injected;
  const width = ref<number | null>(null);
  const tier = computed<PanelWidthTier>(() => 'wide');
  return {
    width: readonly(width),
    tier,
    isNarrow: computed(() => false),
    isWide: computed(() => true),
  };
}
