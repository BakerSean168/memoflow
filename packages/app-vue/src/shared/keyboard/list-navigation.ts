/** Active keyboard focus and multi-selection are independent, stable-ID state. */
export function createListNavigation() {
  let ids: string[] = [];
  let anchor: string | null = null;
  let rangeBase = new Set<string>();
  let extending = false;
  const state = {
    activeId: null as string | null,
    selected: new Set<string>(),
    reconcile(next: readonly string[]) {
      ids = [...new Set(next)];
      if (state.activeId && !ids.includes(state.activeId)) state.activeId = null;
      if (anchor && !ids.includes(anchor)) {
        anchor = null;
        extending = false;
      }
      state.selected = new Set([...state.selected].filter((id) => ids.includes(id)));
      rangeBase = new Set([...rangeBase].filter((id) => ids.includes(id)));
    },
    focus(id: string) {
      if (ids.includes(id) && id !== state.activeId) {
        state.activeId = id;
        anchor = id;
        extending = false;
      }
    },
    move(direction: 1 | -1, extend = false): string | null {
      if (!ids.length) return null;
      const current = state.activeId ? ids.indexOf(state.activeId) : -1;
      const index =
        current < 0
          ? direction === 1
            ? 0
            : ids.length - 1
          : Math.max(0, Math.min(ids.length - 1, current + direction));
      if (extend && !extending) {
        anchor = state.activeId ?? ids[index]!;
        rangeBase = new Set(state.selected);
      }
      state.activeId = ids[index]!;
      if (extend) {
        const start = anchor ? ids.indexOf(anchor) : index;
        state.selected = new Set([
          ...rangeBase,
          ...ids.slice(Math.min(start, index), Math.max(start, index) + 1),
        ]);
      } else {
        anchor = state.activeId;
      }
      extending = extend;
      return state.activeId;
    },
    toggle() {
      if (!state.activeId) return;
      if (state.selected.has(state.activeId)) state.selected.delete(state.activeId);
      else state.selected.add(state.activeId);
      anchor = state.activeId;
      extending = false;
    },
    clear() {
      state.selected.clear();
      state.activeId = null;
      anchor = null;
      extending = false;
    },
  };
  return state;
}
