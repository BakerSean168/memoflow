import { describe, expect, it, vi } from 'vitest';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import { createAIProviderConfigServerDTO } from '../../../../testing';
import { DeleteAIProviderUseCase } from './delete-ai-provider.use-case';

describe('DeleteAIProviderUseCase', () => {
  it('revokes the owned credential before deleting the connection', async () => {
    const provider = createAIProviderConfigServerDTO();
    const events: string[] = [];
    const repository = {
      findByIdForIdentity: vi.fn(async () => provider),
      delete: vi.fn(async () => {
        events.push('delete');
      }),
    };
    const secretVault = {
      revoke: vi.fn(async () => {
        events.push('revoke');
      }),
    };
    const useCase = new DeleteAIProviderUseCase(repository as never, secretVault as never);

    await expect(useCase.execute('identity-1', String(provider.id))).resolves.toMatchObject({
      ok: true,
    });

    expect(secretVault.revoke).toHaveBeenCalledWith({
      identityId: 'identity-1',
      credentialRef: provider.credentialRef,
    });
    expect(events).toEqual(['revoke', 'delete']);
  });

  it('leaves the connection visible and fail-closed when revocation fails, so retry is safe', async () => {
    const provider = createAIProviderConfigServerDTO();
    const repository = {
      findByIdForIdentity: vi.fn(async () => provider),
      delete: vi.fn(async () => undefined),
    };
    const secretVault = {
      revoke: vi
        .fn()
        .mockRejectedValueOnce(new Error('vault unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const useCase = new DeleteAIProviderUseCase(repository as never, secretVault as never);

    await expect(useCase.execute('identity-1', String(provider.id))).rejects.toThrow(
      'vault unavailable',
    );
    expect(repository.delete).not.toHaveBeenCalled();

    await expect(useCase.execute('identity-1', String(provider.id))).resolves.toMatchObject({
      ok: true,
    });
    expect(secretVault.revoke).toHaveBeenCalledTimes(2);
    expect(repository.delete).toHaveBeenCalledOnce();
  });

  it('does not revoke or delete a connection owned by another identity', async () => {
    const provider = {
      ...createAIProviderConfigServerDTO(),
      identityId: 'identity-other' as AIProviderConfigServerDTO['identityId'],
    };
    const repository = {
      findByIdForIdentity: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    };
    const secretVault = { revoke: vi.fn() };
    const useCase = new DeleteAIProviderUseCase(repository as never, secretVault as never);

    await expect(useCase.execute('identity-1', String(provider.id))).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(secretVault.revoke).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
