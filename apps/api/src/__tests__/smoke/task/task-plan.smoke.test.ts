/**
 * Task Template API Smoke Tests
 *
 * Tests the full HTTP pipeline for task template endpoints:
 *   Supertest -> Express -> Auth MW -> expressAdapter -> Controller -> Use Case -> Mock Repo
 *
 * Each endpoint is tested for:
 *   1. Auth gate (401 without token)
 *   2. Happy path (200/201 with valid request)
 *   3. Validation rejection (400 with invalid body via adapter, where applicable)
 *   4. NOT_FOUND propagation (404 when repo returns null)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import {
  aOneTimeTask,
  anIdentityId,
  createSmokeApp,
  JWT_SECRET,
  TEST_IDENTITY_ID,
  type SmokeTestApp,
} from '../helpers/create-smoke-app';
import jwt from 'jsonwebtoken';

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

/**
 * Create a real TaskPlan aggregate via the domain factory method.
 * Uses proper value object classes so toClientDTO() works correctly.
 */
function makeFakeTemplate(overrides: Record<string, unknown> = {}) {
  return aOneTimeTask({
    identityId: anIdentityId(TEST_IDENTITY_ID),
    title: 'Smoke Test Task',
    ...overrides,
  });
}

/** Valid HTTP request body for creating a template (uses API field names) */
const VALID_CREATE_BODY = {
  name: 'Smoke Task',
  schedule: { kind: 'OneTime', date: '2026-09-08', timing: { kind: 'AllDay' } },
  importance: 'Moderate',
};

// Well-formed UUID that does not exist — passes :id param validation (branded UUID
// format) so the route reaches the not-found path instead of failing validation.
const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

// ============================================================================
// Tests
// ============================================================================

