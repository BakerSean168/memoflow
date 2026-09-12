import { describe, expect, it, vi } from 'vitest';
import { createCloudAccountProvisionerFromRepository } from './cloud-account-provisioner';
import { createFixedClock } from '@memoflow/time';

describe('CloudAccountProvisioner', () => {
  const clock = createFixedClock(1_700_000_000_000);
  it('creates the Account projection when Better Auth creates a user', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };
    const provisioner = createCloudAccountProvisionerFromRepository(repository as never, clock);

    await provisioner.provision({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
      name: 'User',
      emailVerified: false,
    });

    expect(repository.save).toHaveBeenCalledOnce();
    expect(repository.save.mock.calls[0]![0].toServerDTO()).not.toHaveProperty('email');
    expect(repository.save.mock.calls[0]![0].profile.nickname).toBe('User');
  });

  it('falls back to the email-derived nickname when the cloud display name is invalid', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };
    const provisioner = createCloudAccountProvisionerFromRepository(repository as never, clock);

    await provisioner.provision({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000002',
      email: 'fallback@example.com',
      name: 'x',
      emailVerified: false,
    });

    expect(repository.save.mock.calls[0]![0].profile.nickname).toBe('fallback');
  });

  it('does not rewrite an existing Account when Cloud Auth email verification changes', async () => {
    const initialRepository = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };
    const initial = createCloudAccountProvisionerFromRepository(initialRepository as never, clock);
    await initial.provision({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
      name: 'User',
      emailVerified: false,
    });
    const account = initialRepository.save.mock.calls[0]![0];
    const repository = { findById: vi.fn().mockResolvedValue(account), save: vi.fn() };
    const provisioner = createCloudAccountProvisionerFromRepository(repository as never, clock);

    await provisioner.provision({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
      email: 'changed@example.com',
      name: 'Changed Auth Name',
      emailVerified: true,
    });

    expect(repository.save).not.toHaveBeenCalled();
    expect(account.toServerDTO()).not.toHaveProperty('email');
    expect(account.profile.nickname).toBe('User');
  });

  it('does not rewrite an existing Account while the cloud email is still unverified', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({ id: 'existing-account' }),
      save: vi.fn(),
    };
    const provisioner = createCloudAccountProvisionerFromRepository(repository as never, clock);

    await provisioner.provision({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000002',
      email: 'user@example.com',
      name: 'User',
      emailVerified: false,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
