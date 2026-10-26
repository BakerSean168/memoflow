import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { createAIModule } from '../../server/infrastructure/ai.module';
import { createAIPrismaRepositories } from '../../server/infrastructure/prisma';
import { AIProviderConfigController } from '../../server/transport/ai-provider-config.controller';
import { registerAIProviderRoutes } from './ai-provider.routes';
import { registerAIProviderOnboardingRoutes } from './ai-provider-onboarding.routes';
import { OpenAICompatibleModelCatalogGateway } from '../../server/infrastructure/gateways/openai-compatible-model-catalog.gateway';

// Production HTTP/controller/use-case/Prisma path. Only the external provider
// catalog is substituted; real egress and the full UI journey remain Nightly.
let owner: string;
let foreign: string;
let repositories: ReturnType<typeof createAIPrismaRepositories>;
let instance: ReturnType<typeof createAIModule>;
let app: ReturnType<typeof express>;
const secret = 'provider-http-key-alpha';
const replacementSecret = 'provider-http-key-beta';
beforeEach(async () => {
  vi.stubEnv('AI_PROVIDER_ENCRYPTION_KEY', 'provider-http-test-encryption-key-32-bytes');
  await cleanAll();
  owner = (await seedAccount()).id;
  foreign = (await seedAccount()).id;
  repositories = createAIPrismaRepositories(await getPrisma());
  instance = createAIModule(repositories);
  const controller = new AIProviderConfigController(instance.providerManagement);
  const auth: RequestHandler = (req, res, next) => {
    const identityId = req.header('authorization')?.replace('Bearer ', '');
    if (identityId !== owner && identityId !== foreign) {
      res.sendStatus(401);
      return;
    }
    Object.assign(req, { user: { identityId } });
    next();
  };
  app = express().use(express.json());
  app.use('/api/v1/ai/providers', registerAIProviderRoutes(controller, { auth }));
  app.use('/api/v1/ai', registerAIProviderOnboardingRoutes(controller, { auth }));
});
afterEach(async () => {
  await instance?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(disconnectPrisma);
const post = (path: string, body: object, identity = owner) =>
  request(app).post(`/api/v1/ai${path}`).set('authorization', `Bearer ${identity}`).send(body);

async function verifiedSession(value = secret, targetProviderId?: string) {
  const now = Date.now();
  const credentialRef = await repositories.providerSecretVault.store({
    identityId: owner,
    value,
    expiresAt: now + 60_000,
  });
  const onboardingId = `onboarding_${randomUUID()}`;
  await repositories.providerOnboardingSessionRepository.create({
    id: onboardingId,
    identityId: owner,
    catalogId: 'custom',
    baseUrl: 'https://8.8.8.8/v1',
    credentialRef,
    credentialStatus: 'valid',
    discoveryStatus: 'available',
    models: [
      { id: 'model-alpha', name: 'Alpha' },
      { id: 'model-beta', name: 'Beta' },
    ],
    targetProviderId,
    now,
    expiresAt: now + 60_000,
  });
  return { onboardingId, credentialRef };
}

describe('Provider acceptance lowered to HTTP and PostgreSQL', () => {
  it('commits a verified session once, requires explicit advertised selection and never exposes secrets', async () => {
    const db = await getPrisma();
    expect((await request(app).get('/api/v1/ai/providers')).status).toBe(401);
    vi.spyOn(OpenAICompatibleModelCatalogGateway.prototype, 'listModels').mockImplementation(
      async (input) => {
        expect(input.apiKey).toBe(secret);
        return [{ id: 'model-alpha', name: 'Alpha' }];
      },
    );
    const probe = await post('/provider-connections/probe', {
      catalogId: 'custom',
      baseUrl: 'https://8.8.8.8/v1',
      apiKey: secret,
    });
    expect(probe.status, JSON.stringify(probe.body)).toBe(200);
    expect(JSON.stringify(probe.body)).not.toContain(secret);
    expect(await db.aiProviderConfig.count()).toBe(0);
    const persisted = await db.aiProviderOnboardingSession.findUniqueOrThrow({
      where: { id: probe.body.data.onboardingId },
    });
    const session = { onboardingId: persisted.id, credentialRef: persisted.credentialRef };
    const body = {
      onboardingId: session.onboardingId,
      name: 'HTTP Provider',
      defaultModelId: 'model-alpha',
      isDefault: true,
    };
    expect((await post('/providers', body, foreign)).status).toBe(404);
    expect((await post('/providers', { ...body, defaultModelId: 'unadvertised' })).status).toBe(
      400,
    );
    expect(await db.aiProviderConfig.count()).toBe(0);
    expect(
      (
        await db.aiProviderOnboardingSession.findUniqueOrThrow({
          where: { id: session.onboardingId },
        })
      ).consumedAt,
    ).toBeNull();
    const created = await post('/providers', body);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'HTTP Provider', defaultModel: 'model-alpha' });
    expect(JSON.stringify(created.body)).not.toContain(secret);
    expect(JSON.stringify(created.body)).not.toContain(session.credentialRef);
    expect(await db.aiProviderConfig.count()).toBe(1);
    expect(
      (
        await db.aiProviderOnboardingSession.findUniqueOrThrow({
          where: { id: session.onboardingId },
        })
      ).consumedAt,
    ).not.toBeNull();
    expect((await post('/providers', body)).status).toBe(404);
    const stored = await db.aiProviderSecret.findUniqueOrThrow({
      where: { id: session.credentialRef },
    });
    expect(stored.encryptedValue).not.toContain(secret);
    expect(stored.expiresAt).toBeNull();
    expect(
      (await request(app).get('/api/v1/ai/providers').set('authorization', `Bearer ${foreign}`))
        .body.data.data,
    ).toEqual([]);
  });

  it('rotates credentials atomically without duplicate Providers, revokes the old key and scopes refresh to the owner', async () => {
    const session = await verifiedSession();
    const created = await post('/providers', {
      onboardingId: session.onboardingId,
      name: 'Stable identity',
      defaultModelId: 'model-alpha',
      isDefault: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const providerId = created.body.data.id;
    const replacement = await verifiedSession(replacementSecret, providerId);
    const body = { onboardingId: replacement.onboardingId, defaultModelId: 'model-beta' };
    expect((await post(`/providers/${providerId}/replacement/commit`, body, foreign)).status).toBe(
      404,
    );
    const result = await post(`/providers/${providerId}/replacement/commit`, body);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.data).toMatchObject({
      id: providerId,
      name: 'Stable identity',
      defaultModel: 'model-beta',
      isDefault: true,
    });
    for (const value of [secret, replacementSecret, replacement.credentialRef])
      expect(JSON.stringify(result.body)).not.toContain(value);
    const db = await getPrisma();
    expect(await db.aiProviderConfig.count()).toBe(1);
    expect(
      (await db.aiProviderSecret.findUniqueOrThrow({ where: { id: session.credentialRef } }))
        .revokedAt,
    ).not.toBeNull();
    await expect(
      repositories.providerSecretVault.resolve({
        identityId: owner,
        credentialRef: session.credentialRef,
      }),
    ).rejects.toThrow('unavailable');
    expect((await post(`/providers/${providerId}/replacement/commit`, body)).status).toBe(409);
    const catalog = vi
      .spyOn(OpenAICompatibleModelCatalogGateway.prototype, 'listModels')
      .mockImplementation(async (input) => {
        expect(input.apiKey).toBe(replacementSecret);
        return [
          { id: 'model-alpha', name: 'Alpha' },
          { id: 'model-beta', name: 'Beta' },
        ];
      });
    const refreshed = await post(`/providers/${providerId}/refresh-models`, {});
    expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
    expect(catalog).toHaveBeenCalledTimes(1);
    expect((await post(`/providers/${providerId}/refresh-models`, {}, foreign)).status).toBe(404);
    expect(catalog).toHaveBeenCalledTimes(1);
    const reloaded = createAIPrismaRepositories(db);
    expect(
      await reloaded.providerConfigRepository.findByIdForIdentity(owner, providerId),
    ).toMatchObject({ defaultModel: 'model-beta', name: 'Stable identity' });
  });
});
