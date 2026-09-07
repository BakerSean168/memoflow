/**
 * PrismaUserReminderPreferenceMapper Unit Tests
 *
 * Covers:
 * - toDomain: Prisma row to domain aggregate
 * - JSON parsing for time slots
 * - Edge cases (null/empty time slots and global master-gate defaults)
 */

import { describe, it, expect } from 'vitest';
import { PrismaUserReminderPreferenceMapper } from './prisma-user-reminder-preference-mapper';
import type { UserReminderPreference as PrismaUserReminderPreference } from '@memoflow/database';

// ─── Test Helpers ───────────────────────────────────────────────────

function createMinimalRow(): PrismaUserReminderPreference {
  const now = new Date();
  return {
    id: 'pref-1',
    identityId: 'identity-1',
    bestTimeSlots: null,
    worstTimeSlots: null,
    globalReminderEnabled: true,
    createdAt: now,
    updatedAt: now,
  } as PrismaUserReminderPreference;
}

function createFullRow(): PrismaUserReminderPreference {
  const now = new Date();
  return {
    id: 'pref-2',
    identityId: 'identity-2',
    bestTimeSlots: JSON.stringify([
      { startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 },
      { startHour: 14, startMinute: 0, endHour: 15, endMinute: 0 },
    ]),
    worstTimeSlots: JSON.stringify([
      { startHour: 22, startMinute: 0, endHour: 23, endMinute: 59 },
      { startHour: 0, startMinute: 0, endHour: 6, endMinute: 0 },
    ]),
    globalReminderEnabled: true,
    createdAt: now,
    updatedAt: now,
  } as PrismaUserReminderPreference;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('PrismaUserReminderPreferenceMapper', () => {
  describe('toDomain', () => {
    it('maps minimal Prisma row to domain aggregate', () => {
      const row = createMinimalRow();
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.id).toBe('pref-1');
      expect(domain.identityId).toBe('identity-1');
      expect(domain.bestTimeSlots).toEqual([]);
      expect(domain.worstTimeSlots).toEqual([]);
      expect(domain.globalReminderEnabled).toBe(true);
    });

    it('maps full Prisma row with all fields to domain', () => {
      const row = createFullRow();
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.id).toBe('pref-2');
      expect(domain.identityId).toBe('identity-2');
      expect(domain.bestTimeSlots).toHaveLength(2);
      expect(domain.worstTimeSlots).toHaveLength(2);
      expect(domain.globalReminderEnabled).toBe(true);
    });

    it('parses bestTimeSlots JSON correctly', () => {
      const row = createFullRow();
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.bestTimeSlots[0]).toEqual({
        startHour: 9,
        startMinute: 0,
        endHour: 10,
        endMinute: 0,
      });
      expect(domain.bestTimeSlots[1]).toEqual({
        startHour: 14,
        startMinute: 0,
        endHour: 15,
        endMinute: 0,
      });
    });

    it('parses worstTimeSlots JSON correctly', () => {
      const row = createFullRow();
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.worstTimeSlots[0]).toEqual({
        startHour: 22,
        startMinute: 0,
        endHour: 23,
        endMinute: 59,
      });
      expect(domain.worstTimeSlots[1]).toEqual({
        startHour: 0,
        startMinute: 0,
        endHour: 6,
        endMinute: 0,
      });
    });

    it('handles null bestTimeSlots as empty array', () => {
      const row = createMinimalRow();
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.bestTimeSlots).toEqual([]);
    });

    it('handles null worstTimeSlots as empty array', () => {
      const row = createMinimalRow();
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.worstTimeSlots).toEqual([]);
    });

    it('handles empty JSON arrays', () => {
      const row = {
        ...createMinimalRow(),
        bestTimeSlots: JSON.stringify([]),
        worstTimeSlots: JSON.stringify([]),
      };
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.bestTimeSlots).toEqual([]);
      expect(domain.worstTimeSlots).toEqual([]);
    });

    it('preserves timestamps', () => {
      const now = new Date();
      const row = { ...createMinimalRow(), createdAt: now, updatedAt: now };
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.createdAt).toEqual(now);
      expect(domain.updatedAt).toEqual(now);
    });

    it('defaults globalReminderEnabled to true when missing', () => {
      const row = {
        ...createMinimalRow(),
        globalReminderEnabled: null,
      };
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.globalReminderEnabled).toBe(true);
    });

    it('handles disabled globalReminderEnabled', () => {
      const row = {
        ...createMinimalRow(),
        globalReminderEnabled: false,
      };
      const domain = PrismaUserReminderPreferenceMapper.toDomain(row);

      expect(domain.globalReminderEnabled).toBe(false);
    });
  });
});
