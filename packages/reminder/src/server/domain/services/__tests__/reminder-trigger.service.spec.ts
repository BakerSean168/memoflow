import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TriggerResult, ReminderType } from '@memoflow/contracts/reminder';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import { ReminderTriggerService } from '../reminder-trigger-service';

function createTemplate() {
  return ReminderTemplate.create({
    identityId: IdentityId.generate(),
    title: 'Template',
    type: ReminderType.Recurring,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '08:00', timezone: null },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() - 60_000 },
    notificationConfig: {
      channels: ['InApp'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
  });
}

describe('ReminderTriggerService', () => {
  const templateRepository = {
    save: vi.fn(),
  } as any;
  const controlService = {
    isTemplateEffectivelyEnabled: vi.fn(),
  } as any;

  let service: ReminderTriggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReminderTriggerService(templateRepository, controlService);
  });

  it('skips disabled templates without recording history', async () => {
    const template = createTemplate();
    controlService.isTemplateEffectivelyEnabled.mockResolvedValue(false);

    const result = await service.triggerReminder({ template, triggerTime: 123 });

    expect(result).toEqual({
      ok: false,
      result: TriggerResult.Skipped,
      triggerTime: 123,
      nextTriggerTime: null,
      message: '模板未启用或被分组禁用',
    });
    expect(template.getAllHistory()).toHaveLength(0);
    expect(templateRepository.save).not.toHaveBeenCalled();
  });

  it('records exactly one success history when a template triggers', async () => {
    const template = createTemplate();
    controlService.isTemplateEffectivelyEnabled.mockResolvedValue(true);

    const result = await service.triggerReminder({ template, triggerTime: 456 });

    expect(result.ok).toBe(true);
    expect(result.result).toBe(TriggerResult.Success);
    expect(result.historyId).toBeDefined();
    expect(template.getAllHistory()).toHaveLength(1);
    expect(templateRepository.save).toHaveBeenCalledWith(template);
  });

  it('records failure and skipped histories without duplicating entries', async () => {
    const template = createTemplate();

    await service.recordTriggerFailure(template, 'boom', 100);
    await service.recordTriggerSkipped(template, 'not now', 200);

    expect(template.getAllHistory()).toHaveLength(2);
    expect(template.getAllHistory()[0].result).toBe(TriggerResult.Failed);
    expect(template.getAllHistory()[1].result).toBe(TriggerResult.Skipped);
    expect(templateRepository.save).toHaveBeenCalledTimes(2);
  });

  it('returns failed batch results when a single trigger throws', async () => {
    vi.spyOn(service, 'triggerReminder')
      .mockResolvedValueOnce({
        ok: true,
        result: TriggerResult.Success,
        triggerTime: 1,
        nextTriggerTime: 2,
        message: 'ok',
      })
      .mockRejectedValueOnce(new Error('boom'));

    const results = await service.triggerRemindersBatch([
      { template: createTemplate(), triggerTime: 1 },
      { template: createTemplate(), triggerTime: 2 },
    ]);

    expect(results).toEqual([
      expect.objectContaining({ ok: true, result: TriggerResult.Success }),
      expect.objectContaining({
        ok: false,
        result: TriggerResult.Failed,
        triggerTime: 2,
        nextTriggerTime: null,
        message: 'boom',
      }),
    ]);
  });

  it('delegates next-trigger calculation to the aggregate', () => {
    const template = {
      calculateNextTrigger: vi.fn().mockReturnValue(999),
    } as any;

    expect(service.calculateNextTriggerTime(template, 123)).toBe(999);
    expect(template.calculateNextTrigger).toHaveBeenCalled();
  });

});
