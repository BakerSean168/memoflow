import { computed, reactive, type InjectionKey } from 'vue';

export interface ConversationSelectionOperation {
  profileId: string;
  token: number;
}

function selectionKey(profileId: string, id: string): string {
  return JSON.stringify([profileId, id]);
}

/** Sidebar-only selection state. Stable IDs are always scoped to their Profile. */
export function createConversationSelectionStore() {
  const state = reactive({
    profileId: '',
    order: [] as string[],
    selectedKeys: new Set<string>(),
    rangeBase: new Set<string>(),
    anchorKey: null as string | null,
    activeKey: null as string | null,
    extending: false,
    selectionMode: false,
    busy: false,
    operationEpoch: 0,
    results: [] as {
      id: string;
      title: string;
      success: boolean;
      action: string;
    }[],
  });

  const selectedIds = computed(() =>
    state.order.filter((id) => state.selectedKeys.has(selectionKey(state.profileId, id))),
  );

  function clear() {
    state.selectedKeys = new Set();
    state.rangeBase = new Set();
    state.anchorKey = null;
    state.activeKey = null;
    state.extending = false;
    state.selectionMode = false;
  }

  function reconcile(ids: readonly string[], profileId: string) {
    if (state.profileId !== profileId) {
      state.profileId = profileId;
      state.operationEpoch += 1;
      state.busy = false;
      clear();
      state.results = [];
    }
    const nextOrder = [...new Set(ids)];
    if (state.order.join('\0') !== nextOrder.join('\0')) {
      state.extending = false;
      state.rangeBase = new Set();
    }
    state.order = nextOrder;
    const visible = new Set(state.order.map((id) => selectionKey(profileId, id)));
    state.selectedKeys = new Set([...state.selectedKeys].filter((key) => visible.has(key)));
    state.rangeBase = new Set([...state.rangeBase].filter((key) => visible.has(key)));
    if (state.anchorKey && !visible.has(state.anchorKey)) {
      state.anchorKey = null;
      state.extending = false;
    }
    if (state.activeKey && !visible.has(state.activeKey)) state.activeKey = null;
  }

  function focus(id: string) {
    if (!state.order.includes(id)) return;
    const key = selectionKey(state.profileId, id);
    if (state.activeKey === key) return;
    state.anchorKey = key;
    state.activeKey = key;
    state.extending = false;
  }

  function toggle(id: string) {
    const key = selectionKey(state.profileId, id);
    const next = new Set(state.selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    state.selectedKeys = next;
    state.anchorKey = key;
    state.activeKey = key;
    state.extending = false;
  }

  function rangeTo(id: string) {
    const key = selectionKey(state.profileId, id);
    if (!state.order.includes(id)) return;
    if (
      !state.anchorKey ||
      !state.order.some((id) => selectionKey(state.profileId, id) === state.anchorKey)
    ) {
      state.anchorKey = key;
      state.rangeBase = new Set();
      state.extending = false;
    }
    if (!state.extending) state.rangeBase = new Set(state.selectedKeys);
    const anchorId = JSON.parse(state.anchorKey)[1] as string;
    const start = state.order.indexOf(anchorId);
    const end = state.order.indexOf(id);
    const range = state.order.slice(Math.min(start, end), Math.max(start, end) + 1);
    state.selectedKeys = new Set([
      ...state.rangeBase,
      ...range.map((rangeId) => selectionKey(state.profileId, rangeId)),
    ]);
    state.activeKey = key;
    state.extending = true;
  }

  function click(id: string, modifiers: { toggle?: boolean; range?: boolean } = {}) {
    if (modifiers.range) {
      rangeTo(id);
      return;
    }
    if (modifiers.toggle || state.selectionMode) {
      toggle(id);
      return;
    }
    state.selectedKeys = new Set();
    state.rangeBase = new Set();
    state.anchorKey = selectionKey(state.profileId, id);
    state.activeKey = state.anchorKey;
    state.extending = false;
  }

  function isSelected(id: string): boolean {
    return state.selectedKeys.has(selectionKey(state.profileId, id));
  }

  function toggleAll() {
    const allSelected = state.order.length > 0 && state.order.every(isSelected);
    state.selectedKeys = allSelected
      ? new Set()
      : new Set(state.order.map((id) => selectionKey(state.profileId, id)));
    state.rangeBase = new Set();
    state.extending = false;
  }

  function complete(ids: readonly string[]) {
    const completed = new Set(ids.map((id) => selectionKey(state.profileId, id)));
    state.selectedKeys = new Set([...state.selectedKeys].filter((key) => !completed.has(key)));
    if (state.anchorKey && completed.has(state.anchorKey)) state.anchorKey = null;
    if (state.activeKey && completed.has(state.activeKey)) state.activeKey = null;
    state.extending = false;
    if (!selectedIds.value.length) state.selectionMode = false;
  }

  function startOperation(): ConversationSelectionOperation | null {
    if (state.busy) return null;
    state.busy = true;
    state.operationEpoch += 1;
    return { profileId: state.profileId, token: state.operationEpoch };
  }

  function isOperationCurrent(operation: ConversationSelectionOperation): boolean {
    return state.profileId === operation.profileId && state.operationEpoch === operation.token;
  }

  function finishOperation(operation: ConversationSelectionOperation) {
    if (isOperationCurrent(operation)) state.busy = false;
  }

  return {
    state,
    selectedIds,
    clear,
    reconcile,
    click,
    focus,
    toggle,
    rangeTo,
    toggleAll,
    isSelected,
    complete,
    startOperation,
    isOperationCurrent,
    finishOperation,
  };
}

export type ConversationSelectionStore = ReturnType<typeof createConversationSelectionStore>;
export const ConversationSelectionKey: InjectionKey<ConversationSelectionStore> =
  Symbol('conversation-selection');
