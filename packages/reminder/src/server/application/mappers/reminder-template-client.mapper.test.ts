import { describe, expect, it, vi } from 'vitest';
import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../../domain/aggregates/reminder-template';
import type { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import { ReminderTemplateClientMapper } from './reminder-template-client.mapper';

describe('ReminderTemplateClientMapper', () => {
  it('preserves bounded history while enriching the canonical ProfileMembership read model', async () => {
    const dto = {
      id: 'template-1',
      history: [{ id: 'history-1', result: 'Failed' }],
      profileMemberships: [],
    } as unknown as ReminderTemplateClientDTO;
    const toClientDTO = vi.fn(() => dto);
    const template = {
      id: 'template-1',
      effectiveEnabled: true,
      toClientDTO,
    } as unknown as ReminderTemplate;
    const controlService = {
      calculateEffectiveStatusBatch: vi.fn(async () => [
        {
          templateId: 'template-1',
          isEffectivelyEnabled: true,
          lifecycleSource: 'profile',
          statusReason: 'At least one ProfileMembership path is enabled.',
          globalReminderEnabled: true,
          profileMemberships: [
            {
              profileId: 'work',
              profileName: 'Work',
              enabled: true,
              profileEnabled: true,
              profileActive: true,
              effectiveEnabled: true,
            },
          ],
        },
      ]),
    };
    const reminderDomainService = {
      getControlService: () => controlService,
    } as unknown as ReminderDomainService;
    const mapper = new ReminderTemplateClientMapper(reminderDomainService);

    const result = await mapper.toDTOList([template]);

    expect(toClientDTO).toHaveBeenCalledWith(true);
    expect(result[0]?.history).toEqual([{ id: 'history-1', result: 'Failed' }]);
    expect(result[0]?.profileMemberships).toEqual([
      expect.objectContaining({ profileId: 'work', profileName: 'Work', effectiveEnabled: true }),
    ]);
    expect(result[0]?.lifecycleSource).toBe('profile');
  });
});
