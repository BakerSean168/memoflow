import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail, isOk } from '@memoflow/contracts/result';
import { anIdentityId } from '../../../testing';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { TaskOccurrenceController, type TaskOccurrenceUseCases } from '../task-occurrence.controller';

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
    deleteInstance: vi.fn(),
  } as unknown as TaskOccurrenceUseCases;
}

const TEST_IDENTITY_ID = anIdentityId();

const FAKE_INSTANCE_DTO: TaskOccurrenceClientDTO = {
  id: 'inst_abc123',
  templateId: 'tmpl_abc123',
  identityId: TEST_IDENTITY_ID,
  instanceDate: 1000,
  timeConfig: { timeType: 'AllDay', startDate: null, timePoint: null, timeRange: null },
  importance: 'Moderate',
  priority: 1,
  status: 'Pending',
  isOverdue: false,
  actualStartTime: null,
  actualEndTime: null,
  comment: null,
  version: 1,
  createdAt: 1000,
  updatedAt: 1000,
  deletedAt: null,
} as unknown as TaskOccurrenceClientDTO;

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
  // getInstance
  // =========================================================================
  describe('getInstance', () => {
    it('should call getTaskOccurrence use case with id', async () => {
      (useCases.getTaskOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_INSTANCE_DTO),
      );

      await controller.getInstance('inst_abc123', ctx);

      expect(useCases.getTaskOccurrence).toHaveBeenCalledWith('inst_abc123', TEST_IDENTITY_ID);
    });

    it('should pass through use case result directly', async () => {
      const expectedResult = ok(FAKE_INSTANCE_DTO);
      (useCases.getTaskOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.getInstance('inst_abc123', ctx);

      expect(result).toBe(expectedResult);
    });

    it('should return null result when instance not found', async () => {
      (useCases.getTaskOccurrence as ReturnType<typeof vi.fn>).mockResolvedValue(ok(null));

      const result = await controller.getInstance('inst_nonexistent', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBeNull();
      }
    });
  });

  // =========================================================================
  // listInstances — routing logic
  // =========================================================================
  describe('listInstances', () => {
    it('should call listByTemplate when templateId is provided', async () => {
      (useCases.listByTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listInstances(TEST_IDENTITY_ID, { templateId: 'tmpl_1' });

      expect(useCases.listByTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
      expect(useCases.listByStatus).not.toHaveBeenCalled();
      expect(useCases.listByAccount).not.toHaveBeenCalled();
    });

    it('should call listByStatus when status is provided (and no templateId)', async () => {
      (useCases.listByStatus as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listInstances(TEST_IDENTITY_ID, { status: 'Pending' as any });

      expect(useCases.listByStatus).toHaveBeenCalledWith(TEST_IDENTITY_ID, 'Pending');
      expect(useCases.listByTemplate).not.toHaveBeenCalled();
      expect(useCases.listByAccount).not.toHaveBeenCalled();
    });

    it('should call listByAccount when no filters are provided', async () => {
      (useCases.listByAccount as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listInstances(TEST_IDENTITY_ID);

      expect(useCases.listByAccount).toHaveBeenCalledWith(TEST_IDENTITY_ID);
      expect(useCases.listByTemplate).not.toHaveBeenCalled();
      expect(useCases.listByStatus).not.toHaveBeenCalled();
    });

    it('should prioritize templateId over status', async () => {
      (useCases.listByTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listInstances(TEST_IDENTITY_ID, {
        templateId: 'tmpl_1',
        status: 'Pending' as any,
      });

      expect(useCases.listByTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
      expect(useCases.listByStatus).not.toHaveBeenCalled();
    });

    it('should call listByAccount when filters is empty object', async () => {
      (useCases.listByAccount as ReturnType<typeof vi.fn>).mockResolvedValue(ok([]));

      await controller.listInstances(TEST_IDENTITY_ID, {});

      expect(useCases.listByAccount).toHaveBeenCalledWith(TEST_IDENTITY_ID);
    });
  });

  // =========================================================================
  // getInstancesByDateRange
  // =========================================================================
  describe('getInstancesByDateRange', () => {
    it('should call getByDateRange use case with all parameters', async () => {
      (useCases.getByDateRange as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ data: [FAKE_INSTANCE_DTO], total: 1 }),
      );

      await controller.getInstancesByDateRange(TEST_IDENTITY_ID, {
        startDate: 1000,
        endDate: 2000,
      });

      expect(useCases.getByDateRange).toHaveBeenCalledWith(TEST_IDENTITY_ID, 1000, 2000);
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'VALIDATION_ERROR', message: 'Invalid range' });
      (useCases.getByDateRange as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.getInstancesByDateRange(TEST_IDENTITY_ID, {
        startDate: 1000,
        endDate: 2000,
      });

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return ok with instances from use case result', async () => {
      (useCases.getByDateRange as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ data: [FAKE_INSTANCE_DTO], total: 1 }),
      );

      const result = await controller.getInstancesByDateRange(TEST_IDENTITY_ID, {
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
  // completeInstance
  // =========================================================================
  describe('completeInstance', () => {
    it('delegates parsed input to the use case (shape validation is adapter-owned)', async () => {
      // Phase 4: malformed shapes are rejected by the adapters before the
      // controller; the controller receives inferred input and delegates.
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeInstance('inst_1', { rating: 5 }, ctx);

      expect(useCases.complete).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });

    it('should accept empty object (all fields optional)', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeInstance('inst_1', {}, ctx);

      expect(useCases.complete).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should call complete use case with the parsed input', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeInstance('inst_1', {}, ctx);

      expect(useCases.complete).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should call complete use case with parsed data', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      await controller.completeInstance(
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

    it('should unwrap result.data.instance', async () => {
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeInstance('inst_1', {}, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_INSTANCE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Instance not found' });
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.completeInstance('inst_1', {}, ctx);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('does not validate rating shape at the controller (adapter-owned)', async () => {
      // Phase 4: rating bounds are enforced by CompleteTaskOccurrenceSchema in the
      // adapters; the controller delegates parsed input to the use case.
      (useCases.complete as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.completeInstance('inst_1', { rating: 5 }, ctx);

      expect(useCases.complete).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });
  });

  // =========================================================================
  // skipInstance
  // =========================================================================
  describe('skipInstance', () => {
    it('should call skip use case with the parsed input', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipInstance('inst_1', {}, ctx);

      expect(useCases.skip).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should accept empty object (reason is optional)', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipInstance('inst_1', {}, ctx);

      expect(useCases.skip).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {});
      expect(isOk(result)).toBe(true);
    });

    it('should call skip use case with reason', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      await controller.skipInstance('inst_1', { reason: 'Too tired' }, ctx);

      expect(useCases.skip).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID, {
        reason: 'Too tired',
      });
    });

    it('should unwrap result.data.instance', async () => {
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipInstance('inst_1', {}, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_INSTANCE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Not found' });
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.skipInstance('inst_1', {}, ctx);

      expect(isOk(result)).toBe(false);
    });

    it('does not validate input type at the controller (adapter-owned)', async () => {
      // Phase 4: shape/type validation is enforced by SkipTaskOccurrenceSchema in
      // the adapters; the controller delegates parsed input to the use case.
      (useCases.skip as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: FAKE_INSTANCE_DTO }),
      );

      const result = await controller.skipInstance('inst_1', { reason: 'Too tired' }, ctx);

      expect(useCases.skip).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });
  });

  describe('markMissedInstance', () => {
    it('delegates the explicit fact command and unwraps the instance', async () => {
      (useCases.markMissed as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ instance: { ...FAKE_INSTANCE_DTO, status: 'Missed' } }),
      );

      const result = await controller.markMissedInstance(
        'inst_1',
        { reason: 'No completion evidence' },
        ctx,
      );

      expect(useCases.markMissed).toHaveBeenCalledWith(
        'inst_1',
        TEST_IDENTITY_ID,
        { reason: 'No completion evidence' },
      );
      expect(isOk(result)).toBe(true);
    });
  });

  // =========================================================================
  // startInstance
  // =========================================================================
  describe('startInstance', () => {
    it('should call start use case with id', async () => {
      (useCases.start as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_INSTANCE_DTO));

      await controller.startInstance('inst_1', ctx);

      expect(useCases.start).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID);
    });

    it('should pass through use case result directly', async () => {
      const expectedResult = ok(FAKE_INSTANCE_DTO);
      (useCases.start as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.startInstance('inst_1', ctx);

      expect(result).toBe(expectedResult);
    });
  });

  // =========================================================================
  // deleteInstance
  // =========================================================================
  describe('deleteInstance', () => {
    it('should call deleteInstance use case with id', async () => {
      (useCases.deleteInstance as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      await controller.deleteInstance('inst_1', ctx);

      expect(useCases.deleteInstance).toHaveBeenCalledWith('inst_1', TEST_IDENTITY_ID);
    });

    it('should normalize success to ok(null)', async () => {
      (useCases.deleteInstance as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      const result = await controller.deleteInstance('inst_1', ctx);

      expect(result).toEqual(ok(null));
    });
  });
});
