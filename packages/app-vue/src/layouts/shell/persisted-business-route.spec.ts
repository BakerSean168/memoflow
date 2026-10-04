import { describe, expect, it } from 'vitest';
import { canonicalizePersistedBusinessRoute } from './persisted-business-route';

describe('canonicalizePersistedBusinessRoute', () => {
  it('drops a stale Goal dialog and its dialog-owned identity while preserving filters', () => {
    expect(
      canonicalizePersistedBusinessRoute(
        '/goals?status=active&label=work&dialog=goal&goalId=goal-1#context',
      ),
    ).toBe('/goals?status=active&label=work#context');
  });

  it('drops generic transient dialogs while preserving business context', () => {
    expect(
      canonicalizePersistedBusinessRoute('/tasks?goalId=goal-1&keyResultId=kr-1&dialog=quick-task'),
    ).toBe('/tasks?goalId=goal-1&keyResultId=kr-1');
    expect(canonicalizePersistedBusinessRoute('/repository?dialog=knowledge-capture')).toBe(
      '/repository',
    );
  });

  it('leaves normal entity and filtered routes untouched', () => {
    expect(canonicalizePersistedBusinessRoute('/goals/goal-1')).toBe('/goals/goal-1');
    expect(canonicalizePersistedBusinessRoute('/goals?status=active')).toBe('/goals?status=active');
  });
});
