import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

const MAX_PACKAGE_TYPE_BYTES = 64;

/** Read only electron-builder's fixed package marker; never infer from OS or paths. */
export function resolveLinuxPackageType(
  resourcesPath: string | undefined,
): 'deb' | 'rpm' | undefined {
  if (!resourcesPath) return undefined;

  let descriptor: number | undefined;
  let result: 'deb' | 'rpm' | undefined;
  try {
    descriptor = openSync(join(resourcesPath, 'package-type'), 'r');
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_PACKAGE_TYPE_BYTES) return undefined;

    // Bound the read even if the file changes after fstat.
    const buffer = Buffer.alloc(MAX_PACKAGE_TYPE_BYTES);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytes !== stat.size || fstatSync(descriptor).size !== stat.size) return undefined;
    const packageType = buffer.toString('utf8', 0, bytes).trim();
    result = packageType === 'deb' || packageType === 'rpm' ? packageType : undefined;
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        result = undefined;
      }
    }
  }
  return result;
}
