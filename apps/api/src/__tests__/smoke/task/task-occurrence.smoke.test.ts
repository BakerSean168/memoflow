/**
 * Task Instance API Smoke Tests
 *
 * Tests the full HTTP pipeline for task instance endpoints:
 *   Supertest -> Express -> Auth MW -> expressAdapter -> Controller -> Use Case -> Mock Repo
 *
 * Each endpoint is tested for:
 *   1. Auth gate (401 without token)
 *   2. Happy path (200 with valid request)
 *   3. Validation / business-rule rejection (422/404 where applicable)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
  aTaskOccurrence,
  aOneTimeTask,
  aTaskPlanId,
  anIdentityId,
  createSmokeApp,
  TEST_IDENTITY_ID,
  type SmokeTestApp,
} from '../helpers/create-smoke-app';

// Mock eventBus to prevent console noise and import side-effects from fire-and-forget events
vi.mock('@memoflow/utils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    eventBus: { send: vi.fn(), on: vi.fn(), off: vi.fn() },
  };
});

// ============================================================================
// Helpers
// ============================================================================

const FAKE_TEMPLATE_ID = aTaskPlanId();

// Well-formed UUID that does not exist — passes :id param validation (branded UUID
// format) so the route reaches the not-found path instead of failing validation.
const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Create a real TaskOccurrence aggregate via the domain factory method.
 * Uses proper value object classes so toClientDTO() works correctly.
 */
async function makeFakeInstance(
  overrides: Partial<{
    templateId: typeof FAKE_TEMPLATE_ID;
    identityId: ReturnType<typeof anIdentityId>;
    status: string;
  }> = {},
) {
  const instance = await aTaskOccurrence({
    templateId: overrides.templateId ?? FAKE_TEMPLATE_ID,
    identityId: overrides.identityId ?? anIdentityId(TEST_IDENTITY_ID),
  });

  // Transition to desired status if requested
  if (overrides.status === 'InProgress') {
    instance.start();
  } else if (overrides.status === 'Completed') {
    instance.complete();
  } else if (overrides.status === 'Skipped') {
    instance.skip();
  }

  return instance;
}

// ============================================================================
// Tests
// ============================================================================

