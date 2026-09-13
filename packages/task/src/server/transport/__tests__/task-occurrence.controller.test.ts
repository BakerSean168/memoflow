import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail, isOk } from '@memoflow/contracts/result';
import { anIdentityId } from '../../../testing';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import {
  TaskOccurrenceController,
  type TaskOccurrenceUseCases,
} from '../task-occurrence.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUseCases(): TaskOccurrenceUseCases {
  return {
    getTaskOccurrence: vi.fn(),
    listByAccount: vi.fn(),
    listByTemplate: vi.fn(),
    listByStatus: vi.fn(),
    getByDateRange: vi.fn(),
    complete: vi.fn(),
    skip: vi.fn(),
    markMissed: vi.fn(),
    start: vi.fn(),
    deleteOccurrence: vi.fn(),
  } as unknown as TaskOccurrenceUseCases;
}

const TEST_IDENTITY_ID = anIdentityId();

const FAKE_INSTANCE_DTO: TaskOccurrenceClientDTO = {
  id: 'TaskOccurrenceId_550e8400-e29b-41d4-a716-446655440000' as TaskOccurrenceClientDTO['id'],
  planId: 'TaskPlanId_550e8400-e29b-41d4-a716-446655440001' as TaskOccurrenceClientDTO['planId'],
  identityId: TEST_IDENTITY_ID,
  occurrenceKey: 'TaskPlanId_550e8400-e29b-41d4-a716-446655440001:2026-09-13',
  scheduleSnapshot: {
    date: '2026-09-13' as TaskOccurrenceClientDTO['scheduleSnapshot']['date'],
    timing: { kind: 'AllDay' },
  },
  importanceSnapshot: 'Moderate',
  status: 'Pending',
  actualStartAt: null,
  result: null,
  checklistState: [],
  dueAt: 1_757_721_600_000,
  isOverdue: false,
  version: 1,
  createdAt: 1_000,
  updatedAt: 1_000,
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskOccurrenceController', () => {
  const ctx = { identityId: TEST_IDENTITY_ID } as any;
  let useCases: TaskOccurrenceUseCases;
  let controller: TaskOccurrenceController;

  beforeEach(() => {
    useCases = createMockUseCases();
    controller = new TaskOccurrenceController(useCases);
  });

  // =========================================================================
  // getOccurrence
  // =========================================================================
  describe('getOccurrence', () => {
    it('should call getTaskOccurrence use case with id', async () => {
      (useCases.getTaskOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_INSTANCE_DTO),
      );

      await controller.getOccurrence('inst_abc123', ctx);

      expect(useCases.getTaskOccurrence).toHaveBeenCalledWith('inst_abc123', TEST_IDENTITY_ID);
    });

    it('should pass through use case result directly', async () => {
      const expectedResult = ok(FAKE_INSTANCE_DTO);
      (useCases.getTaskOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.getOccurrence('inst_abc123', ctx);

      expect(result).toBe(expectedResult);
    });

    it('should return null result when occurrence not found', async () => {
      (useCases.getTaskOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(ok(null));

      const result = await controller.getOccurrence('inst_nonexistent', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBeNull();
      }
    });
  });

  // =========================================================================
  // listOccurrences — routing logic
  // =========================================================================
  describe('listOccurrences', () => {
    it('should call listByTemplate when planId is provided', async () => {
      (useCases.listByTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listOccurrences(TEST_IDENTITY_ID, { planId: 'tmpl_1' });

      expect(useCases.listByTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
      expect(useCases.listByStatus).not.toHaveBeenCalled();
      expect(useCases.listByAccount).not.toHaveBeenCalled();
    });

    it('should call listByStatus when status is provided (and no planId)', async () => {
      (useCases.listByStatus as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listOccurrences(TEST_IDENTITY_ID, { status: 'Pending' as any });

      expect(useCases.listByStatus).toHaveBeenCalledWith(TEST_IDENTITY_ID, 'Pending');
      expect(useCases.listByTemplate).not.toHaveBeenCalled();
      expect(useCases.listByAccount).not.toHaveBeenCalled();
    });

    it('should call listByAccount when no filters are provided', async () => {
      (useCases.listByAccount as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listOccurrences(TEST_IDENTITY_ID);

      expect(useCases.listByAccount).toHaveBeenCalledWith(TEST_IDENTITY_ID);
      expect(useCases.listByTemplate).not.toHaveBeenCalled();
      expect(useCases.listByStatus).not.toHaveBeenCalled();
    });

    it('should prioritize planId over status', async () => {
      (useCases.listByTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listOccurrences(TEST_IDENTITY_ID, {
        planId: 'tmpl_1',
        status: 'Pending' as any,
      });

      expect(useCases.listByTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
      expect(useCases.listByStatus).not.toHaveBeenCalled();
    });

    it('should call listByAccount when filters is empty object', async () => {
      (useCases.listByAccount as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listOccurrences(TEST_IDENTITY_ID, {});

      expect(useCases.listByAccount).toHaveBeenCalledWith(TEST_IDENTITY_ID);
    });
  });

  // =========================================================================
  // getOccurrencesByDateRange
  // =========================================================================
  describe('getOccurrencesByDateRange', () => {
    it('should call getByDateRange use case with all parameters', async () => {
      (useCases.getByDateRange as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ data: [FAKE_INSTANCE_DTO], total: 1 }),
      );

      await controller.getOccurrencesByDateRange(TEST_IDENTITY_ID, {
        startDate: 1000,
        endDate: 2000,
      });

      expect(useCases.getByDateRange).toHaveBeenCalledWith(TEST_IDENTITY_ID, 1000, 2000);
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'VALIDATION_ERROR', message: 'Invalid range' });
      (useCases.getByDateRange as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.getOccurrencesByDateRange(TEST_IDENTITY_ID, {
        startDate: 1000,
        endDate: 2000,
      });

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return ok with occurrences from use case result', async () => {
      (useCases.getByDateRange as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ data: [FAKE_INSTANCE_DTO], total: 1 }),
      );

      const result = await controller.getOccurrencesByDateRange(TEST_IDENTITY_ID, {
        startDate: 1000,
        endDate: 2000,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual([FAKE_INSTANCE_DTO]);
      }
    });
  });

  // =========================================================================
  // completeOccurrence
  // =========================================================================
  describe('completeOccurrence', () => {
    it('delegates parsed input to the use case (shape validation is adapter-owned)', async () => {
      // Phase 4: malformed shapes are rejected by the adapters before the
      // controller; the controller receives inferred input and delegates.
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeOccurrence('inst_1', { rating: 5 }, ctx);

      expect(useCases.complete).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });

    it('should accept empty object (all fields optional)', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeOccurrence('inst_1', {}, ctx);

      expect(useCases.complete).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should call complete use case with the parsed input', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeOccurrence('inst_1', {}, ctx);

      expect(useCases.complete).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should call complete use case with parsed data', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      await controller.completeOccurrence(
        'inst_1',
        {
          duration: 30,
          note: 'Done well',
          rating: 4,
        },
        ctx,
      );

      expect(useCases.complete).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {
        duration: 30,
        note: 'Done well',
        rating: 4,
      });
    });

    it('should unwrap result.data.occurrence', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeOccurrence('inst_1', {}, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_INSTANCE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Instance not found' });
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.completeOccurrence('inst_1', {}, ctx);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('does not validate rating shape at the controller (adapter-owned)', async () => {
      // Phase 4: rating bounds are enforced by CompleteTaskOccurrenceSchema in the
      // adapters; the controller delegates parsed input to the use case.
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeOccurrence('inst_1', { rating: 5 }, ctx);

      expect(useCases.complete).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });
  });

  // =========================================================================
  // skipOccurrence
  // =========================================================================
  describe('skipOccurrence', () => {
    it('should call skip use case with the parsed input', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipOccurrence('inst_1', {}, ctx);

      expect(useCases.skip).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should accept empty object (reason is optional)', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipOccurrence('inst_1', {}, ctx);

      expect(useCases.skip).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should call skip use case with reason', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      await controller.skipOccurrence('inst_1', { reason: 'Too tired' }, ctx);

      expect(useCases.skip).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {
        reason: 'Too tired',
      });
    });

    it('should unwrap result.data.occurrence', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipOccurrence('inst_1', {}, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_INSTANCE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Not found' });
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.skipOccurrence('inst_1', {}, ctx);

      expect(isOk(result)).toBe(false);
    });

    it('does not validate input type at the controller (adapter-owned)', async () => {
      // Phase 4: shape/type validation is enforced by SkipTaskOccurrenceSchema in
      // the adapters; the controller delegates parsed input to the use case.
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipOccurrence('inst_1', { reason: 'Too tired' }, ctx);

      expect(useCases.skip).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });
  });

  describe('markOccurrenceMissed', () => {
    it('delegates the explicit fact command and unwraps the occurrence', async () => {
      (useCases.markMissed as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ occurrence: { ...FAKE_INSTANCE_DTO, status: 'Missed' } }),
      );

      const result = await controller.markOccurrenceMissed(
        'inst_1',
        { reason: 'No completion evidence' },
        ctx,
      );

      expect(useCases.markMissed).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {
        reason: 'No completion evidence',
      });
      expect(isOk(result)).toBe(true);
    });
  });

  // =========================================================================
  // startOccurrence
  // =========================================================================
  describe('startOccurrence', () => {
    it('should call start use case with id', async () => {
      (useCases.start as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_INSTANCE_DTO));

      await controller.startOccurrence('inst_1', ctx);

      expect(useCases.start).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID);
    });

    it('should pass through use case result directly', async () => {
      const expectedResult = ok(FAKE_INSTANCE_DTO);
      (useCases.start as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.startOccurrence('inst_1', ctx);

      expect(result).toBe(expectedResult);
    });
  });

  // =========================================================================
  // deleteOccurrence
  // =========================================================================
  describe('deleteOccurrence', () => {
    it('should call deleteOccurrence use case with id', async () => {
      (useCases.deleteOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      await controller.deleteOccurrence('inst_1', ctx);

      expect(useCases.deleteOccurrence).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID);
    });

    it('should normalize success to ok(null)', async () => {
      (useCases.deleteOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      const result = await controller.deleteOccurrence('inst_1', ctx);

      expect(result).toEqual(ok(null));
    });
  });
});
