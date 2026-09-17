/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 4 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: notification-channel-vo-dto-dual.surface.spec.ts, notification-preference-vo-dto-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from notification-channel-vo-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 849: ChannelResponseDTO / ChannelErrorDTO / RateLimitDTO dual bodies retired.
   * Sole VO interface + `export type XDTO = X` for each exact-match pair.
   */
  describe('notification channel vo dto duals retired (residual 849)', () => {
    const voDir = __dirname;
    const response = readFileSync(resolve(voDir, 'channel-response.ts'), 'utf8');
    const error = readFileSync(resolve(voDir, 'channel-error.ts'), 'utf8');
    const rate = readFileSync(resolve(voDir, 'rate-limit.ts'), 'utf8');
    const index = readFileSync(resolve(voDir, 'index.ts'), 'utf8');

    it('owns ChannelResponseDTO as type alias of ChannelResponse', () => {
      expect(response).toContain('Residual 849');
      expect(response).toMatch(/export interface ChannelResponse\b/);
      expect(response).toContain('export type ChannelResponseDTO = ChannelResponse');
      expect(response).not.toMatch(/export interface ChannelResponseDTO\b/);
    });

    it('owns ChannelErrorDTO as type alias of ChannelError', () => {
      expect(error).toContain('Residual 849');
      expect(error).toMatch(/export interface ChannelError\b/);
      expect(error).toContain('export type ChannelErrorDTO = ChannelError');
      expect(error).not.toMatch(/export interface ChannelErrorDTO\b/);
    });

    it('owns RateLimitDTO as type alias of RateLimit; barrel still exports all six names', () => {
      expect(rate).toContain('Residual 849');
      expect(rate).toMatch(/export interface RateLimit\b/);
      expect(rate).toContain('export type RateLimitDTO = RateLimit');
      expect(rate).not.toMatch(/export interface RateLimitDTO\b/);
      expect(index).toContain('ChannelResponse');
      expect(index).toContain('ChannelResponseDTO');
      expect(index).toContain('ChannelError');
      expect(index).toContain('ChannelErrorDTO');
      expect(index).toContain('RateLimit');
      expect(index).toContain('RateLimitDTO');
    });
  });
}

// --- merged from notification-preference-vo-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 851: CategoryPreferenceDTO / NotificationActionDTO / DoNotDisturbConfigDTO /
   * NotificationMetadataDTO dual bodies retired.
   * Sole VO interface + `export type XDTO = X` for each exact-match pair.
   * Residual 877 (soft): ChannelConfig dual retired via ChannelPreference type alias
   *   (channel-config-preference-dual.surface.spec.ts).
   */
  describe('notification preference vo dto duals retired (residual 851)', () => {
    const voDir = __dirname;
    const category = readFileSync(resolve(voDir, 'category-preference.ts'), 'utf8');
    const action = readFileSync(resolve(voDir, 'notification-action.ts'), 'utf8');
    const dnd = readFileSync(resolve(voDir, 'do-not-disturb-config.ts'), 'utf8');
    const metadata = readFileSync(resolve(voDir, 'notification-metadata.ts'), 'utf8');
    const index = readFileSync(resolve(voDir, 'index.ts'), 'utf8');

    it('owns CategoryPreferenceDTO and NotificationActionDTO as type aliases', () => {
      expect(category).toContain('Residual 851');
      expect(category).toMatch(/export interface CategoryPreference\b/);
      expect(category).toContain('export type CategoryPreferenceDTO = CategoryPreference');
      expect(category).not.toMatch(/export interface CategoryPreferenceDTO\b/);
      expect(action).toContain('Residual 851');
      expect(action).toMatch(/export interface NotificationAction\b/);
      expect(action).toContain('export type NotificationActionDTO = NotificationAction');
      expect(action).not.toMatch(/export interface NotificationActionDTO\b/);
    });

    it('owns DoNotDisturbConfigDTO and NotificationMetadataDTO as type aliases', () => {
      expect(dnd).toContain('Residual 851');
      expect(dnd).toMatch(/export interface DoNotDisturbConfig\b/);
      expect(dnd).toContain('export type DoNotDisturbConfigDTO = DoNotDisturbConfig');
      expect(dnd).not.toMatch(/export interface DoNotDisturbConfigDTO\b/);
      expect(metadata).toContain('Residual 851');
      expect(metadata).toMatch(/export interface NotificationMetadata\b/);
      expect(metadata).toContain('export type NotificationMetadataDTO = NotificationMetadata');
      expect(metadata).not.toMatch(/export interface NotificationMetadataDTO\b/);
    });

    it('barrel still exports VO and DTO names for residual 851 duals', () => {
      for (const name of [
        'CategoryPreference',
        'CategoryPreferenceDTO',
        'NotificationAction',
        'NotificationActionDTO',
        'DoNotDisturbConfig',
        'DoNotDisturbConfigDTO',
        'NotificationMetadata',
        'NotificationMetadataDTO',
      ]) {
        expect(index).toContain(name);
      }
    });
  });
}
