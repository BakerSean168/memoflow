import { describe, expect, it } from 'vitest';
import { goalRoutes } from './router';

describe('goal module exports', () => {
  it('exposes goal routes for app router composition', () => {
    expect(goalRoutes).toHaveLength(1);
    expect(goalRoutes[0]?.path).toBe('/goals');
    expect(goalRoutes[0]?.children).toBeDefined();
    expect(goalRoutes[0]?.children!.length).toBeGreaterThan(0);
  });

  it('has goal-list as the default child route', () => {
    const children = goalRoutes[0]?.children ?? [];
    const listRoute = children.find((r) => r.name === 'goal-list');
    expect(listRoute).toBeDefined();
    expect(listRoute?.path).toBe('');
  });

  it('has goal-detail route with :id param', () => {
    const children = goalRoutes[0]?.children ?? [];
    const detailRoute = children.find((r) => r.name === 'goal-detail');
    expect(detailRoute).toBeDefined();
    expect(detailRoute?.path).toBe(':id');
    // GoalDetail reads route state so all compatibility overlays share one owner.
    expect(detailRoute?.props).toBe(false);
  });
});
