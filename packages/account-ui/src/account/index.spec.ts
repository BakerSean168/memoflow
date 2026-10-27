import { describe, expect, it } from 'vitest';
import { accountRoutes } from './router';

describe('account module exports', () => {
  it('exposes account routes for app router composition', () => {
    expect(accountRoutes).toHaveLength(1);
    expect(accountRoutes[0]?.path).toBe('/account');
    expect(accountRoutes[0]?.children?.[1]?.name).toBe('account-center');
  });
});
