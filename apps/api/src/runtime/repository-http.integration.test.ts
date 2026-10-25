import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { ApiBootstrapper } from '../bootstrap';
import { createCloudAuthStub } from '../test/cloud-auth.stub';
import { composeRepository } from './compose-repository';

let app: Express;
let bootstrapper: ApiBootstrapper | undefined;
let storageBaseDir: string;
const credential = 'Bearer repository-integration';

beforeEach(async () => {
  await cleanAll();
  const db = await getPrisma();
  const account = await seedAccount();
  storageBaseDir = await mkdtemp(join(tmpdir(), 'memoflow-repository-http-'));
  const auth = createCloudAuthStub();
  auth.resolveNodePrincipal = async (headers) =>
    headers.authorization === credential
      ? {
          identityId: account.id,
          sessionId: 'repository-session',
          email: 'integration@example.test',
          emailVerified: true,
        }
      : null;
  bootstrapper = new ApiBootstrapper(db, auth).register(
    composeRepository({
      db,
      storageBaseDir,
      closureChecker: async () => false,
    }),
  );
  app = await bootstrapper.init();
});
afterEach(async () => {
  await bootstrapper?.destroy();
  bootstrapper = undefined;
  if (storageBaseDir) await rm(storageBaseDir, { recursive: true, force: true });
});
afterAll(disconnectPrisma);

describe('Repository HTTP mutation boundary', () => {
  it('mounts the current owner routes and rejects all five retired mutation routes', async () => {
    // Positive control prevents an unregistered module from making every 404 pass.
    const livePath = '/api/v1/repositories/knowledge-notes';
    expect((await request(app).get(livePath)).status).toBe(401);
    const live = await request(app).get(livePath).set('authorization', credential);
    // No GitHub App is configured in this lane: the installed route must
    // return the owner's unavailable receipt, not Express' fallback 404.
    expect(live.status).toBe(503);
    expect(live.body.error.code).toBe('SERVICE_UNAVAILABLE');

    expect(
      (await request(app).get('/api/v1/repositories/current').set('authorization', credential))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/repositories/legacy-repository/resources')
          .set('authorization', credential)
          .send({ name: 'legacy.md', type: 'File', content: '# legacy' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/v1/repositories/legacy-repository/folders')
          .set('authorization', credential)
          .send({ name: 'legacy-folder' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put('/api/v1/resources/legacy-resource')
          .set('authorization', credential)
          .send({ content: '# overwritten' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put('/api/v1/editor/content/legacy-resource')
          .set('authorization', credential)
          .send({ content: '# overwritten' })
      ).status,
    ).toBe(404);
  });
});
