import type { RequestHandler } from 'express';
import { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { RepositoryApplicationPort } from '../../server/application';
import { registerKnowledgeRepositoryConnectionRoutes } from './knowledge-repository-connection.routes';
import { registerRepositoryRoutes } from './index';

type RouteHandler = (
  req: Record<string, unknown>,
  res: {
    status(code: number): unknown;
    json(data: unknown): unknown;
  },
) => unknown;

type LayerWithRoute = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RouteHandler }>;
  };
};

const passThrough = ((_, __, next) => next()) as RequestHandler;

function carrier() {
  return {
    requestId: 'req-repo-route',
    traceId: 'req-repo-route',
    startedAt: 1_700_000_000_000,
    source: 'http',
  };
}

function createApiStub(): RepositoryApplicationPort {
  return {
    startKnowledgeRepositoryInstallation: vi.fn(async () =>
      ok({
        intentId: 'intent-1',
        installationUrl:
          'https://github.com/apps/memoflow/installations/new?state=mfi1.dev.state-1',
        expiresAt: 1_750_000_600_000,
      }),
    ),
    completeKnowledgeRepositoryInstallation: vi.fn(),
    receiveGithubInstallationSetup: vi.fn(async () =>
      ok({
        kind: 'web' as const,
        intentId: 'intent-1',
        location: 'https://app.example.test/settings?tab=repository&installation_intent=intent-1',
      }),
    ),
    getKnowledgeRepositoryInstallationIntentStatus: vi.fn(async () =>
      ok({
        intentId: 'intent-1',
        status: 'CallbackReceived' as const,
        clientKind: 'web' as const,
        expiresAt: 1_750_000_600_000,
        installationId: 'installation-1',
      }),
    ),
    finalizeKnowledgeRepositoryInstallationIntent: vi.fn(),
    listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [] })),
    connectKnowledgeRepository: vi.fn(),
    disconnectKnowledgeRepository: vi.fn(async () => ok(null)),
    previewKnowledgeRepositoryReconciliation: vi.fn(async () =>
      ok({
        connectionId: 'connection-1',
        localState: 'NonEmpty',
        remoteState: 'Empty',
        action: 'InitializeRemoteFromLocal',
        defaultBranch: 'main',
        remoteHeadSha: null,
      }),
    ),
    confirmKnowledgeRepositoryHead: vi.fn(async () =>
      ok({
        id: 'connection-1',
        identityId: 'IdentityId_11111111-1111-4111-8111-111111111111' as never,
        githubUserId: '42',
        githubRepositoryId: 'repository-1',
        githubRepositoryFullName: 'owner/knowledge',
        installationId: 'installation-1',
        defaultBranch: 'main',
        status: 'Active' as const,
        lastSyncedCommitSha: 'a'.repeat(40),
        lastErrorCode: null,
        canSync: true,
        createdAt: 1 as never,
        updatedAt: 2 as never,
      }),
    ),
    issueDesktopKnowledgeRepositoryToken: vi.fn(async () =>
      ok({
        token: 'short-lived-token',
        expiresAt: 1_750_000_300_000,
        repositoryId: 'repository-1',
      }),
    ),
    resolveKnowledgeNoteReference: vi.fn(),
    getKnowledgeNoteLinkGraph: vi.fn(async () =>
      ok({
        centerProjectionId: 'projection-1',
        depth: 2,
        nodes: [],
        edges: [],
        unresolvedLinks: [],
        truncated: false,
      }),
    ),
    listKnowledgeAttachmentProjections: vi.fn(async () => ok({ attachments: [] })),
    getKnowledgeAttachmentContent: vi.fn(async () =>
      ok({
        attachment: {
          id: 'attachment-1',
          connectionId: 'connection-1',
          relativePath: 'assets/diagram.png',
          fileName: 'diagram.png',
          commitSha: 'commit-1',
          blobSha: 'blob-1',
          byteSize: 4,
          mediaType: 'image/png',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        },
        contentBase64: 'AQIDBA==',
      }),
    ),
    listKnowledgeWriteRequests: vi.fn(async () => ok({ writeRequests: [] })),
    replayKnowledgeWriteRequestProjection: vi.fn(async () =>
      ok({ writeRequestId: 'write-request-1', commitSha: 'a'.repeat(40), status: 'Succeeded' }),
    ),
  } as unknown as RepositoryApplicationPort;
}

