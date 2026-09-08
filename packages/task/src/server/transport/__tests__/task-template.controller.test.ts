import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail, isOk } from '@memoflow/contracts/result';
import type { QueryTaskTemplateGraphRes, TaskTemplateClientDTO } from '@memoflow/contracts/task';
import { TaskType } from '@memoflow/contracts/task';
import { TaskTemplateController, type TaskTemplateUseCases } from '../task-template.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUseCases(): TaskTemplateUseCases {
  return {
    createTemplate: vi.fn(),
    getTemplate: vi.fn(),
    listTemplates: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    activateTemplate: vi.fn(),
    pauseTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
  } as unknown as TaskTemplateUseCases;
}

const FAKE_TEMPLATE_DTO: TaskTemplateClientDTO = {
  id: 'tmpl_abc123',
  name: 'Test Template',
  taskType: TaskType.Recurring,
  status: 'Active',
  importance: 'Moderate',
  labels: [],
  createdAt: 1000,
  updatedAt: 1000,
} as unknown as TaskTemplateClientDTO;

const VALID_CREATE_INPUT = {
  name: 'My Task',
  taskType: TaskType.OneTime,
  timeConfig: { timeType: 'AllDay', startDate: null, timePoint: null },
  importance: 'Moderate',
};

const VALID_UPDATE_INPUT = {
  name: 'Updated Name',
};

