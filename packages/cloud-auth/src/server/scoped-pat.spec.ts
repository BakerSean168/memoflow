import { describe, expect, it, vi } from 'vitest';
import { createScopedPatService } from './scoped-pat';

describe('External scoped PAT boundary', () => {
  it('uses the injected Account owner authority without touching its table', async () => {
    const accountIsActive = vi.fn().mockResolvedValue(false);
    const service = createScopedPatService({
      database: {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({
            $executeRaw: vi.fn(),
            cloudAuthUser: { findUnique: vi.fn().mockResolvedValue({ disabledAt: null }) },
          }),
      } as never,
      audience: 'https://api.memo.test/mcp',
      accountIsActive,
    });
    await expect(service.create('identity-a', { name: 'pilot' })).rejects.toThrow(
      'Inactive account',
    );
    expect(accountIsActive).toHaveBeenCalledWith('identity-a', undefined);
  });
  it('rejects session-shaped and duplicate bearer credentials before reading storage', async () => {
    const findUnique = vi.fn();
    const service = createScopedPatService({
      database: {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({ $executeRaw: vi.fn(), externalAgentPat: { findUnique } }),
      } as never,
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
    });
    expect(await service.authenticate('Bearer session-token')).toBeNull();
    expect(await service.authenticate('Bearer mfp_invalid, Bearer mfp_invalid')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('signs the granted lifetime, defaulting to 90 days and capping at 365', async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      revokedAt: null,
    }));
    const service = createScopedPatService({
      database: {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({
            $executeRaw: vi.fn(),
            cloudAuthUser: { findUnique: vi.fn().mockResolvedValue({ disabledAt: null }) },
          }),
        externalAgentPat: { create },
      } as never,
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
    });
    const daysBetween = (expiresAt: Date, started: number) =>
      Math.round((expiresAt.getTime() - started) / 86400000);

    const defaultedAt = Date.now();
    await service.create('identity-a', { name: 'default' });
    await service.create('identity-a', { name: 'yearly', expiresInDays: 365 });
    expect(daysBetween(create.mock.calls[0][0].data.expiresAt as Date, defaultedAt)).toBe(90);
    expect(daysBetween(create.mock.calls[1][0].data.expiresAt as Date, defaultedAt)).toBe(365);

    await expect(
      service.create('identity-a', { name: 'too long', expiresInDays: 366 }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('authenticates a PAT containing notification and schedule read scopes (#995)', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'pat-domain',
      userId: 'identity-a',
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
      scopes: ['notifications:read', 'schedules:read'],
    });
    const service = createScopedPatService({
      database: {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({
            $executeRaw: vi.fn(),
            externalAgentPat: { findUnique },
            cloudAuthUser: { findUnique: vi.fn().mockResolvedValue({ disabledAt: null }) },
          }),
      } as never,
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
    });
    expect(await service.authenticate(`Bearer mfp_${'c'.repeat(43)}`)).toEqual({
      identityId: 'identity-a',
      credentialId: 'pat-domain',
      credentialType: 'pat',
      scopes: ['notifications:read', 'schedules:read'],
    });
  });

  it('rejects a revoked grant even when a credential digest matches', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'pat-id',
      userId: 'identity-a',
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: new Date(),
      scopes: ['goals:read'],
    });
    const service = createScopedPatService({
      database: {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({ $executeRaw: vi.fn(), externalAgentPat: { findUnique } }),
      } as never,
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
    });
    expect(await service.authenticate(`Bearer mfp_${'a'.repeat(43)}`)).toBeNull();
  });

  it('authenticates a PAT containing relations:read scope', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'pat-rel',
      userId: 'identity-a',
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
      scopes: ['relations:read'],
    });
    const service = createScopedPatService({
      database: {
        $transaction: async (run: (tx: unknown) => unknown) =>
          run({
            $executeRaw: vi.fn(),
            externalAgentPat: { findUnique },
            cloudAuthUser: { findUnique: vi.fn().mockResolvedValue({ disabledAt: null }) },
          }),
      } as never,
      audience: 'https://api.memo.test/mcp',
      accountIsActive: async () => true,
    });
    const principal = await service.authenticate(`Bearer mfp_${'b'.repeat(43)}`);
    expect(principal).toEqual({
      identityId: 'identity-a',
      credentialId: 'pat-rel',
      credentialType: 'pat',
      scopes: ['relations:read'],
    });
  });
});
