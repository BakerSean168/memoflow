import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 861: near-exact Client/Server dual bodies retired via Omit (not forced type X = Y).
 * ReminderResponseClientDTO = Omit<Server, 'identityId'>.
 * NotificationChannel contracts were retired by N4-2402A; this surface now locks the surviving Reminder pair only.
 * Instant/TransferDate duals remain separate (residual 859).
 */
describe('reminder response subset dual retired (residual 861)', () => {
  const reminderEntity = __dirname;
  const response = readFileSync(resolve(reminderEntity, 'reminder-response-server.ts'), 'utf8');
  const reminderIndex = readFileSync(resolve(reminderEntity, 'index.ts'), 'utf8');

  it('owns ReminderResponseClientDTO as Omit of Server without identityId', () => {
    expect(response).toContain('Residual 861');
    expect(response).toMatch(/export interface ReminderResponseServerDTO\b/);
    expect(response).toContain(
      "export type ReminderResponseClientDTO = Omit<ReminderResponseServerDTO, 'identityId'>",
    );
    expect(response).not.toMatch(/export interface ReminderResponseClientDTO\b/);
  });


  it('barrel still exports the surviving Reminder Client/Server pair', () => {
    for (const name of [
      'ReminderResponseServerDTO',
      'ReminderResponseClientDTO',
      'ReminderResponseAction',
    ]) {
      expect(reminderIndex).toContain(name);
    }
  });
});
