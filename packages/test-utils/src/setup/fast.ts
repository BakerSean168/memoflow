import { afterEach, beforeEach, vi } from 'vitest';

export interface FastTestSetupOptions {
  env?: Record<string, string | undefined>;
  nodeEnv?: string | false;
  timezone?: string | false;
  resetMocks?: boolean;
  preserveExistingEnv?: boolean;
}

/**
 * Apply a lightweight, deterministic environment for fast tests.
 *
 * This intentionally avoids booting databases, containers, or any other
 * external boundary. Slow suites should own that setup explicitly.
 */
export function applyFastTestEnv(options: FastTestSetupOptions = {}) {
  const { env = {}, nodeEnv = 'test', timezone = 'UTC', preserveExistingEnv = false } = options;

  if (nodeEnv !== false) {
    setEnvValue('NODE_ENV', nodeEnv, preserveExistingEnv);
  }

  if (timezone !== false) {
    setEnvValue('TZ', timezone, preserveExistingEnv);
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    setEnvValue(key, value, preserveExistingEnv);
  }
}

/**
 * Register standard beforeEach/afterEach hooks for fast Vitest suites.
 */
export function registerFastTestHooks(options: FastTestSetupOptions = {}) {
  beforeEach(() => {
    applyFastTestEnv(options);
  });

  afterEach(() => {
    if (options.resetMocks !== false) {
      vi.restoreAllMocks();
    }
  });
}

function setEnvValue(key: string, value: string, preserveExistingEnv: boolean) {
  if (preserveExistingEnv && process.env[key]) {
    return;
  }

  process.env[key] = value;
}