const TEST_IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskTemplateController', () => {
  let useCases: TaskTemplateUseCases;
  let controller: TaskTemplateController;
  const ctx = { identityId: TEST_IDENTITY_ID } as any;

  beforeEach(() => {
    useCases = createMockUseCases();
    controller = new TaskTemplateController(useCases);
  });

  // =========================================================================
  // createTemplate
  // =========================================================================
  describe('createTemplate', () => {
    it('delegates parsed input to the use case (shape validation is adapter-owned)', async () => {
      // Phase 4: transport shape validation moved to the adapters; the
      // controller receives inferred parsed input and delegates directly.
      (useCases.createTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instanceCount: 0, todayInstanceCreated: false }),
      );

      const result = await controller.createTemplate(VALID_CREATE_INPUT, ctx);

      expect(useCases.createTemplate).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });

    it('should call createTemplate use case with parsed data', async () => {
      (useCases.createTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instanceCount: 0, todayInstanceCreated: false }),
      );

      const result = await controller.createTemplate(VALID_CREATE_INPUT, ctx);

      expect(useCases.createTemplate).toHaveBeenCalledOnce();
      const args = (useCases.createTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.identityId).toBe(TEST_IDENTITY_ID);
      expect(args.name).toBe('My Task');
      expect(args.taskType).toBe(TaskType.OneTime);
      expect(args.importance).toBe('Moderate');
    });

    it('should preserve generated-instance feedback in the transport response', async () => {
      (useCases.createTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instanceCount: 5, todayInstanceCreated: true }),
      );

      const result = await controller.createTemplate(VALID_CREATE_INPUT, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual({
          template: FAKE_TEMPLATE_DTO,
          instanceCount: 5,
          todayInstanceCreated: true,
        });
      }
    });

    it('should forward use case failure without modification', async () => {
      const useCaseError = fail({
        code: 'VALIDATION_ERROR',
        message: 'Name too long',
      });
      (useCases.createTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.createTemplate(VALID_CREATE_INPUT, ctx);

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
      (useCases.createTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instanceCount: 0, todayInstanceCreated: false }),
      );

      const result = await controller.createTemplate(
        {
          ...VALID_CREATE_INPUT,
          recurrenceRule: {
            frequency: 'Daily',
            interval: 1,
            daysOfWeek: [],
            endDate: Date.now() + 86400000,
            occurrences: 3,
          },
        },
        ctx,
      );

      expect(useCases.createTemplate).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });
  });

  // =========================================================================
  // getTemplate
  // =========================================================================
  describe('getTemplate', () => {
    it('should call getTemplate use case with id and default includeChildren=false', async () => {
      (useCases.getTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_TEMPLATE_DTO));

      await controller.getTemplate('tmpl_abc123', ctx);

      expect(useCases.getTemplate).toHaveBeenCalledWith('tmpl_abc123', TEST_IDENTITY_ID, false);
    });

    it('should call getTemplate use case with includeChildren=true', async () => {
      (useCases.getTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_TEMPLATE_DTO));

      await controller.getTemplate('tmpl_abc123', ctx, true);

      expect(useCases.getTemplate).toHaveBeenCalledWith('tmpl_abc123', TEST_IDENTITY_ID, true);
    });

    it('should pass through use case result data directly', async () => {
      // GetTaskTemplate use case returns ok(DTO | null) — NOT wrapped in { template: ... }
      (useCases.getTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok(FAKE_TEMPLATE_DTO));

      const result = await controller.getTemplate('tmpl_abc123', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_TEMPLATE_DTO);
      }
    });

    it('should return null when template not found', async () => {
      // GetTaskTemplate use case returns ok(null) when not found
      (useCases.getTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok(null));

      const result = await controller.getTemplate('tmpl_nonexistent', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBeNull();
      }
    });
  });

  // =========================================================================
  // listTemplates
  // =========================================================================
  describe('listTemplates', () => {
    it('should call listTemplates use case with identityId', async () => {
      (useCases.listTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ templates: [], total: 0 }),
      );

      await controller.listTemplates(undefined, ctx);

      expect(useCases.listTemplates).toHaveBeenCalledOnce();
      const args = (useCases.listTemplates as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.identityId).toBe(TEST_IDENTITY_ID);
    });

    it('should wrap single status into array', async () => {
      (useCases.listTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ templates: [], total: 0 }),
      );

      await controller.listTemplates({ status: ['Active'] }, ctx);

      const args = (useCases.listTemplates as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.status).toEqual(['Active']);
    });

    it('should pass through goalId and Shared Label filters', async () => {
      (useCases.listTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ templates: [], total: 0 }),
      );

      await controller.listTemplates(
        {
          goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440002' as any,
          labelIdsAll: ['label-1', 'label-2'],
        },
        ctx,
      );

      const args = (useCases.listTemplates as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.goalId).toBe('GoalId_550e8400-e29b-41d4-a716-446655440002');
      expect(args.labelIdsAll).toEqual(['label-1', 'label-2']);
    });

    it('should return templates and total', async () => {
      const templates = [FAKE_TEMPLATE_DTO];
      (useCases.listTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ templates, total: 1 }),
      );

      const result = await controller.listTemplates(undefined, ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual({ templates, total: 1 });
      }
    });
  });


  // =========================================================================
  // updateTemplate
  // =========================================================================
  describe('updateTemplate', () => {
    it('delegates parsed input to the use case (shape validation is adapter-owned)', async () => {
      // Phase 4: malformed shapes are rejected by the adapters before the
      // controller; the controller receives inferred input and delegates.
      (useCases.updateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      const result = await controller.updateTemplate('tmpl_1', VALID_UPDATE_INPUT, ctx);

      expect(useCases.updateTemplate).toHaveBeenCalledOnce();
      expect(isOk(result)).toBe(true);
    });

    it('should call updateTemplate use case with id and parsed data', async () => {
      (useCases.updateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      await controller.updateTemplate('tmpl_1', VALID_UPDATE_INPUT, ctx);

      expect(useCases.updateTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID, {
        name: 'Updated Name',
        description: undefined,
        timeConfig: undefined,
        recurrenceRule: undefined,
        reminderConfig: undefined,
        importance: undefined,
        labelIds: undefined,
        goalBinding: undefined,
        completionPolicy: undefined,
      });
    });

    it('should return use case result directly (no unwrap)', async () => {
      const expectedResult = ok(FAKE_TEMPLATE_DTO);
      (useCases.updateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.updateTemplate('tmpl_1', VALID_UPDATE_INPUT, ctx);

      expect(result).toBe(expectedResult);
    });

    it('should accept empty object (all fields optional)', async () => {
      (useCases.updateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      const result = await controller.updateTemplate('tmpl_1', {}, ctx);

      expect(isOk(result)).toBe(true);
      expect(useCases.updateTemplate).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // deleteTemplate
  // =========================================================================
  describe('deleteTemplate', () => {
    it('should call deleteTemplate use case with id', async () => {
      (useCases.deleteTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      await controller.deleteTemplate('tmpl_1', ctx);

      expect(useCases.deleteTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should normalize success to ok(null)', async () => {
      (useCases.deleteTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(ok(undefined));

      const result = await controller.deleteTemplate('tmpl_1', ctx);

      expect(result).toEqual(ok(null));
    });
  });

  // =========================================================================
  // activateTemplate
  // =========================================================================
  describe('activateTemplate', () => {
    it('should call activateTemplate use case with id', async () => {
      (useCases.activateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instancesGenerated: 10 }),
      );

      await controller.activateTemplate('tmpl_1', ctx);

      expect(useCases.activateTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should unwrap result.data.template', async () => {
      (useCases.activateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instancesGenerated: 10 }),
      );

      const result = await controller.activateTemplate('tmpl_1', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_TEMPLATE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Template not found' });
      (useCases.activateTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.activateTemplate('tmpl_1', ctx);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // pauseTemplate
  // =========================================================================
  describe('pauseTemplate', () => {
    it('should call pauseTemplate use case with id', async () => {
      (useCases.pauseTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instancesDeleted: 3 }),
      );

      await controller.pauseTemplate('tmpl_1', ctx);

      expect(useCases.pauseTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should unwrap result.data.template', async () => {
      (useCases.pauseTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ template: FAKE_TEMPLATE_DTO, instancesDeleted: 3 }),
      );

      const result = await controller.pauseTemplate('tmpl_1', ctx);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBe(FAKE_TEMPLATE_DTO);
      }
    });

    it('should forward use case failure', async () => {
      const useCaseError = fail({ code: 'NOT_FOUND', message: 'Not found' });
      (useCases.pauseTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(useCaseError);

      const result = await controller.pauseTemplate('tmpl_1', ctx);

      expect(isOk(result)).toBe(false);
    });
  });

  // =========================================================================
  // archiveTemplate
  // =========================================================================
  describe('archiveTemplate', () => {
    it('should call archiveTemplate use case with id', async () => {
      (useCases.archiveTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok(FAKE_TEMPLATE_DTO),
      );

      await controller.archiveTemplate('tmpl_1', ctx);

      expect(useCases.archiveTemplate).toHaveBeenCalledWith('tmpl_1', TEST_IDENTITY_ID);
    });

    it('should pass through use case result directly (no unwrap)', async () => {
      const expectedResult = ok(FAKE_TEMPLATE_DTO);
      (useCases.archiveTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(expectedResult);

      const result = await controller.archiveTemplate('tmpl_1', ctx);

      // archiveTemplate passes through directly (no .data.template unwrap)
      expect(result).toBe(expectedResult);
    });
  });
});
