import { watch, type Ref } from 'vue';
import { getActivePinia } from 'pinia';
import { useAppShellStore, type BusinessTab } from './useAppShellStore';

/**
 * Resolve a tab title at render time.
 *
 * Module tabs carry an i18n key so the active locale decides the label; object
 * tabs carry the object name as data and are returned verbatim.
 */
export function resolveTabTitle(
  tab: Pick<BusinessTab, 'title' | 'titleKey'>,
  translate: (key: string) => string,
): string {
  return tab.titleKey ? translate(tab.titleKey) : tab.title;
}

/**
 * 把详情视图加载到的对象标题上报为当前激活 Tab 的标题（Phase 1）。
 *
 * 标题格式由视图拼装为「模块名 · 对象标题」（如 "Goals · 提升英语"）；
 * 列表路由的 Tab 保持模块名不变。对象未加载（title 为 null/undefined）时
 * 不改写 Tab 标题，避免覆盖模块名。
 */
export function useTabObjectTitle(title: Ref<string | null | undefined>): void {
  const store = getActivePinia() ? useAppShellStore() : null;
  watch(
    title,
    (value) => {
      if (store && value) store.setActiveTabTitle(value);
    },
    { immediate: true },
  );
}
