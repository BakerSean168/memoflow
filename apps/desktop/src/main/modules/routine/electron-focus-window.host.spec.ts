import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow } from 'electron';
import { RoutineWindowChannels, type FocusWindowProjection } from '@memoflow/contracts/electron';
import { ElectronFocusWindowHost } from './electron-focus-window.host';
import { ElectronFocusTaskbarAdapter } from './focus-window-taskbar.adapter';

const projection: FocusWindowProjection = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  protocolId: 'protocol-1',
  protocolName: '50/10',
  protocolVersion: 1,
  state: 'Running',
  version: 2,
  phaseId: 'focus',
  phaseKind: 'Focus',
  phaseIndex: 0,
  phaseCount: 2,
  cycle: 1,
  totalCycles: 1,
  phaseDurationMs: 3_000_000,
  phaseDeadline: 4_000_000,
  pausedRemainingMs: null,
  remainingMs: 1_500_000,
  terminationReason: null,
};

describe('ElectronFocusWindowHost (ROUTINE-4202)', () => {
  beforeEach(() => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    vi.clearAllMocks();
  });

  it('owns a dedicated focus BrowserWindow and treats native close as hide', () => {
    const host = new ElectronFocusWindowHost({
      isDev: true,
      devServerUrl: 'http://127.0.0.1:5173',
      preloadPath: '/tmp/preload.js',
    });

    host.show(projection);
    const window = host.browserWindow!;
    expect(window.options).toMatchObject({ width: 360, frame: false, show: false });
    expect(window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173#/focus-window');
    expect(window.isVisible()).toBe(true);
    expect(window.webContents.send).toHaveBeenCalledWith(
      RoutineWindowChannels.FOCUS_WINDOW_PROJECTION,
      projection,
    );

    window.close();
    expect(window.isDestroyed()).toBe(false);
    expect(window.isVisible()).toBe(false);

    host.show(projection);
    expect(host.browserWindow).toBe(window);
    host.destroy();
    expect(window.isDestroyed()).toBe(true);
  });

  it('keeps collapse/always-on-top/taskbar behavior in presentation infrastructure', () => {
    const host = new ElectronFocusWindowHost({ isDev: true, preloadPath: '/tmp/preload.js' });
    host.show(projection);
    const window = host.browserWindow!;

    host.setCollapsed(true);
    expect(window.getSize()[1]).toBe(104);
    expect(window.setMinimumSize).toHaveBeenCalledWith(320, 104);
    host.setAlwaysOnTop(true);
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');

    const taskbar = new ElectronFocusTaskbarAdapter(() => host.browserWindow);
    taskbar.update(projection);
    expect(window.setProgressBar).toHaveBeenCalledWith(0.5);
    taskbar.clear();
    expect(window.setProgressBar).toHaveBeenLastCalledWith(-1);
    host.destroy();
  });
});
