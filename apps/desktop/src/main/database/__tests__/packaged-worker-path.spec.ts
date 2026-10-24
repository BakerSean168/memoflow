import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { resolvePackagedWorkerPath } from '../packaged-worker-path';

describe('resolvePackagedWorkerPath', () => {
  const packedPath = path.join(
    path.sep,
    'opt',
    'MemoFlow',
    'resources',
    'app.asar',
    'node_modules',
    '@powersync',
    'node',
    'worker.js',
  );
  const unpackedPath = path.join(
    path.sep,
    'opt',
    'MemoFlow',
    'resources',
    'app.asar.unpacked',
    'node_modules',
    '@powersync',
    'node',
    'worker.js',
  );

  it('leaves development worker paths unchanged', () => {
    expect(resolvePackagedWorkerPath(packedPath, { isPackaged: false })).toBe(packedPath);
  });

  it('redirects packaged string worker paths into app.asar.unpacked', () => {
    const existsSync = vi.fn((candidate) => candidate === unpackedPath);
    expect(resolvePackagedWorkerPath(packedPath, { isPackaged: true, existsSync })).toBe(
      unpackedPath,
    );
  });

  it('redirects packaged file URL worker paths while preserving URL input', () => {
    const existsSync = vi.fn((candidate) => candidate === unpackedPath);
    const resolved = resolvePackagedWorkerPath(pathToFileURL(packedPath), {
      isPackaged: true,
      existsSync,
    });
    expect(resolved).toBeInstanceOf(URL);
    expect(String(resolved)).toBe(String(pathToFileURL(unpackedPath)));
  });

  it('keeps the original path when the unpacked worker is absent', () => {
    expect(
      resolvePackagedWorkerPath(packedPath, { isPackaged: true, existsSync: () => false }),
    ).toBe(packedPath);
  });
});
