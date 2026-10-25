/**
 * Residual 1047 keep-boundary: preserve process.env + normalize postgres localhost loopback.
 * Distinct from apps/api/scripts plain loadWorkspaceEnv (no force-merge).
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE_ROOT = resolve(__dirname, '../../../');

function loadEnvFile(filePath: string, override = true): void {
  if (!existsSync(filePath)) {
    return;
  }

  expand(config({ path: filePath, override }));
}

export function loadWorkspaceEnv(nodeEnv = process.env.NODE_ENV || 'development'): void {
  const preservedEntries = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      preservedEntries.set(key, value);
    }
  }

  const envFiles = [
    resolve(WORKSPACE_ROOT, '.env'),
    resolve(WORKSPACE_ROOT, `.env.${nodeEnv}`),
    resolve(WORKSPACE_ROOT, '.env.local'),
    resolve(WORKSPACE_ROOT, `.env.${nodeEnv}.local`),
  ];

  for (const filePath of envFiles) {
    loadEnvFile(filePath, true);
  }

  for (const [key, value] of preservedEntries) {
    process.env[key] = value;
  }

  normalizePostgresLoopbackUrl('DATABASE_URL');
  normalizePostgresLoopbackUrl('DIRECT_URL');
  normalizePostgresLoopbackUrl('SHADOW_DATABASE_URL');
}

function normalizePostgresLoopbackUrl(
  envKey: 'DATABASE_URL' | 'DIRECT_URL' | 'SHADOW_DATABASE_URL',
): void {
  const rawValue = process.env[envKey];
  if (!rawValue) {
    return;
  }

  try {
    const url = new URL(rawValue);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'localhost') {
      return;
    }

    url.hostname = '127.0.0.1';
    process.env[envKey] = url.toString();
  } catch {
    // Keep the original value if the URL is not parseable.
  }
}
