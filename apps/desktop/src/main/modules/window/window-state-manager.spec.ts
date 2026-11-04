import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WindowStateManager } from './window-state-manager';

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function statePath(contents?: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), 'mf-window-state-'));
  roots.push(root);
  const file = path.join(root, 'profile-access-window-state.json');
  if (contents !== undefined) writeFileSync(file, JSON.stringify(contents));
  return file;
}

describe('WindowStateManager', () => {
  it('falls back to the configured default size when no state was persisted', () => {
    const manager = new WindowStateManager('profile-access', {
      defaultWidth: 1024,
      defaultHeight: 640,
      minimumWidth: 1024,
      minimumHeight: 640,
      stateFilePath: statePath(),
    });

    expect(manager.width).toBe(1024);
    expect(manager.height).toBe(640);
  });

  it('clamps a persisted pre-redesign size up to the new lower bound', () => {
    const manager = new WindowStateManager('profile-access', {
      defaultWidth: 1024,
      defaultHeight: 640,
      minimumWidth: 1024,
      minimumHeight: 640,
      stateFilePath: statePath({ width: 420, height: 580, isMaximized: false }),
    });

    expect(manager.width).toBe(1024);
    expect(manager.height).toBe(640);
  });

  it('keeps a persisted size that is already at or above the bound', () => {
    const manager = new WindowStateManager('profile-access', {
      defaultWidth: 1024,
      defaultHeight: 640,
      minimumWidth: 1024,
      minimumHeight: 640,
      stateFilePath: statePath({ width: 1180, height: 700, isMaximized: false }),
    });

    expect(manager.width).toBe(1180);
    expect(manager.height).toBe(700);
  });

  it('persists the pinned height while the window shows a taller layout state', () => {
    const file = statePath();
    const manager = new WindowStateManager('profile-access', {
      defaultWidth: 1024,
      defaultHeight: 640,
      minimumWidth: 1024,
      minimumHeight: 640,
      stateFilePath: file,
    });
    const listeners = new Map<string, () => void>();
    const window = {
      getBounds: () => ({ x: 10, y: 20, width: 1024, height: 780 }),
      isMaximized: () => false,
      on: (event: string, handler: () => void) => {
        listeners.set(event, handler);
      },
      maximize: () => undefined,
    };

    manager.pinHeight(640);
    manager.manage(window as never);
    listeners.get('close')!();

    const saved = JSON.parse(readFileSync(file, 'utf8')) as { width: number; height: number };
    expect(saved.width).toBe(1024);
    expect(saved.height).toBe(640);
  });
});
