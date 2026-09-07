import { describe, expect, it, vi } from 'vitest';
import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../../domain/aggregates/reminder-template';
import type { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import { ReminderTemplateClientMapper } from './reminder-template-client.mapper';

describe('ReminderTemplateClientMapper', () => {
  it('preserves the bounded history loaded for list schedule-state presentation', async () => {
    const dto = {
      id: 'template-1',
      history: [{ id: 'history-1', result: 'Failed' }],
    } as unknown as ReminderTemplateClientDTO;
    const toClientDTO = vi.fn(() => dto);
    const template = {
      id: 'template-1',
      groupId: null,
      effectiveEnabled: true,
      toClientDTO,
    } as unknown as ReminderTemplate;
    const controlService = {
      calculateEffectiveStatusBatch: vi.fn(async () => [
        {
          templateId: 'template-1',
          isEffectivelyEnabled: true,
          lifecycleSource: 'template',
          statusReason: 'Template controls itself.',
          groupEnabled: null,
          globalReminderEnabled: true,
        },
      ]),
    };
    const reminderDomainService = {
      getControlService: () => controlService,
    } as unknown as ReminderDomainService;
    const groupRepository = {
      findByIds: vi.fn(async () => []),
    } as unknown as IReminderGroupRepository;
    const mapper = new ReminderTemplateClientMapper(reminderDomainService, groupRepository);

    const result = await mapper.toDTOList([template]);

    expect(toClientDTO).toHaveBeenCalledWith(true);
    expect(result[0]?.history).toEqual([{ id: 'history-1', result: 'Failed' }]);
  });
});
