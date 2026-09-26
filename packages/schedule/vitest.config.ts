/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createPackageVitestConfig } from '../../vitest.shared.ts';

const baseConfig = createPackageVitestConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  name: 'schedule',
  governedCoverage: true,
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Base config already includes coverage
    },
  }),
);