function getRouteHandler(router: Router, method: string, path: string): RouteHandler {
  const layer = (router as unknown as { stack: LayerWithRoute[] }).stack.find(
    (candidate) =>
      candidate.route?.path === path && candidate.route.methods[method.toLowerCase()] === true,
  );

  expect(layer?.route).toBeDefined();
  return layer!.route!.stack.at(-1)!.handle;
}

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
}

describe('knowledge repository connection routes', () => {
  it('keeps legacy database Repository/Folder/Resource routes outside the mounted API', () => {
    const router = registerRepositoryRoutes(createApiStub(), { auth: passThrough });
    const paths = (router as unknown as { stack: LayerWithRoute[] }).stack
      .map((layer) => layer.route?.path)
      .filter((path): path is string => typeof path === 'string');

    expect(paths).toContain('/knowledge-connections');
    expect(paths).toContain('/knowledge-notes');
    expect(paths).not.toContain('/:repoId/resources');
    expect(paths).not.toContain('/:repoId/folders');
    expect(paths).not.toContain('/:id');
  });

  it('accepts the public GitHub setup callback without auth and redirects only to the service-resolved location', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-connections/installations/setup');
    const res = createResponse();

    await handler(
      {
        query: {
          state: `mfi1.dev.${'a'.repeat(43)}`,
          installation_id: 'installation-1',
          setup_action: 'install',
        },
      },
      res,
    );

    expect(api.receiveGithubInstallationSetup).toHaveBeenCalledWith({
      state: `mfi1.dev.${'a'.repeat(43)}`,
      installationId: 'installation-1',
      setupAction: 'install',
    });
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://app.example.test/settings?tab=repository&installation_intent=intent-1',
    );
  });

  it('renders a bounded Desktop completion page rather than granting repository access in the callback', async () => {
    const api = createApiStub();
    vi.mocked(api.receiveGithubInstallationSetup).mockResolvedValueOnce(
      ok({ kind: 'desktop', intentId: 'intent-1', expiresAt: 1_750_000_600_000 }),
    );
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-connections/installations/setup');
    const res = createResponse();

    await handler(
      { query: { state: `mfi1.dev.${'b'.repeat(43)}`, installation_id: 'installation-1' } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('return to MemoFlow Desktop'));
    expect(api.finalizeKnowledgeRepositoryInstallationIntent).not.toHaveBeenCalled();
    expect(api.connectKnowledgeRepository).not.toHaveBeenCalled();
  });

  it('forwards an explicit cloud-data purge choice on disconnect', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'delete', '/knowledge-connections/:connectionId');
    const res = createResponse();

    await handler(
      {
        params: { connectionId: 'connection-1' },
        query: { purgeCloudData: 'true' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.disconnectKnowledgeRepository).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      'connection-1',
      true,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards the authenticated identity and validated installation request', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, {
      auth: passThrough,
      requireEmailVerified: passThrough,
    });
    const handler = getRouteHandler(router, 'post', '/knowledge-connections/installations/start');
    const req = {
      body: { returnUrl: 'https://app.example.test/settings/repository' },
      headers: { 'user-agent': 'Mozilla/5.0' },
      user: { identityId: 'identity-route' },
      requestContext: carrier(),
    };
    const res = createResponse();

    await handler(req, res);

    expect(api.startKnowledgeRepositoryInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-route',
        device: expect.objectContaining({ deviceType: 'Browser' }),
      }),
      { returnUrl: 'https://app.example.test/settings/repository' },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ installationUrl: expect.stringContaining('github.com') }),
      }),
    );
  });

  it('rejects invalid callback input before invoking the application port', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(
      router,
      'post',
      '/knowledge-connections/installations/complete',
    );
    const res = createResponse();

    await handler(
      {
        body: { state: 'short', installationId: '' },
        headers: {},
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.completeKnowledgeRepositoryInstallation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
  });

  it('derives a Desktop-only token context from the Electron transport edge', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(
      router,
      'post',
      '/knowledge-connections/:connectionId/desktop-token',
    );
    const res = createResponse();

    await handler(
      {
        params: { connectionId: 'connection-1' },
        headers: {
          'user-agent': 'Mozilla/5.0 MemoFlow/1.0 Electron/36.0.0',
          'x-device-id': 'desktop-device-1',
        },
        user: { identityId: 'identity-desktop' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.issueDesktopKnowledgeRepositoryToken).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-desktop',
        deviceId: 'desktop-device-1',
        device: expect.objectContaining({ deviceType: 'Desktop' }),
      }),
      'connection-1',
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards a validated first-reconciliation preflight in Desktop context', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(
      router,
      'post',
      '/knowledge-connections/:connectionId/reconciliation-preview',
    );
    const res = createResponse();

    await handler(
      {
        params: { connectionId: 'connection-1' },
        body: { localState: 'NonEmpty' },
        headers: { 'user-agent': 'MemoFlow/1.0 Electron/43.0.0' },
        user: { identityId: 'identity-desktop' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.previewKnowledgeRepositoryReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-desktop',
        device: expect.objectContaining({ deviceType: 'Desktop' }),
      }),
      'connection-1',
      { localState: 'NonEmpty' },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards a validated reconciliation confirmation in Desktop context', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(
      router,
      'post',
      '/knowledge-connections/:connectionId/head-confirmation',
    );
    const res = createResponse();

    await handler(
      {
        params: { connectionId: 'connection-1' },
        body: { headSha: 'a'.repeat(40) },
        headers: { 'user-agent': 'MemoFlow/1.0 Electron/43.0.0' },
        user: { identityId: 'identity-desktop' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.confirmKnowledgeRepositoryHead).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-desktop',
        device: expect.objectContaining({ deviceType: 'Desktop' }),
      }),
      'connection-1',
      { headSha: 'a'.repeat(40) },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 401 before invoking a protected route without an authenticated identity', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-connections');
    const res = createResponse();

    await handler({ headers: {}, requestContext: carrier() }, res);

    expect(api.listKnowledgeRepositoryConnections).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('validates and forwards knowledge-note catalog pagination without loading detail bodies', async () => {
    const api = createApiStub();
    api.listKnowledgeNoteProjections = vi.fn(async () =>
      ok({ notes: [], total: 3648, nextCursor: null }),
    );
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-notes');
    const res = createResponse();

    await handler(
      {
        query: {
          connectionId: 'connection-1',
          cursor: 'r~1759017600000~knowledge-note-1',
          sort: 'recent',
          limit: '50',
        },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.listKnowledgeNoteProjections).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      {
        connectionId: 'connection-1',
        cursor: 'r~1759017600000~knowledge-note-1',
        sort: 'recent',
        limit: 50,
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards the first-class referenceable knowledge-document query', async () => {
    const api = createApiStub();
    api.listReferenceableKnowledgeDocuments = vi.fn(async () =>
      ok({ documents: [], total: 2, nextCursor: null }),
    );
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-documents/referenceable');
    const res = createResponse();

    await handler(
      {
        query: {
          query: '1Password',
          cursor: 'r~1759017600000~knowledge-note-1',
          limit: '24',
        },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.listReferenceableKnowledgeDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      {
        query: '1Password',
        cursor: 'r~1759017600000~knowledge-note-1',
        limit: 24,
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('validates and forwards lazy knowledge-note tree browsing with hidden-directory control', async () => {
    const api = createApiStub();
    api.listKnowledgeNoteTree = vi.fn(async () =>
      ok({
        parent: 'assets',
        nodes: [
          {
            kind: 'directory' as const,
            name: 'hosts',
            relativePath: 'assets/hosts',
            noteCount: 92,
            hasChildren: true as const,
          },
        ],
        metadata: null,
      }),
    );
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-notes/tree');
    const res = createResponse();

    await handler(
      {
        query: {
          connectionId: 'connection-1',
          parent: 'assets',
          includeHidden: 'true',
        },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.listKnowledgeNoteTree).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      {
        connectionId: 'connection-1',
        parent: 'assets',
        includeHidden: true,
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resolves a stable knowledge-note reference inside the selected connection', async () => {
    const api = createApiStub();
    api.resolveKnowledgeNoteReference = vi.fn(async () =>
      ok({
        id: 'projection-1',
        connectionId: 'connection-1',
        knowledgeDocumentId: 'KnowledgeDocumentId_11111111-1111-4111-8111-111111111111' as never,
        relativePath: 'z/reference.md',
        title: 'Reference',
        commitSha: 'a'.repeat(40),
        blobSha: 'b'.repeat(40),
        contentHash: 'c'.repeat(64),
        frontmatter: {},
        markdownContent: '# Reference',
        createdAt: 1,
        updatedAt: 2,
        deletedAt: null,
      }),
    );
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-notes/resolve');
    const res = createResponse();

    await handler(
      {
        query: {
          connectionId: 'connection-1',
          reference: 'KnowledgeDocumentId_11111111-1111-4111-8111-111111111111',
        },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.resolveKnowledgeNoteReference).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      {
        connectionId: 'connection-1',
        reference: 'KnowledgeDocumentId_11111111-1111-4111-8111-111111111111',
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('validates and forwards an identity-scoped knowledge note link graph query', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-notes/:projectionId/link-graph');
    const res = createResponse();

    await handler(
      {
        params: { projectionId: 'projection-1' },
        query: { depth: '2', maxNodes: '30' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.getKnowledgeNoteLinkGraph).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      'projection-1',
      { depth: 2, maxNodes: 30 },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('requires an identity and scopes attachment content reads to that identity', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-attachments/:projectionId/content');
    const unauthorized = createResponse();

    await handler(
      {
        params: { projectionId: 'attachment-1' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        requestContext: carrier(),
      },
      unauthorized,
    );

    expect(unauthorized.status).toHaveBeenCalledWith(401);
    expect(api.getKnowledgeAttachmentContent).not.toHaveBeenCalled();

    const authorized = createResponse();
    await handler(
      {
        params: { projectionId: 'attachment-1' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      authorized,
    );

    expect(api.getKnowledgeAttachmentContent).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      'attachment-1',
    );
    expect(authorized.status).toHaveBeenCalledWith(200);
    expect(authorized.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ contentBase64: 'AQIDBA==' }),
      }),
    );
  });

  it('lists write requests with identity scope and forwards optional filters', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-write-requests');
    const res = createResponse();

    await handler(
      {
        query: { connectionId: 'connection-1', limit: '20' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.listKnowledgeWriteRequests).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      { connectionId: 'connection-1', limit: 20 },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('requires auth before listing write requests', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(router, 'get', '/knowledge-write-requests');
    const res = createResponse();

    await handler({ query: {}, headers: {}, requestContext: carrier() }, res);

    expect(api.listKnowledgeWriteRequests).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('forwards an authenticated replay of a write request projection', async () => {
    const api = createApiStub();
    const router = registerKnowledgeRepositoryConnectionRoutes(api, { auth: passThrough });
    const handler = getRouteHandler(
      router,
      'post',
      '/knowledge-write-requests/:writeRequestId/replay',
    );
    const res = createResponse();

    await handler(
      {
        params: { writeRequestId: 'write-request-1' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        user: { identityId: 'identity-route' },
        requestContext: carrier(),
      },
      res,
    );

    expect(api.replayKnowledgeWriteRequestProjection).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-route' }),
      'write-request-1',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ writeRequestId: 'write-request-1', status: 'Succeeded' }),
      }),
    );
  });
});
