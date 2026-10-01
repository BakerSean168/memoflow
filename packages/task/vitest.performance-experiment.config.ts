import { defineConfig, mergeConfig, type UserConfig } from 'vitest/config';
import { createSharedConfig } from '../../vitest.shared.ts';
import { taskPerformanceAliases } from './vitest.performance.config.ts';

const experimentIncludes = [
  'src/server/domain/performance/task-vnext.performance-experiment.bench.ts',
];

export default mergeConfig(
  createSharedConfig({
    projectRoot: import.meta.dirname,
    environment: 'node',
    testInclude: experimentIncludes,
    aliases: taskPerformanceAliases,
  }) as UserConfig,
  defineConfig({
    root: import.meta.dirname,
    test: {
      name: 'task-performance-experiment',
      include: experimentIncludes,
      exclude: ['node_modules', 'dist', '.git', '.cache'],
      testTimeout: 30000,
      pool: 'forks',
      execArgv: ['--expose-gc'],
    },
  }),
);
