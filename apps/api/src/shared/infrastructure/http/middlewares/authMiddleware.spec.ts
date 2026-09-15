import type { CloudSessionCapability } from '@memoflow/cloud-auth/server';
import type { NextFunction, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ILogger } from '@memoflow/utils/logger';
import { createAuthMiddleware, type AuthenticatedRequest } from './auth-middleware';
import type { RequestContext } from '@memoflow/contracts/shared';

function responseStub(): Response {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  return { status, json } as unknown as Response;
}

function requestStub(overrides: Record<string, unknown> = {}) {
  const requestContext: RequestContext = {
    requestId: 'req-auth-1',
    traceId: 'req-auth-1',
    startedAt: 1_700_000_000_000,
    source: 'http',
  };
  return { headers: {}, requestContext, ...overrides } as unknown as AuthenticatedRequest;
}

describe('cloud auth middleware', () => {
  it('returns a structured unauthorized response when no cloud session resolves', async () => {
    const cloudAuth = {
      resolveNodePrincipal: vi.fn().mockResolvedValue(null),
    } as unknown as CloudSessionCapability;
    const req = requestStub();
    const res = responseStub();
    const next = vi.fn() as unknown as NextFunction;

    await createAuthMiddleware(cloudAuth)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
        traceId: 'req-auth-1',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('maps a cloud principal onto the MemoFlow request identity', async () => {
    const cloudAuth = {
      resolveNodePrincipal: vi.fn().mockResolvedValue({
        identityId: 'user-id',
        sessionId: 'session-id',
        email: 'user@example.com',
        emailVerified: true,
      }),
    } as unknown as CloudSessionCapability;
    const req = requestStub();
    const res = responseStub();
    const next = vi.fn() as unknown as NextFunction;

    await createAuthMiddleware(cloudAuth)(req, res, next);

    expect(req.user).toEqual({
      identityId: 'user-id',
      sessionId: 'session-id',
      email: 'user@example.com',
      emailVerified: true,
    });
    expect(cloudAuth.resolveNodePrincipal).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledOnce();
  });

  it('resolves the Principal only once on success (request carrier already exists)', async () => {
    const cloudAuth = {
      resolveNodePrincipal: vi.fn().mockResolvedValue({
        identityId: 'user-id',
        sessionId: 'session-id',
        email: 'user@example.com',
        emailVerified: true,
      }),
    } as unknown as CloudSessionCapability;
    const req = requestStub();
    const res = responseStub();
    const next = vi.fn() as unknown as NextFunction;

    await createAuthMiddleware(cloudAuth)(req, res, next);

    expect(
      (req as unknown as { requestContext?: { requestId?: string } }).requestContext?.requestId,
    ).toBe('req-auth-1');
    expect(cloudAuth.resolveNodePrincipal).toHaveBeenCalledTimes(1);
    expect(req.user?.identityId).toBe('user-id');
  });

  it('rejects a valid Better Auth session when the cloud Account is closed', async () => {
    const cloudAuth = {
      resolveNodePrincipal: vi.fn().mockResolvedValue({
        identityId: 'user-id',
        sessionId: 'session-id',
        email: 'user@example.com',
        emailVerified: true,
      }),
    } as unknown as CloudSessionCapability;
    const database = {
      account: { findUnique: vi.fn().mockResolvedValue({ status: 'Closed' }) },
    };
    const req = requestStub();
    const res = responseStub();
    const next = vi.fn() as unknown as NextFunction;

    await createAuthMiddleware(cloudAuth, database as never)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an active cloud Account after Better Auth resolves', async () => {
    const cloudAuth = {
      resolveNodePrincipal: vi.fn().mockResolvedValue({
        identityId: 'user-id',
        sessionId: 'session-id',
        email: 'user@example.com',
        emailVerified: true,
      }),
    } as unknown as CloudSessionCapability;
    const database = {
      account: { findUnique: vi.fn().mockResolvedValue({ status: 'Active' }) },
    };
    const req = requestStub();
    const res = responseStub();
    const next = vi.fn() as unknown as NextFunction;

    await createAuthMiddleware(cloudAuth, database as never)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('uses the shared structured logger with correlation metadata on unexpected failures', async () => {
    const cloudAuth = {
      resolveNodePrincipal: vi.fn().mockRejectedValue(new Error('cloud down')),
    } as unknown as CloudSessionCapability;
    const logger = {
      error: vi.fn(),
    };
    const req = requestStub();
    const res = responseStub();
    const next = vi.fn() as unknown as NextFunction;

    await createAuthMiddleware(cloudAuth, undefined, logger as unknown as ILogger)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalledWith(
      'Cloud authentication middleware failed',
      expect.any(Error),
      expect.objectContaining({ requestId: 'req-auth-1', traceId: 'req-auth-1' }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        code: 500,
        error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        traceId: 'req-auth-1',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
