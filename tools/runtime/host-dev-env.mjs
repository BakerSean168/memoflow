/**
 * Machine-scoped environment overlay for the canonical GCP host-dev lane.
 *
 * Worktrees are intentionally disposable, so long-lived server credentials must
 * not live in each worktree's .env.development.local. The canonical host-dev
 * launcher loads this shared, git-external overlay before Nx starts. Existing
 * process.env values win so operators/CI can still make explicit overrides.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const HOST_DEV_ENV_PATH_VARIABLE = 'MEMOFLOW_HOST_DEV_ENV_FILE';
export const DEFAULT_HOST_DEV_ENV_RELATIVE_PATH = '.config/memoflow/host-dev.env';

export const GITHUB_KNOWLEDGE_APP_ENV_KEYS = Object.freeze([
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_WEBHOOK_SECRET',
  'GITHUB_INSTALLATION_ROUTE_KEY',
]);

export function resolveHostDevEnvPath(env = process.env, homeDirectory = homedir()) {
  const configured = String(env[HOST_DEV_ENV_PATH_VARIABLE] ?? '').trim();
  if (!configured) {
    return resolve(homeDirectory, DEFAULT_HOST_DEV_ENV_RELATIVE_PATH);
  }
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function configuredKeys(env, keys) {
  return keys.filter((key) => String(env[key] ?? '').trim().length > 0);
}

export function inspectGithubKnowledgeAppEnv(env = process.env) {
  const present = configuredKeys(env, GITHUB_KNOWLEDGE_APP_ENV_KEYS);
  const missing = GITHUB_KNOWLEDGE_APP_ENV_KEYS.filter((key) => !present.includes(key));
  return {
    configured: missing.length === 0,
    partial: present.length > 0 && missing.length > 0,
    present,
    missing,
  };
}

export function loadHostDevEnv(options = {}) {
  const env = options.env ?? process.env;
  const filePath =
    options.filePath ?? resolveHostDevEnvPath(env, options.homeDirectory ?? homedir());

  if (!existsSync(filePath)) {
    return {
      filePath,
      loaded: false,
      injectedKeys: [],
      insecurePermissions: false,
      githubKnowledgeApp: inspectGithubKnowledgeAppEnv(env),
    };
  }

  const parsed = parseEnv(readFileSync(filePath, 'utf8'));
  const injectedKeys = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
      injectedKeys.push(key);
    }
  }

  const mode = statSync(filePath).mode & 0o777;
  return {
    filePath,
    loaded: true,
    injectedKeys,
    insecurePermissions: (mode & 0o077) !== 0,
    githubKnowledgeApp: inspectGithubKnowledgeAppEnv(env),
  };
}
