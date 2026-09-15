import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { LabelChannels } from '@memoflow/contracts/electron';
import { createLabelHttpClient, createLabelIpcClient, toLabelClientDTO } from './index';

describe('Label client seam', () => {
  it('keeps identity ownership out of the renderer DTO', () => {
    expect(
      toLabelClientDTO({
        id: 'label-1',
        identityId: 'identity-secret',
        name: 'Work',
        normalizedName: 'work',
        color: '#ffffff',
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toEqual({ id: 'label-1', name: 'Work', color: '#ffffff', createdAt: 1, updatedAt: 2 });
  });

  it('uses the canonical HTTP current-user endpoints', async () => {
    const get = vi.fn().mockResolvedValue(ok([]));
    const post = vi.fn().mockResolvedValue(ok({ id: 'label-1' }));
    const client = createLabelHttpClient({ get, post } as never);
    await client.listLabels({ search: 'work', limit: 20 });
    await client.createLabel({ name: 'Work' });
    expect(get).toHaveBeenCalledWith('/labels', { params: { search: 'work', limit: 20 } });
    expect(post).toHaveBeenCalledWith('/labels', { name: 'Work' });
  });

  it('uses only canonical LabelChannels over IPC', async () => {
    const invoke = vi.fn().mockResolvedValue(ok([]));
    const client = createLabelIpcClient({ invoke } as never);
    await client.listLabels();
    await client.createLabel({ name: 'Health', color: null });
    expect(invoke).toHaveBeenNthCalledWith(1, LabelChannels.LIST, {});
    expect(invoke).toHaveBeenNthCalledWith(2, LabelChannels.CREATE, {
      name: 'Health',
      color: null,
    });
  });
});
