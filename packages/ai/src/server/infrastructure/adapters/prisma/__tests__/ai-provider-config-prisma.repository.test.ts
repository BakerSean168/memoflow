import { describe, expect, it, vi } from 'vitest';

import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import type { PrismaClient } from '@memoflow/database';

import { AIProviderConfigPrismaRepository } from '../ai-provider-config-prisma.repository';

describe('AIProviderConfigPrismaRepository', () => {
  it('reads and writes only the opaque credential reference', async () => {
    const aiProviderConfig = {
      findUnique: vi.fn(async () => ({ identityId: 'identity-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      upsert: vi.fn(async () => undefined),
      findFirst: vi.fn(async () => ({
        id: 'provider-1',
        identityId: 'identity-1',
        name: 'Main provider',
        providerDefinitionId: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        credentialRef: 'credential-test',
        defaultModel: 'gpt-4o-mini',
        availableModels: '[]',
        isActive: true,
        isDefault: true,
        priority: 100,
        version: 1,
        createdAt: new Date('2026-03-26T00:00:00.000Z'),
        updatedAt: new Date('2026-03-26T00:00:00.000Z'),
        deletedAt: null,
      })),
    };
    const transactionClient = {
      aiProviderConfig,
      $queryRawUnsafe: vi.fn(async () => [{ acquired: true }]),
    };
    const prisma = {
      aiProviderConfig,
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    };

    const repository = new AIProviderConfigPrismaRepository(
      prisma as unknown as PrismaClient,
    );

    const provider = await repository.findByIdForIdentity('identity-1', 'provider-1');

    expect(provider?.credentialRef).toBe('credential-test');

    await repository.save({
      id: 'provider-1' as AIProviderConfigServerDTO['id'],
      identityId: 'identity-1' as AIProviderConfigServerDTO['identityId'],
      name: 'Main provider',
      providerDefinitionId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      credentialRef: 'credential-test' as AIProviderConfigServerDTO['credentialRef'],
      defaultModel: 'gpt-4o-mini',
      isActive: true,
      isDefault: true,
      priority: 100,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    });

    expect(prisma.aiProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          credentialRef: 'credential-test',
        }),
        update: expect.objectContaining({
          credentialRef: 'credential-test',
        }),
      }),
    );
    const upsertInput = vi.mocked(prisma.aiProviderConfig.upsert).mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(upsertInput.create).not.toHaveProperty('availableModels');
    expect(upsertInput.update).not.toHaveProperty('availableModels');
  });

  it('constructs without a cipher/key because repositories never resolve credentials', async () => {
    const originalKey = process.env.AI_PROVIDER_ENCRYPTION_KEY;
    delete process.env.AI_PROVIDER_ENCRYPTION_KEY;
    try {
      const aiProviderConfig = {
        count: vi.fn(async () => 0),
        findUnique: vi.fn(async () => null),
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 1 })),
        upsert: vi.fn(async () => undefined),
      };
      const transactionClient = {
        aiProviderConfig,
        $queryRawUnsafe: vi.fn(async () => [{ acquired: true }]),
      };
      const prisma = {
        aiProviderConfig,
        $transaction: vi.fn(async (callback) => callback(transactionClient)),
      };
      // No cipher injected and no env key: construction must NOT throw (lazy),
      // and operations that never touch encrypted fields must work.
      const repository = new AIProviderConfigPrismaRepository(prisma as unknown as PrismaClient);
      await expect(repository.findByIdForIdentity('identity-1', 'provider-1')).resolves.toBeNull();

      await expect(repository.save({
          id: 'provider-1' as AIProviderConfigServerDTO['id'],
          identityId: 'identity-1' as AIProviderConfigServerDTO['identityId'],
          name: 'Main provider',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          credentialRef: 'credential-test' as AIProviderConfigServerDTO['credentialRef'],
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          priority: 100,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        })).resolves.toBe('SAVED');
    } finally {
      if (originalKey === undefined) {
        delete process.env.AI_PROVIDER_ENCRYPTION_KEY;
      } else {
        process.env.AI_PROVIDER_ENCRYPTION_KEY = originalKey;
      }
    }
  });

  it('selects a default through one transaction and never clears it for an unavailable provider', async () => {
    const aiProviderConfig = {
      findFirst: vi.fn(async () => ({ id: 'provider-2' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    };
    const transactionClient = {
      aiProviderConfig,
      $queryRawUnsafe: vi.fn(async () => [{ acquired: true }]),
    };
    const prisma = {
      aiProviderConfig,
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    };
    const repository = new AIProviderConfigPrismaRepository(prisma as unknown as PrismaClient);

    await expect(repository.setDefaultForIdentity('identity-1', 'provider-2')).resolves.toBe('SET');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(aiProviderConfig.updateMany).toHaveBeenCalledTimes(2);
    expect(aiProviderConfig.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { identityId: 'identity-1', id: { not: 'provider-2' } },
    });

    aiProviderConfig.findFirst.mockResolvedValueOnce(null);
    await expect(repository.setDefaultForIdentity('identity-1', 'missing')).resolves.toBe(
      'NOT_FOUND',
    );
    expect(aiProviderConfig.updateMany).toHaveBeenCalledTimes(2);
  });

  it('uses a blocking identity lock so competing selections serialize instead of failing', async () => {
    const aiProviderConfig = {
      findFirst: vi.fn(async () => ({ id: 'provider-2' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    };
    const transactionClient = {
      aiProviderConfig,
      $queryRawUnsafe: vi.fn(async () => [{}]),
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    };
    const repository = new AIProviderConfigPrismaRepository(prisma as unknown as PrismaClient);

    await expect(repository.setDefaultForIdentity('identity-1', 'provider-2')).resolves.toBe('SET');
    expect(transactionClient.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS acquired',
      'identity-1',
    );
    expect(aiProviderConfig.findFirst).toHaveBeenCalledOnce();
    expect(aiProviderConfig.updateMany).toHaveBeenCalledTimes(2);
  });

  it('rolls back clearing the old default when selecting the new default fails', async () => {
    const persisted = { provider1: true, provider2: false };
    const prisma = {
      $transaction: vi.fn(async (callback) => {
        const working = { ...persisted };
        let updateCount = 0;
        const tx = {
          $queryRawUnsafe: vi.fn(async () => [{ acquired: true }]),
          aiProviderConfig: {
            findFirst: vi.fn(async () => ({ id: 'provider-2' })),
            updateMany: vi.fn(async () => {
              updateCount += 1;
              if (updateCount === 1) {
                working.provider1 = false;
                return { count: 1 };
              }
              throw new Error('injected write failure');
            }),
          },
        };
        const result = await callback(tx);
        Object.assign(persisted, working);
        return result;
      }),
    };
    const repository = new AIProviderConfigPrismaRepository(prisma as unknown as PrismaClient);

    await expect(repository.setDefaultForIdentity('identity-1', 'provider-2')).rejects.toThrow(
      'injected write failure',
    );
    expect(persisted).toEqual({ provider1: true, provider2: false });
  });
});
