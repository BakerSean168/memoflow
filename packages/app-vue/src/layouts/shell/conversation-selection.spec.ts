import { describe, expect, it } from 'vitest';
import { createConversationSelectionStore } from './conversation-selection';

describe('sidebar Profile-scoped selection', () => {
  it('opens normally, toggles disjoint IDs, and extends a range across groups without opening', () => {
    const store = createConversationSelectionStore();
    store.reconcile(['a', 'b', 'c', 'd'], 'one');
    store.click('b');
    expect(store.selectedIds.value).toEqual([]);
    store.click('d', { range: true });
    expect(store.selectedIds.value).toEqual(['b', 'c', 'd']);
    store.click('c', { range: true });
    expect(store.selectedIds.value).toEqual(['b', 'c']);
    store.click('a', { toggle: true });
    store.click('c', { toggle: true });
    expect(store.selectedIds.value).toEqual(['a', 'b']);
  });

  it('converges on filtering, deletion and reorder and resets an absent anchor', () => {
    const store = createConversationSelectionStore();
    store.reconcile(['a', 'b', 'c', 'd'], 'one');
    store.click('b', { toggle: true });
    store.click('d', { range: true });
    store.reconcile(['d', 'c', 'a'], 'one');
    expect(store.selectedIds.value).toEqual(['d', 'c']);
    expect(store.state.anchorKey).toBeNull();
    store.click('a', { range: true });
    expect(store.selectedIds.value).toEqual(['d', 'c', 'a']);
    store.clear();
    expect(store.selectedIds.value).toEqual([]);
    expect(store.state.anchorKey).toBeNull();
  });

  it('keeps failures selected and blocks rapid operations; old Profile completions cannot own the new state', () => {
    const store = createConversationSelectionStore();
    store.reconcile(['a', 'b'], 'one');
    store.toggleAll();
    const operation = store.startOperation()!;
    expect(store.startOperation()).toBeNull();
    store.complete(['a']);
    expect(store.selectedIds.value).toEqual(['b']);
    store.reconcile(['a', 'b'], 'two');
    expect(store.selectedIds.value).toEqual([]);
    store.click('a', { toggle: true });
    expect(store.isOperationCurrent(operation)).toBe(false);
    const next = store.startOperation()!;
    store.finishOperation(operation);
    expect(store.state.busy).toBe(true);
    store.finishOperation(next);
    expect(store.state.busy).toBe(false);
  });
});