describe('Task Instance API Smoke Tests', () => {
  let ctx: SmokeTestApp;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((message, ...args) => {
      if (
        typeof message === 'string' &&
        message.startsWith('[CompleteTaskOccurrence] Template not found:')
      ) {
        return;
      }
      originalConsoleWarn(message, ...args);
    });
    ctx = createSmokeApp();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // =========================================================================
  // GET /api/v1/task-occurrences -- List instances
  // =========================================================================
  describe('GET /api/v1/task-occurrences', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).get('/api/v1/task-occurrences');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 with empty list (default: listByAccount)', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return instances from repository', async () => {
      const instance = await makeFakeInstance();
      vi.mocked(ctx.instanceRepo.findByIdentityId).mockResolvedValue([instance]);

      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('Pending');
      expect(res.body.data[0].importance).toBe('Moderate');
    });

    it('should route to listByTemplate when templateId filter is provided', async () => {
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(
        aOneTimeTask({ identityId: anIdentityId(TEST_IDENTITY_ID) }),
      );
      vi.mocked(ctx.instanceRepo.findByTemplateId).mockResolvedValue([]);

      const res = await request(ctx.app)
        .get(`/api/v1/task-occurrences?templateId=${FAKE_TEMPLATE_ID}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(ctx.instanceRepo.findByTemplateId).toHaveBeenCalled();
    });

    it('should route to listByStatus when status filter is provided', async () => {
      vi.mocked(ctx.instanceRepo.findByStatus).mockResolvedValue([]);

      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences?status=Completed')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(ctx.instanceRepo.findByStatus).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /api/v1/task-occurrences/by-date-range -- Get instances by date range
  // =========================================================================
  describe('GET /api/v1/task-occurrences/by-date-range', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).get('/api/v1/task-occurrences/by-date-range');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 with empty list', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences/by-date-range?startDate=1000000&endDate=2000000')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return instances within date range', async () => {
      const instance = await makeFakeInstance();
      vi.mocked(ctx.instanceRepo.findByDateRange).mockResolvedValue([instance]);

      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences/by-date-range?startDate=1000000&endDate=2000000')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBeDefined();
    });

    it('should pass query params as numbers to use case', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences/by-date-range?startDate=1704067200000&endDate=1704153600000')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      // The route handler converts query strings to Number()
      expect(ctx.instanceRepo.findByDateRange).toHaveBeenCalledWith(
        TEST_IDENTITY_ID,
        1704067200000,
        1704153600000,
      );
    });
  });

  // =========================================================================
  // GET /api/v1/task-occurrences/:id -- Get instance by ID
  // =========================================================================
  describe('GET /api/v1/task-occurrences/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).get('/api/v1/task-occurrences/some-uuid');

      expect(res.status).toBe(401);
    });

    it('should return 200 with null when instance not found', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/task-occurrences/some-uuid')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('should return 200 with instance when found', async () => {
      const instance = await makeFakeInstance();
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .get(`/api/v1/task-occurrences/${instance.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.status).toBe('Pending');
      expect(res.body.data.templateId).toBeDefined();
    });
  });

  // =========================================================================
  // POST /api/v1/task-occurrences/:id/start -- Start instance
  // =========================================================================
  describe('POST /api/v1/task-occurrences/:id/start', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-occurrences/some-id/start');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when instance not found', async () => {
      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${NON_EXISTENT_ID}/start`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 200 and start a Pending instance', async () => {
      const instance = await makeFakeInstance(); // Pending by default
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/start`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('InProgress');
      expect(ctx.instanceRepo.save).toHaveBeenCalled();
    });

    it('should return 422 when instance cannot be started (already InProgress)', async () => {
      const instance = await makeFakeInstance({ status: 'InProgress' });
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/start`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(422);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // POST /api/v1/task-occurrences/:id/complete -- Complete instance
  // =========================================================================
  describe('POST /api/v1/task-occurrences/:id/complete', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-occurrences/some-id/complete').send({});

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when instance not found', async () => {
      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${NON_EXISTENT_ID}/complete`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 200 and complete a Pending instance', async () => {
      const instance = await makeFakeInstance(); // Pending by default
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/complete`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Completed');
      expect(ctx.instanceRepo.save).toHaveBeenCalled();
    });

    it('should return 200 and complete with optional fields', async () => {
      const instance = await makeFakeInstance({ status: 'InProgress' });
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/complete`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ duration: 3600000, note: 'Done well', rating: 5 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Completed');
    });

    it('should return 200 without saving when the instance is already Completed', async () => {
      const instance = await makeFakeInstance({ status: 'Completed' });
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/complete`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Completed');
      expect(ctx.instanceRepo.save).not.toHaveBeenCalled();
      expect(ctx.templateRepo.findByIdForIdentity).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /api/v1/task-occurrences/:id/uncomplete -- Undo completion
  // =========================================================================
  describe('POST /api/v1/task-occurrences/:id/uncomplete', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-occurrences/some-id/uncomplete');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 and restore a Completed instance to Pending', async () => {
      const instance = await makeFakeInstance({ status: 'Completed' });
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/uncomplete`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Pending');
      expect(res.body.data.actualEndTime).toBeNull();
      expect(ctx.instanceRepo.save).toHaveBeenCalled();
    });

    it('should return 422 when the instance is not Completed', async () => {
      const instance = await makeFakeInstance();
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/uncomplete`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(422);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // POST /api/v1/task-occurrences/:id/skip -- Skip instance
  // =========================================================================
  describe('POST /api/v1/task-occurrences/:id/skip', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-occurrences/some-id/skip').send({});

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when instance not found', async () => {
      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${NON_EXISTENT_ID}/skip`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 200 and skip a Pending instance', async () => {
      const instance = await makeFakeInstance(); // Pending by default
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/skip`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Skipped');
      expect(ctx.instanceRepo.save).toHaveBeenCalled();
    });

    it('should return 200 and skip with optional reason', async () => {
      const instance = await makeFakeInstance(); // Pending by default
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/skip`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ reason: 'Too busy today' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Skipped');
    });

    it('should return 422 when instance cannot be skipped (already Completed)', async () => {
      const instance = await makeFakeInstance({ status: 'Completed' });
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .post(`/api/v1/task-occurrences/${instance.id}/skip`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // DELETE /api/v1/task-occurrences/:id -- Delete instance
  // =========================================================================
  describe('DELETE /api/v1/task-occurrences/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).delete('/api/v1/task-occurrences/some-id');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 (idempotent delete, no findById check)', async () => {
      const res = await request(ctx.app)
        .delete(`/api/v1/task-occurrences/${NON_EXISTENT_ID}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should call instanceRepository.delete', async () => {
      const instance = await makeFakeInstance();
      vi.mocked(ctx.instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

      const res = await request(ctx.app)
        .delete(`/api/v1/task-occurrences/${instance.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(ctx.instanceRepo.delete).toHaveBeenCalledWith(
        TEST_IDENTITY_ID,
        instance.id.toString(),
      );
    });
  });
});