describe('Task Template API Smoke Tests', () => {
  let ctx: SmokeTestApp;

  beforeEach(() => {
    ctx = createSmokeApp();
  });

  // =========================================================================
  // POST /api/v1/task-plans -- Create template
  // =========================================================================
  describe('POST /api/v1/task-plans', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-plans').send(VALID_CREATE_BODY);

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 401 with expired token', async () => {
      const expired = jwt.sign({ identityId: TEST_IDENTITY_ID }, JWT_SECRET, { expiresIn: '-1s' });

      const res = await request(ctx.app)
        .post('/api/v1/task-plans')
        .set('Authorization', `Bearer ${expired}`)
        .send(VALID_CREATE_BODY);

      expect(res.status).toBe(401);
    });

    it('should return 401 with malformed token', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/task-plans')
        .set('Authorization', 'Bearer not-a-valid-jwt')
        .send(VALID_CREATE_BODY);

      expect(res.status).toBe(401);
    });

    it('should return 201 on successful creation', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/task-plans')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(VALID_CREATE_BODY);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.template.name).toBe('Smoke Task');
      // toClientDTO() does not include taskType — verify key fields only
      expect(res.body.data.template.status).toBe('Active');
      expect(res.body.data.template.id).toBeDefined();
      expect(res.body.data.template.identityId).toBe(TEST_IDENTITY_ID);
    });

    it('should return 400 with invalid body (missing name)', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/task-plans')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ schedule: VALID_CREATE_BODY.schedule, importance: 'Moderate' }); // missing name

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should call templateRepository.save on successful creation', async () => {
      await request(ctx.app)
        .post('/api/v1/task-plans')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send(VALID_CREATE_BODY);

      expect(ctx.templateRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // GET /api/v1/task-plans -- List templates
  // =========================================================================
  describe('GET /api/v1/task-plans', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).get('/api/v1/task-plans');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 with empty list', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/task-plans')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toEqual({
        templates: [],
        total: 0,
      });
    });

    it('should return templates from repository', async () => {
      const template = makeFakeTemplate();
      vi.mocked(ctx.templateRepo.findByIdentityId).mockResolvedValue([template]);

      const res = await request(ctx.app)
        .get('/api/v1/task-plans')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.templates).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.templates[0].name).toBe('Smoke Test Task');
    });

    it('should pass status filter to repository', async () => {
      vi.mocked(ctx.templateRepo.findByStatus).mockResolvedValue([]);

      const res = await request(ctx.app)
        .get('/api/v1/task-plans?status=Active')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      // When status is provided, the use case calls findByStatus (not findByIdentityId)
      expect(ctx.templateRepo.findByStatus).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /api/v1/task-plans/:id -- Get template by ID
  // =========================================================================
  describe('GET /api/v1/task-plans/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).get('/api/v1/task-plans/some-uuid');

      expect(res.status).toBe(401);
    });

    it('should return 200 with null when template not found', async () => {
      const res = await request(ctx.app)
        .get('/api/v1/task-plans/some-uuid')
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('should return 200 with template when found', async () => {
      const template = makeFakeTemplate();
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(template);

      const res = await request(ctx.app)
        .get(`/api/v1/task-plans/${template.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.name).toBe('Smoke Test Task');
      expect(res.body.data.importance).toBe('Moderate');
      expect(ctx.templateRepo.findByIdForIdentity).toHaveBeenCalledWith(
        TEST_IDENTITY_ID,
        template.id,
      );
    });
  });

  // =========================================================================
  // PUT /api/v1/task-plans/:id -- Update template
  // =========================================================================
  describe('PUT /api/v1/task-plans/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app)
        .put('/api/v1/task-plans/some-id')
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when template not found', async () => {
      const res = await request(ctx.app)
        .put(`/api/v1/task-plans/${NON_EXISTENT_ID}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 200 when template updated', async () => {
      const template = makeFakeTemplate();
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(template);

      const res = await request(ctx.app)
        .put(`/api/v1/task-plans/${template.id}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
      expect(ctx.templateRepo.save).toHaveBeenCalled();
    });

    it('should return 404 with empty body (no fields to update, template not found)', async () => {
      // UpdateTaskPlanSchema allows empty partial — all fields optional.
      // The use case proceeds with the identity-scoped lookup, which returns null → NOT_FOUND.
      const res = await request(ctx.app)
        .put(`/api/v1/task-plans/${NON_EXISTENT_ID}`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // =========================================================================
  // DELETE /api/v1/task-plans/:id -- Delete template
  // =========================================================================
  describe('DELETE /api/v1/task-plans/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).delete('/api/v1/task-plans/some-id');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 even when template not found (idempotent delete)', async () => {
      // DeleteTaskPlan.execute() returns ok({ success: true }) when not found
      const res = await request(ctx.app)
        .delete(`/api/v1/task-plans/${NON_EXISTENT_ID}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should return 200 when template deleted', async () => {
      const template = makeFakeTemplate();
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(template);

      const res = await request(ctx.app)
        .delete(`/api/v1/task-plans/${template.id}`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(ctx.templateRepo.delete).toHaveBeenCalledWith(TEST_IDENTITY_ID, template.id);
    });
  });

  // =========================================================================
  // POST /api/v1/task-plans/:id/activate -- Activate template
  // =========================================================================
  describe('POST /api/v1/task-plans/:id/activate', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-plans/some-id/activate');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when template not found', async () => {
      const res = await request(ctx.app)
        .post(`/api/v1/task-plans/${NON_EXISTENT_ID}/activate`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });

    it('should return 200 and activate template', async () => {
      const template = makeFakeTemplate();
      template.pause(); // put it in Paused state first
      template.clearDomainEvents();
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(template);

      const res = await request(ctx.app)
        .post(`/api/v1/task-plans/${template.id}/activate`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Active');
    });
  });

  // =========================================================================
  // POST /api/v1/task-plans/:id/pause -- Pause template
  // =========================================================================
  describe('POST /api/v1/task-plans/:id/pause', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-plans/some-id/pause');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when template not found', async () => {
      const res = await request(ctx.app)
        .post(`/api/v1/task-plans/${NON_EXISTENT_ID}/pause`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(404);
    });

    it('should return 200 and pause template', async () => {
      const template = makeFakeTemplate();
      template.clearDomainEvents();
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(template);

      const res = await request(ctx.app)
        .post(`/api/v1/task-plans/${template.id}/pause`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('Paused');
    });
  });

  // =========================================================================
  // POST /api/v1/task-plans/:id/archive -- Archive template
  // =========================================================================
  describe('POST /api/v1/task-plans/:id/archive', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(ctx.app).post('/api/v1/task-plans/some-id/archive');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('should return 404 when template not found', async () => {
      const res = await request(ctx.app)
        .post(`/api/v1/task-plans/${NON_EXISTENT_ID}/archive`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(404);
    });

    it('should return 200 and archive template', async () => {
      const template = makeFakeTemplate();
      template.clearDomainEvents();
      vi.mocked(ctx.templateRepo.findByIdForIdentity).mockResolvedValue(template);

      const res = await request(ctx.app)
        .post(`/api/v1/task-plans/${template.id}/archive`)
        .set('Authorization', `Bearer ${ctx.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
