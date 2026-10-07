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
});
