import type { ObjectDirective } from 'vue';
import { createListNavigation } from './list-navigation';

interface KeyboardListOptions {
  selectable?: boolean;
  virtual?: {
    getIds(): readonly string[];
    reveal(id: string): Promise<void>;
  };
}

export function isKeyboardVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
export interface ListNavigationAdapter {
  root: HTMLElement;
  readonly activeItemId: string | null;
  readonly hasSelection: boolean;
  focusItem(id: string): void;
  selectable: boolean;
  visibleItems(): HTMLElement[];
  reconcile(): void;
  moveSelection(direction: 1 | -1, extend?: boolean): void;
  openItem(): boolean;
  toggleSelection(): void;
  clear(): void;
  tree(direction: 'expand' | 'collapse'): boolean;
  configure(options: KeyboardListOptions): void;
  dispose(): void;
}
const adapters = new WeakMap<HTMLElement, ListNavigationAdapter>();
function createAdapter(root: HTMLElement, options: KeyboardListOptions): ListNavigationAdapter {
  let selectable = options.selectable ?? false;
  let virtual = options.virtual;
  let disposed = false;
  const model = createListNavigation();
  function visibleItems() {
    return [...root.querySelectorAll<HTMLElement>('[data-keyboard-item]')].filter(
      (el) =>
        el.closest('[data-keyboard-list]') === root &&
        !el.matches('[disabled], [aria-disabled="true"]') &&
        isKeyboardVisible(el),
    );
  }
  function paint() {
    for (const item of root.querySelectorAll<HTMLElement>('[data-keyboard-item]')) {
      item.dataset.keyboardActive = String(item.dataset.keyboardItem === model.activeId);
      item.dataset.keyboardSelected = String(model.selected.has(item.dataset.keyboardItem!));
      if (selectable) item.setAttribute('aria-pressed', item.dataset.keyboardSelected);
    }
  }
  function reconcile() {
    model.reconcile(virtual?.getIds() ?? visibleItems().map((el) => el.dataset.keyboardItem!));
    paint();
  }
  function active() {
    return visibleItems().find((el) => el.dataset.keyboardItem === model.activeId);
  }
  function focusRenderedItem() {
    const item = active();
    if (!item) return;
    item.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // Focus remains in the explicit list. Existing tab stops are preserved.
    if (!item.matches('button, a[href], input, select, textarea, [tabindex]')) item.tabIndex = -1;
    item.focus({ preventScroll: true });
  }
  function revealActive(action: () => void): void {
    const id = model.activeId;
    if (!id) return;
    if (!virtual) {
      action();
      return;
    }
    void virtual.reveal(id).then(() => {
      if (!disposed && isKeyboardVisible(root) && model.activeId === id) {
        paint();
        action();
      }
    });
  }
  function clickActive(): boolean {
    const item = active();
    if (!item) return false;
    const target = item.querySelector<HTMLElement>('[data-keyboard-open]') ?? item;
    if (target.matches('[disabled], [aria-disabled="true"]')) return false;
    target.click();
    return true;
  }
  const adapter: ListNavigationAdapter = {
    root,
    get activeItemId() {
      return model.activeId;
    },
    get hasSelection() {
      return model.selected.size > 0;
    },
    focusItem: model.focus,
    get selectable() {
      return selectable;
    },
    set selectable(value) {
      selectable = value;
    },
    configure(next) {
      selectable = next.selectable ?? false;
      virtual = next.virtual;
    },
    dispose() {
      disposed = true;
    },
    visibleItems,
    reconcile,
    moveSelection(direction, extend = false) {
      reconcile();
      model.move(direction, selectable && extend);
      paint();
      revealActive(focusRenderedItem);
    },
    openItem() {
      reconcile();
      if (active()) return clickActive();
      if (!virtual || !model.activeId) return false;
      revealActive(() => {
        clickActive();
      });
      return true;
    },
    toggleSelection() {
      if (selectable) {
        model.toggle();
        paint();
      }
    },
    clear() {
      model.clear();
      paint();
    },
    tree(direction) {
      const item = active();
      if (!item || !root.hasAttribute('data-keyboard-tree')) return false;
      const expanded = item.getAttribute('aria-expanded');
      if (
        (direction === 'expand' && expanded === 'false') ||
        (direction === 'collapse' && expanded === 'true')
      ) {
        (item.querySelector<HTMLElement>('[data-keyboard-expand]') ?? item).click();
      } else if (direction === 'expand' && expanded === 'true') adapter.moveSelection(1);
      else if (direction === 'collapse' && item.dataset.keyboardParent) {
        model.focus(item.dataset.keyboardParent);
        paint();
        revealActive(focusRenderedItem);
      }
      return true;
    },
  };
  return adapter;
}

/** Stable-ID owner rows, optionally virtualized; never attaches a key listener. */
export const vKeyboardList: ObjectDirective<HTMLElement, KeyboardListOptions | undefined> = {
  mounted(root, binding) {
    root.dataset.keyboardList = '';
    if (!root.hasAttribute('tabindex')) root.tabIndex = 0;
    adapters.set(root, createAdapter(root, binding.value ?? {}));
    adapters.get(root)?.reconcile();
  },
  updated(root, binding) {
    const adapter = adapters.get(root);
    adapter?.configure(binding.value ?? {});
    adapter?.reconcile();
  },
  unmounted(root) {
    adapters.get(root)?.dispose();
    adapters.delete(root);
  },
};

export function listAdapterFor(element: Element | null): ListNavigationAdapter | null {
  const root = element?.closest<HTMLElement>('[data-keyboard-list]');
  if (!root || !isKeyboardVisible(root)) return null;
  const adapter = adapters.get(root) ?? null;
  adapter?.reconcile();
  const item = element?.closest<HTMLElement>('[data-keyboard-item]');
  if (item && adapter && item.closest('[data-keyboard-list]') === root)
    adapter.focusItem(item.dataset.keyboardItem!);
  return adapter;
}
