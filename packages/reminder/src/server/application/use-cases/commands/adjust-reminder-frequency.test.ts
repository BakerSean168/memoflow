import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdjustReminderFrequencyUseCase } from './adjust-reminder-frequency.use-case';
import { eventBus } from '@memoflow/utils/domain';

describe('AdjustReminderFrequencyUseCase', () => {
  const repo = {
    findByIdForIdentity: vi.fn(),
    save: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns NOT_FOUND when template is not found', async () => {
    repo.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new AdjustReminderFrequencyUseCase(repo);

    const result = await useCase.execute({
      templateId: 'tpl-1',
      newInterval: 30,
      reason: 'manual tune',
      identityId: 'identity-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('returns BAD_REQUEST when template trigger is not interval-based', async () => {
    repo.findByIdForIdentity.mockResolvedValue({
      trigger: {
        type: 'EventBased',
        fixedTime: null,
        interval: null,
      },
      update: vi.fn(),
    });
    const useCase = new AdjustReminderFrequencyUseCase(repo);

    const result = await useCase.execute({
      templateId: 'tpl-1',
      newInterval: 45,
      reason: 'manual tune',
      identityId: 'identity-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BAD_REQUEST');
    }
  });

  it('updates interval and persists template', async () => {
    const update = vi.fn();
    const template = {
      trigger: {
        type: 'Interval',
        fixedTime: null,
        interval: {
          minutes: 60,
        },
      },
      update,
    };
    repo.findByIdForIdentity.mockResolvedValue(template);
    repo.save.mockResolvedValue(undefined);
    const eventSpy = vi.spyOn(eventBus, 'send');
    const useCase = new AdjustReminderFrequencyUseCase(repo);

    const result = await useCase.execute({
      templateId: 'tpl-1',
      newInterval: 30,
      reason: 'engagement drop',
      identityId: 'identity-1',
    });

    expect(update).toHaveBeenCalledWith({
      trigger: {
        type: 'Interval',
        fixedTime: null,
        interval: {
          minutes: 30,
        },
      },
    });
    expect(repo.save).toHaveBeenCalledWith(template);
    expect(eventSpy).toHaveBeenCalledWith(
      'reminder:frequency-adjusted',
      expect.objectContaining({
        templateId: 'tpl-1',
        originalInterval: 60,
        adjustedInterval: 30,
        reason: 'engagement drop',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(
        expect.objectContaining({
          templateId: 'tpl-1',
          originalInterval: 60,
          adjustedInterval: 30,
        }),
      );
    }
  });

});
