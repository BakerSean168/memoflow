import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow, screen } from 'electron';
import {
  RoutineWindowChannels,
  type InterventionWindowProjection,
} from '@memoflow/contracts/electron';
import { ElectronInterventionWindowHost } from './electron-intervention-window.host';

const projection: InterventionWindowProjection = {
  identityId: 'identity-1',
  routineId: 'stand',
  occurrenceKey: 'routine:stand:0',
  state: 'Gentle',
  version: 2,
  dueAt: 1_000,
  phaseEnteredAt: 1_000,
  phaseDeadline: 121_000,
  remainingMs: 120_000,
};

const secondary = {
  workArea: { x: 1920, y: 40, width: 1600, height: 900 },
  workAreaSize: { width: 1600, height: 900 },
  bounds: { x: 1920, y: 0, width: 1600, height: 940 },
  scaleFactor: 1,
};

describe('ElectronInterventionWindowHost (ROUTINE-4104)', () => {
  beforeEach(() => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    vi.clearAllMocks();
  });

  it('shows inactive on the display nearest the cursor and never steals current focus', () => {
    const mainWindow = new BrowserWindow({ width: 1000, height: 700 });
    mainWindow.show();
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 2500, y: 500 });
    vi.mocked(screen.getDisplayNearestPoint).mockReturnValue(secondary as never);
    const host = new ElectronInterventionWindowHost({
      isDev: true,
      devServerUrl: 'http://127.0.0.1:5173',
      preloadPath: '/tmp/preload.js',
    });

    host.show(projection);
    const intervention = host.browserWindow!;

    expect(intervention.options).toMatchObject({
      width: 360,
      height: 196,
      frame: false,
      resizable: false,
      skipTaskbar: true,
    });
    expect(intervention.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173#/intervention-window');
    expect(intervention.getBounds()).toEqual({
      x: 3136,
      y: 720,
      width: 360,
      height: 196,
    });
    expect(intervention.isVisible()).toBe(true);
    expect(BrowserWindow.getFocusedWindow()).toBe(mainWindow);
    expect(intervention.webContents.send).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION,
      projection,
    );

    host.destroy();
    mainWindow.destroy();
  });

  it('turns native close into a controller request instead of destroying presentation state', () => {
    const host = new ElectronInterventionWindowHost({
      isDev: true,
      preloadPath: '/tmp/preload.js',
    });
    const closeRequested = vi.fn();
    host.onCloseRequested(closeRequested);
    host.show(projection);
    const window = host.browserWindow!;

    window.close();

    expect(closeRequested).toHaveBeenCalledTimes(1);
    expect(window.isDestroyed()).toBe(false);
    host.destroy();
    expect(window.isDestroyed()).toBe(true);
  });

  it('expands the same window for Guided and reconstructs projection after renderer reload', () => {
    const host = new ElectronInterventionWindowHost({
      isDev: true,
      preloadPath: '/tmp/preload.js',
    });
    host.show(projection);
    const window = host.browserWindow!;
    const guided = { ...projection, state: 'Guided' as const, version: 4, phaseDeadline: null };

    host.update(guided);
    expect(host.browserWindow).toBe(window);
    expect(window.getBounds().height).toBe(280);

    window.webContents.send.mockClear();
    window.webContents.emit('render-process-gone');
    expect(window.webContents.reload).toHaveBeenCalledTimes(1);
    window.webContents.emit('did-finish-load');
    expect(window.webContents.send).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION,
      guided,
    );
    host.destroy();
  });
});
