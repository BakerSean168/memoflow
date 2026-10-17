import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ElectronApplication } from 'playwright';
import { expect } from '@playwright/test';

/** Operator-controlled, exact-binary receipt. Never trust a file name or a GUI version alone. */
export async function verifyInstalledNativeBinary(
  app: ElectronApplication,
  installedExecutable: string,
  expectedSha256: string,
  expectedVersion: string,
) {
  expect(process.platform).toBe('win32');
  expect(expectedSha256).toMatch(/^[0-9a-f]{64}$/i);
  expect(expectedVersion).toMatch(/^\d+\.\d+\.\d+$/);
  expect(fs.statSync(installedExecutable).isFile()).toBe(true);
  const checksum = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(installedExecutable);
    stream.on('data', (chunk) => checksum.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  expect(checksum.digest('hex')).toBe(expectedSha256.toLowerCase());
  const provenance = await app.evaluate(({ app: electronApp }) => ({
    executable: electronApp.getPath('exe'),
    version: electronApp.getVersion(),
    packaged: electronApp.isPackaged,
    appPath: electronApp.getAppPath(),
  }));
  expect(provenance.packaged).toBe(true);
  expect(path.normalize(provenance.executable).toLowerCase()).toBe(
    path.normalize(installedExecutable).toLowerCase(),
  );
  expect(provenance.version).toBe(expectedVersion);
  // Do not include private filesystem or account paths in the receipt.
  return {
    packaged: provenance.packaged,
    version: provenance.version,
    executableSha256: expectedSha256.toLowerCase(),
    preloadPath: path.join(provenance.appPath, 'dist-electron', 'preload.cjs'),
  };
}
