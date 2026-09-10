// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
// @ts-ignore
import nxPlugin from '@nx/eslint-plugin';

const sharedScopeTags = ['scope:shared', 'scope:patterns'] as const;

/**
 * Feature scopes that must not import each other by default (ADR-033 / M3).
 * 默认拒绝跨 feature 依赖的 scope 列表。
 *
 * Exceptions are expressed as additional tags in onlyDependOnLibsWithTags.
 * 例外通过 onlyDependOnLibsWithTags 显式追加。
 */
const featureScopeConstraints = [
  {
    sourceTag: 'scope:account',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:account'],
  },
  {
    sourceTag: 'scope:ai',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:ai'],
  },
  {
    sourceTag: 'scope:authentication',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:authentication'],
  },
  {
    sourceTag: 'scope:goal',
    // temporary: schedule shared-kernel until Schedule* contracts are extracted
    onlyDependOnLibsWithTags: [
      ...sharedScopeTags,
      'scope:goal',
      'scope:schedule',
      'scope:scheduler',
    ],
  },
  {
    sourceTag: 'scope:governance',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:governance'],
  },
  {
    sourceTag: 'scope:notification',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:notification'],
  },
  {
    sourceTag: 'scope:reminder',
    // temporary: schedule shared-kernel until Schedule* contracts are extracted
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:reminder', 'scope:schedule'],
  },
  {
    sourceTag: 'scope:repository',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:repository'],
  },
  {
    sourceTag: 'scope:schedule',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:schedule'],
  },
  {
    sourceTag: 'scope:scheduler',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:scheduler'],
  },
  {
    sourceTag: 'scope:setting',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:setting'],
  },
  {
    sourceTag: 'scope:task',
    // temporary: schedule shared-kernel until Schedule* contracts are extracted
    onlyDependOnLibsWithTags: [
      ...sharedScopeTags,
      'scope:task',
      'scope:schedule',
      'scope:scheduler',
    ],
  },
  {
    sourceTag: 'scope:data-portability',
    // data-portability is an explicit multi-feature host composition root
    onlyDependOnLibsWithTags: [
      ...sharedScopeTags,
      'scope:data-portability',
      'scope:goal',
      'scope:task',
      'scope:reminder',
      'scope:notification',
      'scope:setting',
    ],
  },
] as const;

