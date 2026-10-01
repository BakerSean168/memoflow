import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../keys';

describe('DesktopUpdateService host-neutral DI surface', () => {
  const typesSource = readFileSync(resolve(__dirname, '../types.ts'), 'utf8');
  const keysSource = readFileSync(resolve(__dirname, '../keys.ts'), 'utf8');

  it('exports one optional host-neutral service key', () => {
    expect(typeof DESKTOP_UPDATE_SERVICE_KEY).toBe('symbol');
    expect(keysSource).toContain('DESKTOP_UPDATE_SERVICE_KEY: InjectionKey<DesktopUpdateService>');
  });

  it('exposes only snapshot operations and subscription to shared Vue', () => {
    expect(typesSource).toContain('export interface DesktopUpdateService');
    expect(typesSource).toContain('getDiagnostics(): Promise<Result<DesktopUpdateDiagnosticsDTO>>');
    expect(typesSource).toContain('getSnapshot(): Promise<Result<DesktopUpdateSnapshotDTO>>');
    expect(typesSource).toContain('check(): Promise<Result<DesktopUpdateSnapshotDTO>>');
    expect(typesSource).toContain('restartAndInstall(): Promise<Result<DesktopUpdateSnapshotDTO>>');
    expect(typesSource).toContain(
      'subscribe(listener: (snapshot: DesktopUpdateSnapshotDTO) => void): () => void',
    );

    expect(typesSource).not.toContain('updateServerUrl');
    expect(typesSource).not.toContain('setFeedURL');
    expect(typesSource).not.toContain('autoDownload');
    expect(typesSource).not.toContain('quitAndInstall');
  });

  it('does not couple the shared service port to Electron runtime APIs', () => {
    expect(typesSource).not.toMatch(/from ['"]electron['"]/u);
    expect(typesSource).not.toContain('ElectronBridge');
    expect(typesSource).not.toContain('window.electronAPI');
  });
});
