import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it('loads the Goal composition root without initializing a host database', async () => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DB_HOST', '');
  vi.resetModules();

  const owner = await import('./index');

  expect(owner.createGoalModule).toBeTypeOf('function');
  expect(owner.createGoalPowerSyncRepositories).toBeTypeOf('function');
}, 30_000); // Cold composition-graph transforms can exceed the unit-test default under CI load.
