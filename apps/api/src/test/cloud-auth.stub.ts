import type { CloudSessionCapability } from '@memoflow/cloud-auth/server';
import type { RequestHandler } from 'express';

export function createCloudAuthStub(): CloudSessionCapability & {
  handler: (request: Request) => Promise<Response>;
  expressHandler: RequestHandler;
  revokeAllSessions: (identityId: string) => Promise<{ revokedSessions: number }>;
  cleanupExpiredDeviceCodes: (now?: Date) => Promise<number>;
} {
  return {
    handler: async () => new Response(null, { status: 404 }),
    expressHandler: (_req, res) => {
      res.sendStatus(404);
    },
    resolvePrincipal: async () => null,
    resolveNodePrincipal: async () => null,
    revokeAllSessions: async () => ({ revokedSessions: 0 }),
    cleanupExpiredDeviceCodes: async () => 0,
  };
}
