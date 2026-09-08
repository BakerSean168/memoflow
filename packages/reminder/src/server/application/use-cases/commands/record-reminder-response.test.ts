import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordReminderResponseUseCase } from './record-reminder-response.use-case';
import { eventBus } from '@memoflow/utils/domain';
import type { IReminderResponseRepository } from '../../../domain/repositories/i-reminder-response-repository';

describe('RecordReminderResponseUseCase', () => {
  const repo: IReminderResponseRepository = {
    save: vi.fn(),
    findByIdForIdentity: vi.fn(),
    findByTemplateId: vi.fn(),
    deleteByTemplateId: vi.fn(),
    getResponseStats: vi.fn(),
    getResponseDistribution: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo.save.mockResolvedValue(undefined);
  });

  it('records actual response latency and emits analytics without snooze delay', async () => {
    const eventSpy = vi.spyOn(eventBus, 'send');
    const useCase = new RecordReminderResponseUseCase(repo);

    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'DISMISSED',
      responseTime: 12,
      identityId: 'identity-1',
    });

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(eventSpy).toHaveBeenCalledWith(
      'reminder:response-recorded',
      expect.objectContaining({
        templateId: 'template-1',
        action: 'DISMISSED',
        responseTime: 12,
        snoozeDurationSeconds: null,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.responseTime).toBe(12);
      expect(result.data.snoozeDurationSeconds).toBeNull();
    }
  });

  it('rejects invalid response latency', async () => {
    const useCase = new RecordReminderResponseUseCase(repo);
    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'CLICKED',
      responseTime: 1.5,
      identityId: 'identity-1',
    });
    expect(result.ok).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('propagates when save fails', async () => {
    repo.save.mockRejectedValue(new Error('db down'));
    const useCase = new RecordReminderResponseUseCase(repo);

    await expect(
      useCase.execute({
        templateId: 'template-1',
        action: 'COMPLETED',
        identityId: 'identity-1',
      }),
    ).rejects.toThrow('db down');
  });

  it('loads responses by template with custom limit', async () => {
    repo.findByTemplateId.mockResolvedValue([{ id: 'r1' }]);
    const useCase = new RecordReminderResponseUseCase(repo);
    const result = await useCase.getResponsesByTemplate('template-1', 'identity-1', 5);
    expect(repo.findByTemplateId).toHaveBeenCalledWith('template-1', 'identity-1', 5);
    expect(result.ok).toBe(true);
  });

  it('deletes responses by template', async () => {
    repo.deleteByTemplateId.mockResolvedValue(3);
    const useCase = new RecordReminderResponseUseCase(repo);
    const result = await useCase.deleteResponsesByTemplate('template-1', 'identity-1');
    expect(repo.deleteByTemplateId).toHaveBeenCalledWith('template-1', 'identity-1');
    expect(result).toEqual(expect.objectContaining({ ok: true, data: 3 }));
  });

  it('returns response stats for a template', async () => {
    repo.getResponseStats.mockResolvedValue({
      total: 10,
      clicked: 4,
      ignored: 2,
      snoozed: 2,
      dismissed: 1,
      completed: 1,
      avgResponseTime: 15,
    });
    const useCase = new RecordReminderResponseUseCase(repo);
    const result = await useCase.getResponseStats('template-1', 'identity-1', 14);
    expect(repo.getResponseStats).toHaveBeenCalledWith('template-1', 'identity-1', 14);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });
});

describe('RecordReminderResponseUseCase snooze semantics', () => {
  const repo: IReminderResponseRepository = {
    save: vi.fn(),
    findByIdForIdentity: vi.fn(),
    findByTemplateId: vi.fn(),
    deleteByTemplateId: vi.fn(),
    getResponseStats: vi.fn(),
    getResponseDistribution: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo.save.mockResolvedValue(undefined);
  });

  it('rejects snooze without an explicit positive snooze duration', async () => {
    const writer = { snooze: vi.fn(async () => undefined) };
    const useCase = new RecordReminderResponseUseCase(repo, writer);
    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'SNOOZED',
      responseTime: 8,
      identityId: 'identity-1',
    });
    expect(result.ok).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
    expect(writer.snooze).not.toHaveBeenCalled();
  });

  it('fails closed when the host has no canonical snooze writer', async () => {
    const useCase = new RecordReminderResponseUseCase(repo);
    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'SNOOZED',
      snoozeDurationSeconds: 900,
      identityId: 'identity-1',
    });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }) }),
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('uses snoozeDurationSeconds for scheduling and keeps responseTime as analytics latency', async () => {
    const writer = { snooze: vi.fn(async () => undefined) };
    const useCase = new RecordReminderResponseUseCase(repo, writer);

    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'SNOOZED',
      responseTime: 7,
      snoozeDurationSeconds: 900,
      identityId: 'identity-1',
    });

    expect(result.ok).toBe(true);
    expect(writer.snooze).toHaveBeenCalledWith('template-1', 'identity-1', 900);
    if (result.ok) {
      expect(result.data.responseTime).toBe(7);
      expect(result.data.snoozeDurationSeconds).toBe(900);
    }
  });

  it('returns service unavailable when the durable snooze write fails', async () => {
    const writer = { snooze: vi.fn(async () => { throw new Error('override store down'); }) };
    const useCase = new RecordReminderResponseUseCase(repo, writer);

    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'SNOOZED',
      snoozeDurationSeconds: 300,
      identityId: 'identity-1',
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }) }),
    );
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects snoozeDurationSeconds on non-snooze actions', async () => {
    const writer = { snooze: vi.fn(async () => undefined) };
    const useCase = new RecordReminderResponseUseCase(repo, writer);
    const result = await useCase.execute({
      templateId: 'template-1',
      action: 'COMPLETED',
      responseTime: 10,
      snoozeDurationSeconds: 60,
      identityId: 'identity-1',
    });
    expect(result.ok).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
    expect(writer.snooze).not.toHaveBeenCalled();
  });
});
