import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(__dirname, 'desktop-main-runtime.ts'), 'utf8');
const profileRuntimeSource = fs.readFileSync(
  path.join(__dirname, 'profile/desktop-profile-runtime-manager.ts'),
  'utf8',
);
const windowManagerSource = fs.readFileSync(
  path.join(__dirname, 'lifecycle/window-manager.ts'),
  'utf8',
);

describe('Desktop Update shell ownership surface', () => {
  it('composes Desktop Update exactly once in initializeShellRuntime', () => {
    expect(mainSource.match(/composeDesktopUpdateShellRuntime\(/g)).toHaveLength(1);
    expect(mainSource.match(/new UpdateInstallCoordinator\(/g)).toHaveLength(1);
    expect(mainSource.match(/registerDesktopUpdateIpc\(/g)).toHaveLength(1);

    const shellStart = mainSource.indexOf('async function initializeShellRuntime');
    const composition = mainSource.indexOf('composeDesktopUpdateShellRuntime(');
    const businessModules = mainSource.indexOf('async function registerBusinessModules');

    expect(shellStart).toBeGreaterThan(-1);
    expect(composition).toBeGreaterThan(shellStart);
    expect(composition).toBeGreaterThan(businessModules);
  });

  it('guards shell initialization against duplicate process-owned composition', () => {
    expect(mainSource).toContain(
      "if (mainRuntime) {\n    logger.warn('Shell runtime is already initialized; reusing process-owned runtime');\n    return;",
    );
  });

  it('keeps Profile and BrowserWindow lifecycle owners away from updater construction/destruction', () => {
    for (const source of [profileRuntimeSource, windowManagerSource]) {
      expect(source).not.toContain('composeDesktopUpdateShellRuntime');
      expect(source).not.toContain('DesktopUpdateCoordinator');
      expect(source).not.toContain('desktopUpdateCoordinator.destroy');
    }
  });

  it('keeps Desktop Update destruction in the process runtime with an explicit update-handoff exception', () => {
    expect(runtimeSource.match(/desktopUpdateInstallCoordinator\.destroy\(\)/g)).toHaveLength(1);
    expect(runtimeSource.match(/desktopUpdateCoordinator\.destroy\(\)/g)).toHaveLength(1);
    expect(runtimeSource).toContain('if (!options.preserveDesktopUpdateForHandoff)');
    expect(runtimeSource).toContain(
      'update-install shutdown it must survive destructive application cleanup',
    );
  });

  it('registers canonical updater IPC only after the process-owned coordinator initializes', () => {
    const initialization = mainSource.indexOf('await desktopUpdateShell.coordinator.initialize()');
    const ipcRegistration = mainSource.indexOf('registerDesktopUpdateIpc({');

    expect(initialization).toBeGreaterThan(-1);
    expect(ipcRegistration).toBeGreaterThan(initialization);
    expect(mainSource).toContain('mainRuntime.setDesktopUpdateIpcDisposer');
    expect(runtimeSource).toContain('this._desktopUpdateIpcDisposer?.()');
  });

  it('verifies the device-local install receipt before ProfileRegistry initialization', () => {
    const verification = mainSource.indexOf('verifyPendingDesktopUpdateInstall(');
    const profileRegistry = mainSource.indexOf('const profileRegistry = new ProfileRegistry');

    expect(verification).toBeGreaterThan(-1);
    expect(profileRegistry).toBeGreaterThan(verification);
    expect(mainSource).toContain('new FileDesktopUpdateInstallReceiptStore');
  });
});
