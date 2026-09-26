/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createSharedConfig } from '../../vitest.shared.ts';

const sharedConfig = createSharedConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  aliases: {
    '@memoflow/contracts/ai': '../../packages/contracts/src/modules/ai',
    '@memoflow/contracts/goal': '../../packages/contracts/src/modules/goal',
    '@memoflow/contracts/primitives': '../../packages/contracts/src/primitives',
    '@memoflow/contracts/reliable-messaging': '../../packages/contracts/src/modules/reliable-messaging',
    '@memoflow/powersync-schema': '../../packages/powersync-schema/src',
  },
});

export default mergeConfig(
  sharedConfig,
  defineConfig({
    root: import.meta.dirname,
    test: {
      name: 'api',
      environment: 'node',
      // Fast API tests stay isolated from real DB lifecycle setup.
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec,bench}.{js,mjs,cjs,ts,mts,cts}'],
      exclude: [
        'node_modules',
        'dist',
        '.git',
        '.cache',
        'src/test/setup.ts',
        'prisma/**/*',
        'src/**/*.integration.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
        'src/**/*.smoke.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
        'src/__tests__/smoke/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['node_modules/', 'src/test/', 'prisma/', '**/*.d.ts', '**/*.config.*', 'dist/'],
      },
      // Fast API tests still get a generous timeout because some suites assemble
      // a full app graph, but real DB lifecycle lives in smoke/integration targets.
      testTimeout: 30000,
      passWithNoTests: false,
      // Keep the suite deterministic while the app bootstrap graph is still heavy.
      sequence: {
        groupOrder: 1,
      },
      pool: 'forks',
      maxWorkers: 1,
      isolate: false,
    },
  }),
);
