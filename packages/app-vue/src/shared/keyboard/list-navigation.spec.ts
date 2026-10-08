import { describe, expect, it } from 'vitest';
import { createListNavigation } from './list-navigation';

describe('stable list navigation', () => {
  it('moves, extends from an anchor, and reconciles filtering by identity', () => {
    const list = createListNavigation();
    list.reconcile(['a', 'b', 'c']);
    expect(list.move(1)).toBe('a');
    list.toggle();
    list.move(1, true);
    expect([...list.selected]).toEqual(['a', 'b']);
    list.move(1, true);
    list.move(-1, true);
    expect([...list.selected]).toEqual(['a', 'b']);
    list.reconcile(['c', 'b']);
    expect(list.activeId).toBe('b');
    expect([...list.selected]).toEqual(['b']);
    list.reconcile(['c']);
    expect(list.activeId).toBeNull();
    expect(list.move(-1)).toBe('c');
    list.reconcile([]);
    expect(list.move(1)).toBeNull();
  });
});