const moduleBoundaryDepConstraints = [
  {
    // shared: pure primitives, cannot depend on anything else
    sourceTag: 'layer:shared',
    onlyDependOnLibsWithTags: ['layer:shared'],
  },
  {
    // infra: technical plumbing, depends on shared only
    sourceTag: 'layer:infra',
    onlyDependOnLibsWithTags: ['layer:shared', 'layer:infra'],
  },
  {
    // domain: business logic + composition root (api/module.ts)
    // domain-server must NOT import infra; this rule allows domain -> infra
    // because composition roots (api/module.ts, electron-entry) live inside
    // domain-tagged packages and need to wire infra implementations.
    // See docs/standards/architecture.md "包内分层说明".
    sourceTag: 'layer:domain',
    onlyDependOnLibsWithTags: ['layer:shared', 'layer:infra', 'layer:domain'],
  },
  {
    // ui: presentation, can consume all layers
    sourceTag: 'layer:ui',
    onlyDependOnLibsWithTags: ['layer:shared', 'layer:infra', 'layer:domain', 'layer:ui'],
  },
  {
    // app: application shells, can consume everything
    sourceTag: 'layer:app',
    onlyDependOnLibsWithTags: [
      'layer:shared',
      'layer:infra',
      'layer:domain',
      'layer:ui',
      'layer:app',
    ],
  },
  {
    // testing: test support libraries may orchestrate shared contracts and
    // infrastructure fixtures (for example database-backed integration setup).
    sourceTag: 'layer:testing',
    onlyDependOnLibsWithTags: ['layer:shared', 'layer:infra', 'layer:testing'],
  },
  {
    // service: standalone deployable service projects.
    // Isolated leaves in the TS graph — may only consume shared contracts, never
    // reach into infra/domain/ui/app. Without this entry @nx/enforce-module-boundaries
    // leaves layer:service source tags unconstrained (default allow-all).
    sourceTag: 'layer:service',
    onlyDependOnLibsWithTags: ['layer:shared'],
  },
  // ============ Scope-level feature isolation (ADR-033 M3) ============
  ...featureScopeConstraints,
  {
    // UI feature shells may compose multiple domain features.
    sourceTag: 'scope:app-vue',
    onlyDependOnLibsWithTags: [
      ...sharedScopeTags,
      'scope:app-vue',
      'scope:ui',
      'scope:account',
      'scope:ai',
      'scope:authentication',
      'scope:goal',
      'scope:governance',
      'scope:notification',
      'scope:reminder',
      'scope:repository',
      'scope:schedule',
      'scope:scheduler',
      'scope:setting',
      'scope:task',
      'scope:data-portability',
    ],
  },
  {
    sourceTag: 'scope:app-react',
    onlyDependOnLibsWithTags: [
      ...sharedScopeTags,
      'scope:app-react',
      'scope:ui',
      'scope:account',
      'scope:ai',
      'scope:authentication',
      'scope:goal',
      'scope:governance',
      'scope:notification',
      'scope:reminder',
      'scope:repository',
      'scope:schedule',
      'scope:scheduler',
      'scope:setting',
      'scope:task',
      'scope:data-portability',
    ],
  },
  {
    // App shells / deployables may compose any feature public surface.
    sourceTag: 'scope:web',
    onlyDependOnLibsWithTags: [
      'scope:shared',
      'scope:patterns',
      'scope:ui',
      'scope:account',
      'scope:ai',
      'scope:authentication',
      'scope:goal',
      'scope:governance',
      'scope:notification',
      'scope:reminder',
      'scope:repository',
      'scope:schedule',
      'scope:scheduler',
      'scope:setting',
      'scope:task',
      'scope:data-portability',
      'scope:app-vue',
      'scope:app-react',
      'scope:web',
      'scope:desktop',
      'scope:mobile',
      'scope:api',
      'scope:test-utils',
      'scope:tools',
      'scope:meta',
    ],
  },
  {
    sourceTag: 'scope:desktop',
    onlyDependOnLibsWithTags: [
      'scope:shared',
      'scope:patterns',
      'scope:ui',
      'scope:account',
      'scope:ai',
      'scope:authentication',
      'scope:goal',
      'scope:governance',
      'scope:notification',
      'scope:reminder',
      'scope:repository',
      'scope:schedule',
      'scope:scheduler',
      'scope:setting',
      'scope:task',
      'scope:data-portability',
      'scope:app-vue',
      'scope:app-react',
      'scope:web',
      'scope:desktop',
      'scope:mobile',
      'scope:api',
      'scope:test-utils',
      'scope:tools',
      'scope:meta',
    ],
  },
  {
    sourceTag: 'scope:mobile',
    onlyDependOnLibsWithTags: [
      'scope:shared',
      'scope:patterns',
      'scope:ui',
      'scope:account',
      'scope:ai',
      'scope:authentication',
      'scope:goal',
      'scope:governance',
      'scope:notification',
      'scope:reminder',
      'scope:repository',
      'scope:schedule',
      'scope:scheduler',
      'scope:setting',
      'scope:task',
      'scope:data-portability',
      'scope:app-vue',
      'scope:app-react',
      'scope:web',
      'scope:desktop',
      'scope:mobile',
      'scope:api',
      'scope:test-utils',
      'scope:tools',
      'scope:meta',
    ],
  },
  {
    sourceTag: 'scope:api',
    onlyDependOnLibsWithTags: [
      'scope:shared',
      'scope:patterns',
      'scope:ui',
      'scope:account',
      'scope:ai',
      'scope:authentication',
      'scope:goal',
      'scope:governance',
      'scope:notification',
      'scope:reminder',
      'scope:repository',
      'scope:schedule',
      'scope:scheduler',
      'scope:setting',
      'scope:task',
      'scope:data-portability',
      'scope:app-vue',
      'scope:app-react',
      'scope:web',
      'scope:desktop',
      'scope:mobile',
      'scope:api',
      'scope:test-utils',
      'scope:tools',
      'scope:meta',
    ],
  },
  {
    sourceTag: 'scope:ui',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:ui'],
  },
  {
    sourceTag: 'scope:test-utils',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:test-utils', 'scope:tools'],
  },
  {
    sourceTag: 'scope:tools',
    onlyDependOnLibsWithTags: [...sharedScopeTags, 'scope:tools', 'scope:test-utils'],
  },
] as const;

