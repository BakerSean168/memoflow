export const electronNativeModules = ['electron', 'argon2', 'better-sqlite3'];

export const electronNativeRuntimePackages = ['argon2', 'better-sqlite3'];

export const electronJsExternalPackages = [
  '@anthropic-ai/claude-agent-sdk',
  '@powersync/node',
  '@powersync/common',
  'date-fns',
  // Bundle gray-matter and its js-yaml 3 dependency into main.cjs.
  // electron-builder's hoister otherwise substitutes js-yaml 4 at runtime.
  'winston',
  'winston-daily-rotate-file',
];

export const electronExternalWorkspacePackages = ['@memoflow/database'];

export const powerSyncRuntimePackages = [
  '@powersync/node',
  '@powersync/common',
  'async-mutex',
  'bson',
  'comlink',
  'event-iterator',
  'undici',
];

export const nativeLoaderRuntimePackages = ['bindings', 'file-uri-to-path'];
