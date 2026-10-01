import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLinuxPackageType } from './linux-package-type.resolver';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    closeSync: vi.fn(fs.closeSync),
    openSync: vi.fn(fs.openSync),
    readSync: vi.fn(fs.readSync),
  };
});

const directories: string[] = [];
function resources(): string {
  const directory = mkdtempSync(join(tmpdir(), 'memoflow-package-marker-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('resolveLinuxPackageType', () => {
  it.each(['deb', 'rpm', ' deb\n', '\trpm\r\n'])('accepts exact trimmed marker %j', (marker) => {
    const directory = resources();
    writeFileSync(join(directory, 'package-type'), marker);
    expect(resolveLinuxPackageType(directory)).toBe(marker.trim());
    expect(openSync).toHaveBeenCalledWith(join(directory, 'package-type'), 'r');
  });

  it.each(['', 'snap', 'DEB', 'deb rpm', '../deb', 'deb\0', ' '.repeat(65) + 'deb'])(
    'rejects unknown, garbage, traversal or oversized marker %j',
    (marker) => {
      const directory = resources();
      writeFileSync(join(directory, 'package-type'), marker);
      expect(resolveLinuxPackageType(directory)).toBeUndefined();
    },
  );

  it('fails closed for missing resources, missing markers and directories', () => {
    expect(resolveLinuxPackageType(undefined)).toBeUndefined();
    const directory = resources();
    expect(resolveLinuxPackageType(directory)).toBeUndefined();
    mkdirSync(join(directory, 'package-type'));
    expect(resolveLinuxPackageType(directory)).toBeUndefined();
  });

  it('fails closed for unreadable markers', () => {
    vi.mocked(openSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });
    expect(resolveLinuxPackageType(resources())).toBeUndefined();
  });

  it('fails closed without throwing when closing a valid marker fails', async () => {
    const directory = resources();
    writeFileSync(join(directory, 'package-type'), 'deb');
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(closeSync).mockImplementationOnce((descriptor) => {
      actual.closeSync(descriptor);
      throw new Error('Close failed');
    });
    expect(resolveLinuxPackageType(directory)).toBeUndefined();
    expect(closeSync).toHaveBeenCalledOnce();
  });

  it('rejects a short read even when the prefix is a valid package type', () => {
    const directory = resources();
    writeFileSync(join(directory, 'package-type'), 'deb\n');
    vi.mocked(readSync).mockImplementationOnce((_descriptor, buffer) => {
      Buffer.from('deb').copy(buffer as Buffer);
      return 3;
    });
    expect(resolveLinuxPackageType(directory)).toBeUndefined();
    expect(closeSync).toHaveBeenCalledOnce();
  });

  it('rejects growth beyond the read bound after fstat', async () => {
    const directory = resources();
    const markerPath = join(directory, 'package-type');
    writeFileSync(markerPath, 'deb' + ' '.repeat(61));
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(readSync).mockImplementationOnce((descriptor, buffer, offset, length, position) => {
      writeFileSync(markerPath, 'deb' + ' '.repeat(62));
      return actual.readSync(descriptor, buffer, offset, length, position);
    });
    expect(resolveLinuxPackageType(directory)).toBeUndefined();
    expect(readSync).toHaveBeenCalledWith(expect.any(Number), expect.any(Buffer), 0, 64, 0);
  });

  it('does not search parent directories or read a path supplied by marker content', () => {
    const directory = resources();
    writeFileSync(join(directory, 'package-type'), 'deb');
    const child = join(directory, 'resources');
    mkdirSync(child);
    expect(resolveLinuxPackageType(child)).toBeUndefined();
    writeFileSync(join(child, 'package-type'), '../package-type');
    expect(resolveLinuxPackageType(child)).toBeUndefined();
    expect(vi.mocked(openSync).mock.calls.map(([path]) => path)).toEqual([
      join(child, 'package-type'),
      join(child, 'package-type'),
    ]);
  });
});
