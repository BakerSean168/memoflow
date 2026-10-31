import { PermissionStorageUnavailableError } from '../../permissions/permission.repository';

/** Translate structured Prisma missing-table failures at the persistence boundary only. */
export async function withPermissionStorage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error && typeof error === 'object') {
      const value = error as { code?: unknown };
      // Prisma exposes a precise missing-table code. SQLite local tables are
      // initialized by PermissionLocalRepository; generic SQLITE_ERROR is not
      // specific enough to justify widening permissions to the default preset.
      if (value.code === 'P2021') throw new PermissionStorageUnavailableError();
    }
    throw error;
  }
}
