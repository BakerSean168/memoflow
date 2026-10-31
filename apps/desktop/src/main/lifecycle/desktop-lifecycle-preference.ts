import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Shell/device preference: independent of the active or locked Profile. */
export class DesktopLifecyclePreference {
  closeToTray = true;
  startHidden = true;

  constructor(private readonly filePath: string) {
    if (!existsSync(filePath)) return;
    try {
      const value = JSON.parse(readFileSync(filePath, 'utf8'));
      if (typeof value.closeToTray === 'boolean') this.closeToTray = value.closeToTray;
      if (typeof value.startHidden === 'boolean') this.startHidden = value.startHidden;
    } catch {
      console.warn('Desktop lifecycle preferences unavailable; using defaults');
    }
  }

  update(key: 'closeToTray' | 'startHidden', value: boolean): void {
    const next = { closeToTray: this.closeToTray, startHidden: this.startHidden, [key]: value };
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(`${this.filePath}.tmp`, JSON.stringify(next), 'utf8');
    renameSync(`${this.filePath}.tmp`, this.filePath);
    this[key] = value;
  }
}
