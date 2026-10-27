import { installGoalUiHost } from '../di/goal-ui-host';
import { describe, expect, it } from 'vitest';
import { goalRoutes } from '@memoflow/goal-ui';
import { accountRoutes } from '@memoflow/account-ui';

// Retired barrel exports / files are governance locks (app-vue-source-locks.json#dead-surfaces).

describe('retired public render surfaces', () => {
  it('keeps KR/Review deep links on the canonical Goal entity workspace', () => {
    const children = goalRoutes[0].children!;
    const detail = children.find((route) => route.name === 'goal-detail')!;
    for (const name of ['goal-review-create', 'goal-review-detail', 'key-result-detail']) {
      expect(children.find((route) => route.name === name)?.component).toBe(detail.component);
    }
    expect(
      accountRoutes[0].children?.find((route) => route.name === 'account-center')?.redirect,
    ).toEqual({ path: '/settings', query: { tab: 'account' } });
  });
});

installGoalUiHost();