const moduleBoundaryOptions = {
  enforceBuildableLibDependency: true,
  allow: ['./generated/prisma/**', '@memoflow/test-utils', '@memoflow/test-utils/*'],
  checkDynamicDependenciesExceptions: ['@memoflow/database'],
  depConstraints: moduleBoundaryDepConstraints,
} as const;

const utilsRootImportRestriction = {
  paths: [
    {
      name: '@memoflow/utils',
      message:
        'Import from a specific subpath instead: @memoflow/utils/logger, @memoflow/utils/domain, @memoflow/utils/errors, @memoflow/utils/shared, @memoflow/utils/result, @memoflow/utils/frontend, @memoflow/utils/validation, @memoflow/utils/lifecycle.',
    },
    {
      name: 'date-fns',
      message:
        'ADR-037/TIME-1206: import time from @memoflow/time. Production date-fns is confined to packages/time/src/engine/**; legacy exemptions are retired.',
    },
  ],
  patterns: [
    {
      group: ['date-fns/*', 'date-fns/fp', 'date-fns/locale', 'date-fns/locale/*'],
      message: 'ADR-037: date-fns subpaths are engine-only. Use @memoflow/time.',
    },
  ],
} as const;

export default tseslint.config(
  [
    {
      ignores: [
        '**/dist/**',
        '**/build/**',
        '**/node_modules/**',
        '**/coverage/**',
        '**/.nx/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/playwright-*-report/**',
        '**/dist-renderer/**',
        '**/dist-electron/**',
        '**/src/generated/prisma/**',
        '**/*.min.js',
        '**/*.d.ts',
      ],
    },
    {
      files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
      languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },

    tseslint.configs.recommended,
    pluginVue.configs['flat/essential'],
    {
      files: ['**/*.vue'],
      languageOptions: { parserOptions: { parser: tseslint.parser } },
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
    // ============ Subpath Import Preference + ADR-037 date-fns ban ============
    {
      files: [
        'apps/**/src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}',
        'packages/**/src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}',
        'tools/**/src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}',
      ],
      ignores: [
        // TIME-1206: the engine is the only production date-fns import boundary.
        'packages/time/src/engine/**',
      ],
      rules: {
        'no-restricted-imports': ['error', utilsRootImportRestriction],
      },
    },
    {
      files: [
        'apps/**/src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}',
        'packages/**/src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}',
      ],
      ignores: [
        '**/__tests__/**',
        '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        '**/e2e/**',
        '**/src/test/**',
        '**/src/testing/**',
        'packages/test-utils/**',
        'packages/time/src/engine/**',
      ],
      rules: {
        // Must re-include date-fns ban: flat config replaces no-restricted-imports wholesale.
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'date-fns',
                message:
                  'ADR-037/TIME-1206: import time from @memoflow/time. Production date-fns is confined to packages/time/src/engine/**; legacy exemptions are retired.',
              },
            ],
            patterns: [
              {
                group: ['@memoflow/test-utils', '@memoflow/test-utils/*'],
                message: 'Production code must not import test-only utilities.',
              },
              {
                group: ['date-fns/*', 'date-fns/fp', 'date-fns/locale', 'date-fns/locale/*'],
                message: 'ADR-037: date-fns subpaths are engine-only. Use @memoflow/time.',
              },
            ],
          },
        ],
      },
    },
    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        // 临时禁用这些规则，后续逐步修复
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-this-alias': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        'vue/no-side-effects-in-computed-properties': 'warn',
        'vue/valid-v-slot': 'warn',
        'vue/no-v-text-v-html-on-component': 'warn',
        'vue/no-use-v-if-with-v-for': 'warn',
        'vue/no-unused-vars': ['warn', { ignorePattern: '^_' }],
      },
    },

    // ============ ADR-037 P9: ban L5 private formatDate* + product toLocale* ============
    {
      files: [
        'packages/app-vue/src/modules/**/*.{ts,tsx,vue}',
        'packages/app-vue/src/layouts/**/*.{ts,tsx,vue}',
        'packages/app-react/src/**/*.{ts,tsx}',
      ],
      ignores: [
        '**/__tests__/**',
        '**/*.{test,spec}.{ts,tsx}',
        '**/*.stories.*',
        '**/surface.spec.ts',
        // L4 presentation allowlist (business sentences / duration dictionaries)
        'packages/app-vue/src/modules/schedule/utils/schedule-presentation.ts',
        'packages/app-vue/src/modules/task/utils/task-plan-presentation.ts',
        'packages/app-vue/src/modules/task/utils/format-task-duration.ts',
        'packages/app-vue/src/shared/utils/format-schedule-duration-minutes.ts',
        'packages/app-vue/src/modules/goal/utils/goal-timeline.ts',
        // P3 residual 1207 durable boundary
        'packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue',
        // Session bootstrap may createTimeFacade
        'packages/app-vue/src/shared/utils/product-time.ts',
        'packages/app-react/src/utils/product-time.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'FunctionDeclaration[id.name=/^(formatDate|formatTime|formatDateTime|formatTimestamp)$/]',
            message:
              'ADR-037 P9: no L5 formatDate|formatTime|formatDateTime|formatTimestamp — use getProductTime()/product-time helpers.',
          },
          {
            selector:
              'VariableDeclarator[id.name=/^(formatDate|formatTime|formatDateTime|formatTimestamp)$/]',
            message: 'ADR-037 P9: no L5 formatDate* bindings — use product-time / @memoflow/time.',
          },
          {
            selector: "CallExpression[callee.property.name='toLocaleDateString']",
            message: 'ADR-037 P9: product toLocaleDateString banned — use @memoflow/time format.*',
          },
          {
            selector: "CallExpression[callee.property.name='toLocaleTimeString']",
            message: 'ADR-037 P9: product toLocaleTimeString banned — use @memoflow/time format.*',
          },
          {
            selector: "CallExpression[callee.property.name='toLocaleString']",
            message: 'ADR-037 P9: product toLocaleString banned — use @memoflow/time format.*',
          },
        ],
      },
    },
    // ============ Module Boundary Enforcement ============
    // Dependency direction: shared ← infra ← domain ← ui
    {
      plugins: { '@nx': nxPlugin },
      rules: {
        '@nx/enforce-module-boundaries': ['error', moduleBoundaryOptions],
      },
    },
    {
      files: [
        '**/eslint.config.{js,mjs,cjs,ts,mts,cts}',
        '**/tsup.config.{js,mjs,cjs,ts,mts,cts}',
        '**/vite.config.{js,mjs,cjs,ts,mts,cts}',
        '**/vitest*.config.{js,mjs,cjs,ts,mts,cts}',
      ],
      plugins: { '@nx': nxPlugin },
      rules: {
        '@nx/enforce-module-boundaries': 'off',
      },
    },
    {
      // Test files still inherit @nx/enforce-module-boundaries.
      // Only @memoflow/test-utils is allowlisted by moduleBoundaryOptions, and
      // production files are explicitly blocked from importing it above.
      files: [
        '**/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        '**/e2e/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        '**/src/test/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}',
        'packages/test-utils/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      plugins: { '@nx': nxPlugin },
      rules: {},
    },

    {
      files: [
        'packages/repository/src/application-server/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'packages/repository/src/application-server/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../../infrastructure-server/**', '../../api/**'],
                message:
                  'Repository application tests must use ../../testing seams instead of private infrastructure or api paths.',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'packages/ai/src/application-server/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'packages/ai/src/application-server/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/infrastructure-server/**', '**/api/**'],
                message:
                  'AI application tests must use src/testing seams instead of private infrastructure or api paths.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/api/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/governance/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/contracts/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/domain-shared/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/setting/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/patterns/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/notification/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/account/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/authentication/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/ai/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/repository/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/reminder/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/schedule/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/task/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['packages/goal/src/**/*.ts'],
      ignores: ['**/__tests__/**', '**/test/**', '**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },
  ],
  storybook.configs['flat/recommended'],
);
