/**
 * Notification value-object surface locks.
 *
 * N4-2402B retires the legacy generic action/DND shapes rather than keeping
 * compatibility aliases. These assertions protect the vNext typed action and
 * QuietHours contract barrels from accidental legacy resurrection.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification vNext value-object surfaces', () => {
  const voDir = __dirname;
  const category = readFileSync(resolve(voDir, 'category-preference.ts'), 'utf8');
  const action = readFileSync(resolve(voDir, 'notification-action.ts'), 'utf8');
  const quietHours = readFileSync(resolve(voDir, 'quiet-hours.ts'), 'utf8');
  const metadata = readFileSync(resolve(voDir, 'notification-metadata.ts'), 'utf8');
  const index = readFileSync(resolve(voDir, 'index.ts'), 'utf8');

  it('keeps exact-match CategoryPreference and NotificationMetadata DTO aliases', () => {
    expect(category).toMatch(/export interface CategoryPreference\b/);
    expect(category).toContain('export type CategoryPreferenceDTO = CategoryPreference');
    expect(category).not.toMatch(/export interface CategoryPreferenceDTO\b/);
    expect(metadata).toMatch(/export interface NotificationMetadata\b/);
    expect(metadata).toContain('export type NotificationMetadataDTO = NotificationMetadata');
    expect(metadata).not.toMatch(/export interface NotificationMetadataDTO\b/);
  });

  it('owns typed notification actions as a discriminated union without generic mutation authority', () => {
    expect(action).toContain("kind: 'navigate'");
    expect(action).toContain("kind: 'owner-command'");
    expect(action).toContain("kind: 'archive'");
    expect(action).toContain('export type NotificationActionIntent =');
    expect(action).not.toContain('ApiCall');
    expect(action).not.toContain('Custom');
    expect(action).not.toMatch(/payload\s*:\s*unknown/);
  });

  it('owns Product-Time QuietHours instead of the legacy DoNotDisturbConfig contract', () => {
    expect(quietHours).toMatch(/export interface QuietHours\b/);
    expect(quietHours).toContain('timeZone: TimeZoneId');
    expect(quietHours).toContain('weeklyWindows: QuietHoursWindow[]');
    expect(quietHours).toContain('export type QuietHoursDTO = QuietHours');
    expect(index).toContain('QuietHours');
    expect(index).toContain('QuietHoursDTO');
    expect(index).not.toContain('DoNotDisturbConfig');
    expect(index).not.toContain('RateLimit');
  });

  it('barrel exports the vNext typed action surface', () => {
    for (const name of [
      'CategoryPreference',
      'CategoryPreferenceDTO',
      'NotificationAction',
      'NotificationActionDTO',
      'NotificationActionIntent',
      'NotificationEntityRef',
      'NotificationNavigationIntent',
      'NotificationMetadata',
      'NotificationMetadataDTO',
    ]) {
      expect(index).toContain(name);
    }
  });
});
