import express from 'express';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createExternalAgentEdgeAudit } from './external-agent-edge-audit';
import { createRequestContextMiddleware } from '../http/middlewares/request-context.middleware';

describe('External agent early rejection audit', () => {
  it('records rejected body parsing once without credential or body contents', async () => {
    const audit = vi.fn();
    const app = express();
    app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
    app.use(createExternalAgentEdgeAudit(audit));
    app.use(express.json({ limit: '1kb' }));
    app.post('/mcp', (_req, res) => res.sendStatus(200));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer private-test' },
        body: JSON.stringify({ privateBody: 'private-test'.repeat(200) }),
      });
      expect(response.status).toBe(413);
      expect(audit).toHaveBeenCalledTimes(1);
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: response.headers.get('x-request-id'),
          outcome: 'HTTP_413',
          tool: 'transport',
          scopeDecision: 'denied',
        }),
      );
      expect(JSON.stringify(audit.mock.calls)).not.toContain('private-test');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
