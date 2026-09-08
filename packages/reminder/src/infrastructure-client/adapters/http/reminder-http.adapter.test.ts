import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { ReminderTemplateClientDTO, UpdateReminderTemplateReq } from '@memoflow/contracts/reminder';
import { ReminderHttpAdapter } from './reminder-http.adapter';

function createHttpClientStub(overrides?: Partial<IResultHttpClient>): IResultHttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

describe('ReminderHttpAdapter', () => {
  it('updates reminder templates with the registered PUT route', async () => {
    const response = { id: 'template-1', name: 'Updated reminder' } as ReminderTemplateClientDTO;
    const put = vi.fn().mockResolvedValue(ok(response));
    const patch = vi.fn();
    const httpClient = createHttpClientStub({ put, patch });
    const adapter = new ReminderHttpAdapter(httpClient);
    const request = { title: 'Updated reminder' } satisfies UpdateReminderTemplateReq;

    await expect(adapter.updateReminderTemplate('template-1', request)).resolves.toEqual(ok(response));

    expect(put).toHaveBeenCalledWith('/reminders/templates/template-1', request);
    expect(patch).not.toHaveBeenCalled();
  });

  it('toggles reminder profiles through the canonical group toggle route', async () => {
    const response = { id: 'group-1', name: 'Work' };
    const post = vi.fn().mockResolvedValue(ok(response));
    const httpClient = createHttpClientStub({ post });
    const adapter = new ReminderHttpAdapter(httpClient);

    await expect(adapter.toggleReminderGroupStatus('group-1')).resolves.toEqual(ok(response));

    expect(post).toHaveBeenCalledWith('/reminders/groups/group-1/toggle', {});
    expect(post).not.toHaveBeenCalledWith('/reminders/groups/group-1/toggle-status', {});
  });

  it('does not resurrect retired per-user list or toggle-status HTTP paths', async () => {
    const get = vi.fn().mockResolvedValue(ok({ templates: [] }));
    const post = vi.fn().mockResolvedValue(ok({ id: 'group-1' }));
    const httpClient = createHttpClientStub({ get, post });
    const adapter = new ReminderHttpAdapter(httpClient);

    await adapter.getReminderTemplates();
    await adapter.getReminderGroups();
    await adapter.toggleReminderGroupStatus('group-1');

    for (const call of [...get.mock.calls, ...post.mock.calls]) {
      expect(String(call[0])).not.toContain('/mine');
      expect(String(call[0])).not.toContain('/toggle-status');
    }
  });
});
