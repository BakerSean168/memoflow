import { describe, it, expect } from 'vitest';
import { ReminderGroup } from '../reminder-group';
import type { ReminderGroupState } from '../reminder-group';
import { ReminderStatus } from '@memoflow/contracts/reminder';
import { IdentityId } from '@memoflow/domain-shared';
import { GroupStats } from '../../value-objects';
import { generateUUID } from '@memoflow/utils/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroupState(overrides: Partial<ReminderGroupState> = {}): ReminderGroupState {
  const now = new Date();
  return {
    id: generateUUID(),
    identityId: IdentityId.generate(),
    name: 'Test Group',
    description: null,
    enabled: true,
    status: ReminderStatus.Active,
    order: 0,
    color: null,
    icon: null,
    stats: GroupStats.createEmpty(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('ReminderGroup aggregate', () => {
  // -----------------------------------------------------------------------
  // Factory: create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    it('should create a group with required fields', () => {
      const group = ReminderGroup.create({
        identityId: String(IdentityId.generate()),
        name: 'Morning Reminders',
      });

      expect(group.name).toBe('Morning Reminders');
      expect(group.enabled).toBe(true);
      expect(group.status).toBe(ReminderStatus.Active);
      expect(group.version).toBe(1);
      expect(group.deletedAt).toBeNull();
    });

    it('should generate a unique id', () => {
      const g1 = ReminderGroup.create({ identityId: 'id1', name: 'G1' });
      const g2 = ReminderGroup.create({ identityId: 'id2', name: 'G2' });
      expect(g1.id).not.toBe(g2.id);
    });

    it('should apply optional fields when provided', () => {
      const group = ReminderGroup.create({
        identityId: String(IdentityId.generate()),
        name: 'Custom',
        description: 'Desc',
        color: '#AABB00',
        icon: 'folder',
        order: 5,
      });

      expect(group.description).toBe('Desc');
      expect(group.color).toBe('#AABB00');
      expect(group.icon).toBe('folder');
      expect(group.order).toBe(5);
    });

    it('should emit a ReminderGroupCreated domain event', () => {
      const group = ReminderGroup.create({
        identityId: String(IdentityId.generate()),
        name: 'Event Test',
      });
      const events = group.pullDomainEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const createdEvent = events.find((e) => e.eventType === 'reminder:group-created');
      expect(createdEvent).toBeDefined();
    });

    it('should initialize stats as empty', () => {
      const group = ReminderGroup.create({ identityId: 'id1', name: 'Stats' });
      expect(group.stats.totalTemplates).toBe(0);
      expect(group.stats.activeTemplates).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Factory: load()
  // -----------------------------------------------------------------------
  describe('load()', () => {
    it('should reconstruct a group from state', () => {
      const state = makeGroupState({ name: 'Loaded Group', version: 3 });
      const group = ReminderGroup.load(state);
      expect(group.name).toBe('Loaded Group');
      expect(group.version).toBe(3);
    });

    it('should not emit domain events on load', () => {
      const group = ReminderGroup.load(makeGroupState());
      const events = group.pullDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Control mode switching
  // -----------------------------------------------------------------------
  describe('enable()', () => {
    it('should enable the group', () => {
      const group = ReminderGroup.load(
        makeGroupState({ enabled: false, status: ReminderStatus.Paused }),
      );
      group.enable();
      expect(group.enabled).toBe(true);
      expect(group.status).toBe(ReminderStatus.Active);
    });

    it('should emit reminder:group-enabled event', () => {
      const group = ReminderGroup.load(
        makeGroupState({ enabled: false, status: ReminderStatus.Paused }),
      );
      group.enable();
      const events = group.pullDomainEvents();
      expect(events.some((e) => e.eventType === 'reminder:group-enabled')).toBe(true);
    });
  });

  describe('pause()', () => {
    it('should pause the group', () => {
      const group = ReminderGroup.load(makeGroupState());
      group.pause();
      expect(group.enabled).toBe(false);
      expect(group.status).toBe(ReminderStatus.Paused);
    });

    it('should emit reminder:group-paused event', () => {
      const group = ReminderGroup.load(makeGroupState());
      group.pause();
      const events = group.pullDomainEvents();
      expect(events.some((e) => e.eventType === 'reminder:group-paused')).toBe(true);
    });
  });

  describe('toggle()', () => {
    it('should pause an enabled group', () => {
      const group = ReminderGroup.load(makeGroupState({ enabled: true }));
      group.toggle();
      expect(group.enabled).toBe(false);
    });

    it('should enable a disabled group', () => {
      const group = ReminderGroup.load(
        makeGroupState({ enabled: false, status: ReminderStatus.Paused }),
      );
      group.toggle();
      expect(group.enabled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // enableAllTemplates() / pauseAllTemplates()
  // -----------------------------------------------------------------------
  describe('legacy enableAllTemplates()/pauseAllTemplates() aliases', () => {
    it('only changes the profile gate', () => {
      const group = ReminderGroup.load(
        makeGroupState({ enabled: false, status: ReminderStatus.Paused }),
      );
      group.enableAllTemplates();
      expect(group.enabled).toBe(true);
      expect(group.status).toBe(ReminderStatus.Active);

      group.pauseAllTemplates();
      expect(group.enabled).toBe(false);
      expect(group.status).toBe(ReminderStatus.Paused);
    });
  });

  // -----------------------------------------------------------------------
  // activate() / softDelete() / restore()
  // -----------------------------------------------------------------------
  describe('activate()', () => {
    it('should set status to Active and clear deletedAt', () => {
      const group = ReminderGroup.load(
        makeGroupState({ status: ReminderStatus.Paused, deletedAt: new Date() }),
      );
      group.activate();
      expect(group.status).toBe(ReminderStatus.Active);
      expect(group.deletedAt).toBeNull();
    });
  });

  describe('softDelete()', () => {
    it('should set deletedAt and pause', () => {
      const group = ReminderGroup.load(makeGroupState());
      group.softDelete();
      expect(group.deletedAt).not.toBeNull();
      expect(group.status).toBe(ReminderStatus.Paused);
    });

    it('should emit ReminderGroupDeleted event', () => {
      const group = ReminderGroup.load(makeGroupState());
      group.softDelete();
      const events = group.pullDomainEvents();
      expect(events.some((e) => e.eventType === 'reminder:group-deleted')).toBe(true);
    });
  });

  describe('restore()', () => {
    it('should clear deletedAt and set Active', () => {
      const group = ReminderGroup.load(
        makeGroupState({ deletedAt: new Date(), status: ReminderStatus.Paused }),
      );
      group.restore();
      expect(group.deletedAt).toBeNull();
      expect(group.status).toBe(ReminderStatus.Active);
    });
  });

  // -----------------------------------------------------------------------
  // toServerDTO() / toClientDTO()
  // -----------------------------------------------------------------------
  describe('toServerDTO()', () => {
    it('should return a valid server DTO', () => {
      const group = ReminderGroup.load(makeGroupState({ name: 'DTO Test' }));
      const dto = group.toServerDTO();
      expect(dto.name).toBe('DTO Test');
      expect(dto.stats).toBeDefined();
    });
  });

  describe('toClientDTO()', () => {
    it('should return a client DTO with data fields', () => {
      const group = ReminderGroup.load(
        makeGroupState({
          name: 'Client DTO',
            status: ReminderStatus.Active,
        }),
      );
      const dto = group.toClientDTO();
      expect(dto.name).toBe('Client DTO');
      expect(dto.status).toBe('Active');
    });
  });
});
