/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

// Vitest projects add signal/exit listeners in several worker modes.
// Raise the cap slightly to avoid tool-internal listener noise in CI.
process.setMaxListeners(32);

/**
 * Vitest Configuration for MemoFlow Monorepo
 *
 * This file configures all test projects in the monorepo using the test.projects field.
 * Each project can have its own configuration while inheriting common settings.
 *
 * Documentation: https://vitest.dev/guide/projects
 *
 * Note: This configuration is now in the main vitest config file, not a separate workspace file.
 * The workspace file format has been deprecated in Vitest 3.x.
 */
// Root config keeps project registry + cross-project defaults.
// Alias/plugin helpers are centralized in vitest.workspace-helpers.ts.

export default defineConfig({
  assetsInclude: ['**/*.icns'],
  test: {
    // Keep local runs detailed, but make CI logs compact and high-signal.
    reporters: process.env.CI ? ['dot'] : ['verbose'],

    // Root vitest.config.ts is a pure workspace registry.
    // Project-local vitest.config.ts files own project behavior, aliases, and coverage.
    projects: [
      './packages/contracts/vitest.config.ts',
      './packages/utils/vitest.config.ts',
      './packages/assets/vitest.config.ts',
      './packages/patterns/vitest.config.ts',
      './packages/domain-shared/vitest.config.ts',
      './packages/account/vitest.config.ts',
      './packages/ai/vitest.config.ts',
      './packages/cloud-auth/vitest.config.ts',
      './packages/goal/vitest.config.ts',
      './packages/notification/vitest.config.ts',
      './packages/reminder/vitest.config.ts',
      './packages/repository/vitest.config.ts',
      './packages/schedule/vitest.config.ts',
      './packages/setting/vitest.config.ts',
      './packages/task/vitest.config.ts',
      './packages/task/vitest.integration.config.ts',
      './apps/api/vitest.config.ts',
      './apps/api/vitest.smoke.config.ts',
      './packages/app-vue/vitest.config.ts',
      './apps/desktop/vitest.config.ts',
      './apps/desktop/vitest.ipc.config.ts',
      './apps/desktop/vitest.main.config.ts',
      './apps/web/vitest.config.ts',
    ],

    // Global test settings.
    // Projects with no tests must be explicit exceptions in governance tooling.
    globals: true,
    passWithNoTests: false,

    // Bail early in CI environments
    bail: process.env.CI ? 1 : 0,
  },
});
