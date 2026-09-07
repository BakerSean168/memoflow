import { describe, it, expect } from 'vitest';
import { UserReminderPreferences } from '../user-reminder-preferences';
import type { TimeSlotDTO } from '@memoflow/contracts/reminder';

// ===========================================================================
// Tests
// ===========================================================================

describe('UserReminderPreferences aggregate', () => {
  // -----------------------------------------------------------------------
  // Factory: create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    it('should create preferences with required fields', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });

      expect(prefs.identityId).toBe('id-1');
      expect(prefs.bestTimeSlots).toEqual([]);
      expect(prefs.worstTimeSlots).toEqual([]);
    });

    it('should generate a unique id', () => {
      const p1 = UserReminderPreferences.create({ identityId: 'id-1' });
      const p2 = UserReminderPreferences.create({ identityId: 'id-2' });
      expect(p1.id).not.toBe(p2.id);
    });

    it('should accept optional initial time slots', () => {
      const bestSlot: TimeSlotDTO = { hourStart: 9, hourEnd: 11, avgResponseRate: 85 };
      const worstSlot: TimeSlotDTO = { hourStart: 0, hourEnd: 5, avgResponseRate: 10 };

      const prefs = UserReminderPreferences.create({
        identityId: 'id-1',
        bestTimeSlots: [bestSlot],
        worstTimeSlots: [worstSlot],
      });

      expect(prefs.bestTimeSlots).toHaveLength(1);
      expect(prefs.worstTimeSlots).toHaveLength(1);
    });

  });

  // -----------------------------------------------------------------------
  // Factory: load()
  // -----------------------------------------------------------------------
  describe('load()', () => {
    it('should reconstruct preferences from state', () => {
      const now = new Date();
      const prefs = UserReminderPreferences.load({
        id: 'pref-1',
        identityId: 'id-1',
        bestTimeSlots: [{ hourStart: 9, hourEnd: 12, avgResponseRate: 90 }],
        worstTimeSlots: [],
        createdAt: now,
        updatedAt: now,
      });

      expect(prefs.id).toBe('pref-1');
      expect(prefs.bestTimeSlots).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // addBestTimeSlot()
  // -----------------------------------------------------------------------
  describe('addBestTimeSlot()', () => {
    it('should add a new best time slot', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });

      expect(prefs.bestTimeSlots).toHaveLength(1);
      expect(prefs.bestTimeSlots[0].avgResponseRate).toBe(85);
    });

    it('should sort by avgResponseRate descending', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 14, hourEnd: 16, avgResponseRate: 70 });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 90 });

      expect(prefs.bestTimeSlots[0].avgResponseRate).toBe(90);
      expect(prefs.bestTimeSlots[1].avgResponseRate).toBe(70);
    });

    it('should update an existing slot with same hours', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 70 });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 95 });

      expect(prefs.bestTimeSlots).toHaveLength(1);
      expect(prefs.bestTimeSlots[0].avgResponseRate).toBe(95);
    });

    it('should throw for invalid hourStart', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(() =>
        prefs.addBestTimeSlot({ hourStart: -1, hourEnd: 12, avgResponseRate: 50 }),
      ).toThrow('hourStart must be between 0 and 23');

      expect(() =>
        prefs.addBestTimeSlot({ hourStart: 24, hourEnd: 12, avgResponseRate: 50 }),
      ).toThrow('hourStart must be between 0 and 23');
    });

    it('should throw for invalid hourEnd', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(() =>
        prefs.addBestTimeSlot({ hourStart: 9, hourEnd: -1, avgResponseRate: 50 }),
      ).toThrow('hourEnd must be between 0 and 23');
    });

    it('should throw for invalid avgResponseRate', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(() =>
        prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 101 }),
      ).toThrow('avgResponseRate must be between 0 and 100');

      expect(() =>
        prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: -5 }),
      ).toThrow('avgResponseRate must be between 0 and 100');
    });
  });

  // -----------------------------------------------------------------------
  // addWorstTimeSlot()
  // -----------------------------------------------------------------------
  describe('addWorstTimeSlot()', () => {
    it('should add a new worst time slot', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 5 });
      expect(prefs.worstTimeSlots).toHaveLength(1);
    });

    it('should sort by avgResponseRate ascending', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 20 });
      prefs.addWorstTimeSlot({ hourStart: 22, hourEnd: 23, avgResponseRate: 5 });

      expect(prefs.worstTimeSlots[0].avgResponseRate).toBe(5);
      expect(prefs.worstTimeSlots[1].avgResponseRate).toBe(20);
    });

    it('should update an existing slot with same hours', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 10 });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 3 });
      expect(prefs.worstTimeSlots).toHaveLength(1);
      expect(prefs.worstTimeSlots[0].avgResponseRate).toBe(3);
    });

    it('should throw for invalid hours', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(() =>
        prefs.addWorstTimeSlot({ hourStart: -1, hourEnd: 5, avgResponseRate: 10 }),
      ).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // updateTimeSlots()
  // -----------------------------------------------------------------------
  describe('updateTimeSlots()', () => {
    it('should replace all time slots', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });

      prefs.updateTimeSlots(
        [{ hourStart: 14, hourEnd: 17, avgResponseRate: 90 }],
        [{ hourStart: 0, hourEnd: 4, avgResponseRate: 5 }],
      );

      expect(prefs.bestTimeSlots).toHaveLength(1);
      expect(prefs.bestTimeSlots[0].hourStart).toBe(14);
      expect(prefs.worstTimeSlots).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // getBestTimeSlot() / getWorstTimeSlot()
  // -----------------------------------------------------------------------
  describe('getBestTimeSlot()', () => {
    it('should return null when no slots', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(prefs.getBestTimeSlot()).toBeNull();
    });

    it('should return the highest rated slot', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 14, hourEnd: 16, avgResponseRate: 70 });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 95 });

      expect(prefs.getBestTimeSlot()!.avgResponseRate).toBe(95);
    });
  });

  describe('getWorstTimeSlot()', () => {
    it('should return null when no slots', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(prefs.getWorstTimeSlot()).toBeNull();
    });

    it('should return the lowest rated slot', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 15 });
      prefs.addWorstTimeSlot({ hourStart: 22, hourEnd: 23, avgResponseRate: 5 });

      expect(prefs.getWorstTimeSlot()!.avgResponseRate).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // isGoodTimeToRemind()
  // -----------------------------------------------------------------------
  describe('isGoodTimeToRemind()', () => {
    it('should return true for an hour in the best time slot', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });
      expect(prefs.isGoodTimeToRemind(10)).toBe(true);
    });

    it('should return false for an hour in the worst time slot', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 5 });
      expect(prefs.isGoodTimeToRemind(3)).toBe(false);
    });

    it('should return true for a neutral hour', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });
      prefs.addWorstTimeSlot({ hourStart: 0, hourEnd: 5, avgResponseRate: 5 });
      // 15 is neither in best nor worst
      expect(prefs.isGoodTimeToRemind(15)).toBe(true);
    });

    it('should prefer best slot when hour is in both best and worst', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });
      prefs.addWorstTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 5 });
      // Should return true because best is checked first
      expect(prefs.isGoodTimeToRemind(10)).toBe(true);
    });

    it('should throw for invalid hour', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(() => prefs.isGoodTimeToRemind(-1)).toThrow('hour must be between 0 and 23');
      expect(() => prefs.isGoodTimeToRemind(24)).toThrow('hour must be between 0 and 23');
    });

    it('should return true when no slots are configured', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      expect(prefs.isGoodTimeToRemind(12)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // toServerDTO() / toClientDTO()
  // -----------------------------------------------------------------------
  describe('toServerDTO()', () => {
    it('should return a valid server DTO', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });
      const dto = prefs.toServerDTO();

      expect(dto.identityId).toBe('id-1');
      expect(dto.bestTimeSlots).toHaveLength(1);
    });
  });

  describe('toClientDTO()', () => {
    it('should return a client DTO with text fields', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      prefs.addBestTimeSlot({ hourStart: 9, hourEnd: 12, avgResponseRate: 85 });
      const dto = prefs.toClientDTO();

      expect(dto.bestTimeSlotsText).toContain('09:00-12:00');
    });

    it('should return empty text when no slots', () => {
      const prefs = UserReminderPreferences.create({ identityId: 'id-1' });
      const dto = prefs.toClientDTO();
      expect(dto.bestTimeSlotsText).toBe('');
      expect(dto.worstTimeSlotsText).toBe('');
    });
  });
});
