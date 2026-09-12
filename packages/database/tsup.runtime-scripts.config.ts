import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'scripts/prepare-ai-knowledge-index-pgvector.ts',
    'scripts/prepare-ai-vnext-runtime-state-retirement.ts',
    'scripts/prepare-goal-record-source-correlation.ts',
    'scripts/prepare-notification-preference-hierarchy.ts',
    'scripts/prepare-vnext-unique-constraints.ts',
    'scripts/prepare-ai-provider-onboarding-sessions.ts',
    'scripts/prepare-ai-provider-default-invariant.ts',
    'scripts/prepare-knowledge-stable-document-identity-cutover.ts',
    'scripts/ensure-task-goal-binding-constraint.ts',
    'scripts/bootstrap-ai-knowledge-index.ts',
    'scripts/verify-ai-knowledge-index.ts',
  ],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist/runtime-scripts',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  external: ['pg', 'dotenv', 'dotenv-expand', '@memoflow/utils/shared'],
});
