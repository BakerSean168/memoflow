/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createPackageVitestConfig } from '../../vitest.shared';

const baseConfig = createPackageVitestConfig({
  projectRoot: __dirname,
  environment: 'node',
  name: 'goal',
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
