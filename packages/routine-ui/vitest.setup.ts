import { beforeAll } from 'vitest';

// Resolve the real host after each spec's hoisted mocks have been registered.
beforeAll(async () => {
  const { installRoutineUiHost } = await import('@routine-ui-test-host/di/routine-ui-host');
  installRoutineUiHost();
}, 60_000);
