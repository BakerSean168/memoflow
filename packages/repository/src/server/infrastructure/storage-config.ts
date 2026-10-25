export const DEFAULT_REPOSITORY_STORAGE_BASE_DIR = '/tmp/memoflow-repository-storage';

export interface ResolveRepositoryStorageBaseDirOptions {
  readonly storageBaseDir?: string | null;
  readonly env?: Record<string, string | undefined>;
}

/**
 * Residual 1174 keep-boundary: repository storage-config normalizePath — filesystem path trim.
 * Accepts string|null|undefined; empty/whitespace → null (no URL prefix stripping).
 * Soft residual 1174: auth email-verification normalizePath is URL route shape (no force-merge).
 */
function normalizePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveRepositoryStorageBaseDir(
  options: ResolveRepositoryStorageBaseDirOptions = {},
): string {
  const explicitPath = normalizePath(options.storageBaseDir);
  if (explicitPath) {
    return explicitPath;
  }

  const env = options.env ?? process.env;
  return normalizePath(env.REPOSITORY_STORAGE_PATH) ?? DEFAULT_REPOSITORY_STORAGE_BASE_DIR;
}
