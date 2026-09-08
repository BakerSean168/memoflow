import { describe, expect, it } from 'vitest';
import { RefAllocator, type ExportContext } from '../../portable-runtime';
import { projectGoalRecords } from '../projections/goal.projection';
import { projectReminderResponses } from '../projections/reminder.projection';
import { projectResources } from '../projections/repository.projection';
import { projectTaskOccurrences } from '../projections/task.projection';

function createExportContext(refs: Record<string, string> = {}): ExportContext {
  return {
    identityId: 'identity-1',
    exportedAt: '2026-06-03T00:00:00.000Z',
    refAllocator: new RefAllocator(),
    warnings: [],
    refToIdMap: new Map(Object.entries(refs)),
  };
}

describe('projection ref safety', () => {


  it('fails export when a goal record requires an unresolved key result ref', () => {
    const ctx = createExportContext();

    expect(() =>
      projectGoalRecords(
        [{ id: 'record-db-id', keyResultId: 'missing-key-result', value: 1 }],
        ctx,
      ),
    ).toThrow('EXPORT_VALIDATION_ERROR: Unresolved goal record reference to missing-key-result');
  });

  it('fails export when a task instance requires an unresolved template ref', () => {
    const ctx = createExportContext();

    expect(() =>
      projectTaskOccurrences(
        [
          {
            id: 'instance-db-id',
            templateId: 'missing-template',
            instanceDate: Date.now(),
            importance: 'moderate',
            status: 'pending',
          },
        ],
        ctx,
      ),
    ).toThrow('EXPORT_VALIDATION_ERROR: Unresolved task reference to missing-template');
  });

  it('fails export when a resource requires an unresolved repository ref', () => {
    const ctx = createExportContext();

    expect(() =>
      projectResources(
        [
          {
            id: 'resource-db-id',
            repositoryId: 'missing-repository',
            type: 'markdown',
            name: 'note.md',
            path: '/note.md',
            status: 'ACTIVE',
          },
        ],
        ctx,
      ),
    ).toThrow('EXPORT_VALIDATION_ERROR: Unresolved repository reference to missing-repository');
  });

  it('fails export when a reminder response requires an unresolved template ref', () => {
    const ctx = createExportContext();

    expect(() =>
      projectReminderResponses(
        [
          {
            id: 'response-db-id',
            reminderTemplateId: 'missing-reminder-template',
            action: 'ack',
            timestamp: '2026-06-03T00:00:00.000Z',
          },
        ],
        ctx,
      ),
    ).toThrow(
      'EXPORT_VALIDATION_ERROR: Unresolved reminder reference to missing-reminder-template',
    );
  });
});
