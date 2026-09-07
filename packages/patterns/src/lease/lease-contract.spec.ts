import { describe, expect, it } from 'vitest';
import { LeaseLostError, type LeaseCoordinatorPort } from './index';

describe('lease contract', () => {
  it('provides one shared lease-lost marker', () => {
    const error = new LeaseLostError('lost');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LeaseLostError');
    expect(error.message).toBe('lost');
  });

  it('keeps the coordinator seam structural', async () => {
    const coordinator: LeaseCoordinatorPort = {
      async execute(_key, task) {
        return { acquired: true, value: await task({ ensureHeld: async () => undefined }) };
      },
    };
    await expect(coordinator.execute('job', async (guard) => {
      await guard.ensureHeld();
      return 1;
    })).resolves.toEqual({ acquired: true, value: 1 });
  });
});
