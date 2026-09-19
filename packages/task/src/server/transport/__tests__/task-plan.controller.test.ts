import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail, isOk } from '@memoflow/contracts/result';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { TaskPlanController, type TaskPlanUseCases } from '../task-plan.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUseCases(): TaskPlanUseCases {
  return {
    createPlan: vi.fn(),
    getPlan: vi.fn(),
    listPlans: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    activatePlan: vi.fn(),
    pausePlan: vi.fn(),
    archivePlan: vi.fn(),
  } as unknown as TaskPlanUseCases;
}

const FAKE_TEMPLATE_DTO: TaskPlanClientDTO = {
  id: 'tmpl_abc123',
  name: 'Test Template',
  status: 'Active',
  importance: 'Moderate',
  labels: [],
  createdAt: 1000,
  updatedAt: 1000,
} as unknown as TaskPlanClientDTO;

const VALID_CREATE_INPUT = {
  name: 'My Task',
  schedule: { kind: 'OneTime', date: '2026-09-08', timing: { kind: 'AllDay' } },
  importance: 'Moderate',
};

const VALID_UPDATE_INPUT = {
  name: 'Updated Name',
};

const TEST_IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskPlanController', () => {
  let useCases: TaskPlanUseCases;
  let controller: TaskPlanController;
  const ctx = { identityId: TEST_IDENTITY_ID } as any;

  beforeEach(() => {
    useCases = createMockUseCases();
    controller = new TaskPlanController(useCases);
  });

  // =========================================================================
  // createPlan
  // =========================================================================
  describe('createPlan', () => {
    it('delegates parsed input to the use case (shape validation is adapter-owned)', async () => {
      // Phase 4: transport shape validation moved to the adapters; the
      // controller receives inferred parsed input and delegates directly.
      (useCases.createPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, occurrenceCount: 0, todayOccurrenceCreated: false }),
      );

      const result = await controller.createPlan(VALID_CREATE_INPUT, ctx);

      expect(useCases.createPlan).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });

    it('should call createPlan use case with parsed data', async () => {
      (useCases.createPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, occurrenceCount: 0, todayOccurrenceCreated: false }),
      );

      await controller.createPlan(VALID_CREATE_INPUT, ctx);

      expect(useCases.createPlan).toHaveBeenCalledOnce();
      const args = (useCases.createPlan as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.identityId).toBe(TEST_IDENTITY_ID);
      expect(args.name).toBe('My Task');
      expect(args.schedule.kind).toBe('OneTime');
      expect(args.importance).toBe('Moderate');
    });

    it('should preserve generated-occurrence feedback in the transport response', async () => {
      (useCases.createPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, occurrenceCount: 5, todayOccurrenceCreated: true }),
      );

      const result = await controller.createPlan(VALID_CREATE_INPUT, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual({
          plan: FAKE_TEMPLATE_DTO,
          occurrenceCount: 5,
          todayOccurrenceCreated: true,
        });
      }
    });

    it('should forward use case failure without modification', async () => {
      const useCaseError = fail({
        code: 'VALIDATION_ERROR',
        message: 'Name too long',
      });
      (useCases.createPlan as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.createPlan(VALID_CREATE_INPUT, ctx);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toBe('Name too long');
      }
    });

    it('does not reject shapes at the controller (adapter-owned validation)', async () => {
      // Phase 4: malformed shapes are rejected by expressAdapterWithValidation /
      // ipcAdapterWithValidation before the controller; the controller only
      // receives parsed input and delegates.
      (useCases.createPlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, occurrenceCount: 0, todayOccurrenceCreated: false }),
      );

      const result = await controller.createPlan(
        {
          ...VALID_CREATE_INPUT,
          schedule: {
            kind: 'Recurring',
            startDate: '2026-09-08',
            timing: { kind: 'AllDay' },
            recurrence: {
              frequency: 'Daily',
              interval: 1,
              byWeekday: [],
              end: { kind: 'Count', count: 3 },
            },
          },
        },
        ctx,
      );

      expect(useCases.createPlan).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });
  });

  // =========================================================================
  // getPlan
  // =========================================================================
  describe('getPlan', () => {
    it('should call getPlan use case with id and identity', async () => {
      (useCases.getPlan as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_TEMPLATE_DTO));

      await controller.getPlan('tmpl_abc123', ctx);

      expect(useCases.getPlan).toHaveBeenCalledWith('tmpl_abc123', TEST_IDENTITY_ID);
    });

    it('should pass through use case result data directly', async () => {
      // GetTaskPlan use case returns ok(DTO | null) — NOT wrapped in { plan: ... }
      (useCases.getPlan as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_TEMPLATE_DTO));

      const result = await controller.getPlan('tmpl_abc123', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_TEMPLATE_DTO);
      }
    });

    it('should return null when plan not found', async () => {
      // GetTaskPlan use case returns ok(null) when not found
      (useCases.getPlan as ReturnType<typeof vi.fn>).mockResolvedValue(ok(null));

      const result = await controller.getPlan('tmpl_nonexistent', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBeNull();
      }
    });
  });

  // =========================================================================
  // listPlans
  // =========================================================================
  describe('listPlans', () => {
    it('should call listPlans use case with identityId', async () => {
      (useCases.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plans: [], total: 0 }),
      );

      await controller.listPlans(undefined, ctx);

      expect(useCases.listPlans).toHaveBeenCalledOnce();
      const args = (useCases.listPlans as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.identityId).toBe(TEST_IDENTITY_ID);
    });

    it('should wrap single status into array', async () => {
      (useCases.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plans: [], total: 0 }),
      );

      await controller.listPlans({ status: ['Active'] }, ctx);

      const args = (useCases.listPlans as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.status).toEqual(['Active']);
    });

    it('should pass through Goal+KR and Shared Label filters', async () => {
      (useCases.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plans: [], total: 0 }),
      );

      await controller.listPlans(
        {
          goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440002' as any,
          keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440003' as any,
          labelIdsAll: ['label-1', 'label-2'],
        },
        ctx,
      );

      const args = (useCases.listPlans as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.goalId).toBe('GoalId_550e8400-e29b-41d4-a716-446655440002');
      expect(args.keyResultId).toBe('KeyResultId_550e8400-e29b-41d4-a716-446655440003');
      expect(args.labelIdsAll).toEqual(['label-1', 'label-2']);
    });

    it('should return plans and total', async () => {
      const plans = [FAKE_TEMPLATE_DTO];
      (useCases.listPlans as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plans, total: 1 }),
      );

      const result = await controller.listPlans(undefined, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual({ plans, total: 1 });
      }
    });
  });

  // =========================================================================
  // updatePlan
  // =========================================================================
  describe('updatePlan', () => {
    it('delegates parsed input to the use case (shape validation is adapter-owned)', async () => {
      // Phase 4: malformed shapes are rejected by the adapters before the
      // controller; the controller receives inferred input and delegates.
      (useCases.updatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      const result = await controller.updatePlan('tmpl_1', VALID_UPDATE_INPUT, ctx);

      expect(useCases.updatePlan).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });

    it('should call updatePlan use case with id and parsed data', async () => {
      (useCases.updatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      await controller.updatePlan('tmpl_1', VALID_UPDATE_INPUT, ctx);

      expect(useCases.updatePlan).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID, {
        name: 'Updated Name',
        description: undefined,
        schedule: undefined,
        reminderConfig: undefined,
        importance: undefined,
        labelIds: undefined,
        goalBinding: undefined,
        completionPolicy: undefined,
      });
    });

    it('should return use case result directly (no unwrap)', async () => {
      const expectedResult = ok(FAKE_TEMPLATE_DTO);
      (useCases.updatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.updatePlan('tmpl_1', VALID_UPDATE_INPUT, ctx);

      expect(result).toBe(expectedResult);
    });

    it('should accept empty object (all fields optional)', async () => {
      (useCases.updatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      const result = await controller.updatePlan('tmpl_1', {}, ctx);

      expect(isOk(result)).toBe(true);
      expect(useCases.updatePlan).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // deletePlan
  // =========================================================================
  describe('deletePlan', () => {
    it('should call deletePlan use case with id', async () => {
      (useCases.deletePlan as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      await controller.deletePlan('tmpl_1', ctx);

      expect(useCases.deletePlan).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should normalize success to ok(null)', async () => {
      (useCases.deletePlan as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      const result = await controller.deletePlan('tmpl_1', ctx);

      expect(result).toEqual(ok(null));
    });
  });

  // =========================================================================
  // activatePlan
  // =========================================================================
  describe('activatePlan', () => {
    it('should call activatePlan use case with id', async () => {
      (useCases.activatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, occurrencesGenerated: 10 }),
      );

      await controller.activatePlan('tmpl_1', ctx);

      expect(useCases.activatePlan).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should unwrap result.data.plan', async () => {
      (useCases.activatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, occurrencesGenerated: 10 }),
      );

      const result = await controller.activatePlan('tmpl_1', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_TEMPLATE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Template not found' });
      (useCases.activatePlan as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.activatePlan('tmpl_1', ctx);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // pausePlan
  // =========================================================================
  describe('pausePlan', () => {
    it('should call pausePlan use case with id', async () => {
      (useCases.pausePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, instancesDeleted: 3 }),
      );

      await controller.pausePlan('tmpl_1', ctx);

      expect(useCases.pausePlan).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should unwrap result.data.plan', async () => {
      (useCases.pausePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ plan: FAKE_TEMPLATE_DTO, instancesDeleted: 3 }),
      );

      const result = await controller.pausePlan('tmpl_1', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_TEMPLATE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Not found' });
      (useCases.pausePlan as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.pausePlan('tmpl_1', ctx);

      expect(isOk(result)).toBe(false);
    });
  });

  // =========================================================================
  // archivePlan
  // =========================================================================
  describe('archivePlan', () => {
    it('should call archivePlan use case with id', async () => {
      (useCases.archivePlan as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      await controller.archivePlan('tmpl_1', ctx);

      expect(useCases.archivePlan).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should pass through use case result directly (no unwrap)', async () => {
      const expectedResult = ok(FAKE_TEMPLATE_DTO);
      (useCases.archivePlan as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.archivePlan('tmpl_1', ctx);

      // archivePlan passes through directly (no .data.plan unwrap)
      expect(result).toBe(expectedResult);
    });
  });
});
