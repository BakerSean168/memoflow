import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * N4-2402B: product transport uses NotificationInboxPort only; operations are split.
 * No NotificationUseCases dual alias.
 */
describe('notification transport application port single-track surface', () => {
  const dir = __dirname;
  const controller = readFileSync(resolve(dir, 'notification.controller.ts'), 'utf8');
  const index = readFileSync(resolve(dir, 'index.ts'), 'utf8');

  it('does not dual-alias NotificationUseCases', () => {
    expect(controller).toContain('NotificationInboxPort');
    expect(controller).not.toContain('NotificationOperationsPort');
    expect(controller).not.toContain('NotificationApplicationPort');
    expect(controller).not.toContain('export type NotificationUseCases');
    expect(controller).not.toMatch(/NotificationUseCases\s*=/);
    expect(index).not.toContain('NotificationUseCases');
  });
});
