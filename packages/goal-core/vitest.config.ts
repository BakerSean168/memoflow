/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createPackageVitestConfig } from '../../vitest.shared.ts';

export default mergeConfig(
  createPackageVitestConfig({
    projectRoot: import.meta.dirname,
    environment: 'node',
    name: 'goal-core',
    governedCoverage: false,
  }),
  defineConfig({ test: {} }),
);
