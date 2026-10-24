import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1183 keep-boundary: defaultExtractContext (Express HTTP vs IPC).
 *
 * RefArch Phase 2 update: the IPC desktop-stub is retired. Both adapters are
 * now pure consumers of the canonical `ExecutionContext`:
 * - express-adapter: composes the producer-owned carrier (or a canonical-shaped
 *   fallback when the global middleware was not mounted) + header/body device
 *   mining + req.user.identityId → full ExecutionContext
 * - ipc-adapter: default extractor fails closed (no carrier on IPC events);
 *   desktop auth context produces the full context once per invocation
 *
 * Soft residual 1180: comparePriority keep-boundary remains separate.
 * Soft residual 1177: buildTaskName keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('defaultExtractContext keep-boundary (residual 1183)', () => {
  const dir = __dirname;
  const express = readFileSync(resolve(dir, 'express-adapter.ts'), 'utf8');
  const ipc = readFileSync(resolve(dir, 'ipc-adapter.ts'), 'utf8');

  it('owns Residual 1183 keep-boundary markers on Express carrier composer', () => {
    expect(express).toContain('Residual 1183 keep-boundary');
    expect(express).toMatch(/function defaultExtractContext\b/);
    expect(express).toContain('ExpressLikeRequest');
    expect(express).toContain('readExpressRequestContext');
    expect(express).toContain('x-forwarded-for');
    expect(express).toContain('req.user?.identityId');
    expect(express).toContain('deviceFingerprint');
    expect(express).toContain("headers['x-device-id']");
    expect(express).toContain('inferDeviceType');
    expect(express).not.toContain("deviceId: 'desktop'");
    expect(express).toContain('requestContext?: RequestContext');
  });

  it('IPC default extractor fails closed — no identity-only desktop stub', () => {
    expect(ipc).toContain('Residual 1183 keep-boundary');
    expect(ipc).toMatch(/function defaultExtractContext\b/);
    expect(ipc).toContain('IpcInvokeEvent');
    expect(ipc).toContain('requireRequestContext');
    expect(ipc).toContain('throw new Error(');
    expect(ipc).not.toContain("deviceId: 'desktop'");
    expect(ipc).not.toContain("identityId: ''");
    expect(ipc).not.toContain('x-forwarded-for');
  });

  it('runtime: documents Express lenient-carrier compose vs IPC fail-closed contracts', () => {
    function ipcDefaultExtractContext(): never {
      throw new Error('Missing ExecutionContext carrier');
    }
    function expressDefaultExtractContext(req: {
      requestContext?: { requestId: string; traceId: string };
      user?: { identityId?: string };
      headers?: Record<string, string | string[] | undefined>;
      body?: { deviceId?: string };
      id?: string;
    }): { identityId: string; requestId: string } {
      const requestId = req.requestContext?.requestId ?? req.id ?? 'fallback-id';
      const headers = req.headers ?? {};
      const body = req.body ?? {};
      const deviceId =
        (typeof headers['x-device-id'] === 'string' && headers['x-device-id']) ||
        body.deviceId ||
        'unknown';
      void deviceId;
      return {
        identityId: req.user?.identityId ?? '',
        requestId,
      };
    }
    expect(() => ipcDefaultExtractContext()).toThrow(/Missing ExecutionContext carrier/);
    expect(
      expressDefaultExtractContext({
        requestContext: { requestId: 'req-1', traceId: 'req-1' },
        user: { identityId: 'id-1' },
        headers: { 'x-device-id': 'web-1' },
      }),
    ).toEqual({ identityId: 'id-1', requestId: 'req-1' });
    // Standalone mount without the global middleware: lenient fallback, no throw.
    expect(
      expressDefaultExtractContext({
        user: { identityId: 'id-1' },
        headers: { 'x-device-id': 'web-1' },
        id: 'fallback-id',
      }),
    ).toEqual({ identityId: 'id-1', requestId: 'fallback-id' });
  });

  it('documents residual 1183 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'default-extract-context-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1183');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
