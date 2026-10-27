/// <reference types="vitest" />
import { defineConfig, mergeConfig, type UserConfig } from 'vitest/config';
import { createSharedConfig } from '../../vitest.shared.ts';

export const taskPerformanceAliases = {
  '@memoflow/task-contracts': '../task-contracts/src/index.ts',
  '@memoflow/test-utils': '../test-utils/src/index.ts',
  '@memoflow/test-utils/mocks': '../test-utils/src/mocks/index.ts',
  '@memoflow/test-utils/helpers/result-matchers': '../test-utils/src/helpers/result-matchers.ts',
  '@memoflow/task/testing': './src/testing/index.ts',
  '@memoflow/task': './src/index.ts',
  '@memoflow/time': '../time/src/index.ts',
  '@memoflow/database': '../../packages/database/src',
};

const benchmarkIncludes = ['src/server/domain/performance/task-vnext.performance.bench.ts'];

const sharedConfig = createSharedConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  testInclude: benchmarkIncludes,
  aliases: taskPerformanceAliases,
}) as UserConfig;

const projectConfig = defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'task-performance',
    // Keep the performance suite opt-in and deterministic. Bench files are
    // intentionally allowlisted here so normal `task:test` runs stay fast.
    include: benchmarkIncludes,
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    testTimeout: 30000,
    // Use a forked Node runtime to reduce interference from the current CLI process.
    pool: 'forks',
  },
}) as UserConfig;

export default mergeConfig(sharedConfig, projectConfig);
