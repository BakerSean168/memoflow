/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import { createPackageVitestConfig } from '../../vitest.shared.ts';

const baseConfig = createPackageVitestConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  name: 'routine',
  governedCoverage: { extraRoots: ['src/server/domain/routine'] },
});

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Base config already includes coverage
    },
  }),
);
