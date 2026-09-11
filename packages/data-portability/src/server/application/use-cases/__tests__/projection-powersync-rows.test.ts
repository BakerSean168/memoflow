import { describe, expect, it } from 'vitest';
import { RefAllocator, type ExportContext } from '../../portable-runtime';
import { projectGoalRecords, projectGoals } from '../projections/goal.projection';
import {
  projectReminderResponses,
  projectReminderTemplates,
} from '../projections/reminder.projection';
import { projectScheduleTasks } from '../projections/schedule.projection';
import { projectTaskPlans } from '../projections/task.projection';

function createExportContext(refs: Record<string, string> = {}): ExportContext {
  return {
    identityId: 'identity-1',
    exportedAt: '2026-06-03T00:00:00.000Z',
    refAllocator: new RefAllocator(),
    warnings: [],
    refToIdMap: new Map(Object.entries(refs)),
  };
}

describe('projection from PowerSync-shaped rows', () => {
  it('exports goal children and records from flattened rows without leaking ids', () => {
    const ctx = createExportContext();

    const goals = projectGoals(
      [
        {
          id: 'goal-db-id',
          name: 'Ship portability',
          summary: 'Ship portability',
          status: 'InProgress',
          keyResults: [
            {
              id: 'kr-db-id',
              title: 'Round trip passes',
              aggregationMethod: 'Sum',
              startingValue: 0,
              progressBaselineValue: null,
              targetValue: 1,
              currentValue: 1,
              weight: 2,
              order: 3,
            },
          ],
          goalReviews: [],
        },
      ],
      ctx,
    );
    const records = projectGoalRecords(
      [
        {
          id: 'record-db-id',
          keyResultId: 'kr-db-id',
          value: 1,
          recordedAt: '2026-06-03T00:00:00.000Z',
        },
      ],
      ctx,
    );

    expect(goals[0]).toMatchObject({
      _ref: 'goal:1',
      summary: 'Ship portability',
      status: 'InProgress',
      keyResults: [
        {
          _ref: 'keyResult:1',
          calculationMethod: 'Sum',
          startingValue: 0,
          progressBaselineValue: null,
          targetValue: 1,
          currentValue: 1,
          sortOrder: 3,
        },
      ],
    });
    expect(records[0]?.keyResultRef).toBe('keyResult:1');
    expect(JSON.stringify({ goals, records })).not.toContain('kr-db-id');
  });

  it('exports task templates from flattened persistence fields', () => {
    const ctx = createExportContext({
      'goal-db-id': 'goal:1',
      'kr-db-id': 'keyResult:1',
    });

    const templates = projectTaskPlans(
      [
        {
          id: 'task-db-id',
          name: 'Write tests',
          status: 'active',
          importance: 'moderate',
          tags: '["qa"]',
          recurrenceRuleType: 'Daily',
          recurrenceRuleInterval: 1,
          goalId: 'goal-db-id',
          keyResultId: 'kr-db-id',
          goalRecordValue: 2.5,
          goalProgressTrigger: 'EachCompletion',
          checklist: '[{"title":"cover IPC","order":0}]',
          reminderConfigEnabled: 1,
          reminderConfigTimeOffsetMinutes: 15,
          reminderConfigUnit: 'Minute',
        },
      ],
      ctx,
    );

    expect(templates[0]).toMatchObject({
      title: 'Write tests',
      taskType: 'Recurring',
      tags: ['qa'],
      goalRef: 'goal:1',
      keyResultRef: 'keyResult:1',
      contribution: { value: 2.5, trigger: 'EachCompletion' },
      checklist: [{ title: 'cover IPC', order: 0 }],
      reminderConfig: {
        enabled: true,
        triggers: [{ relativeValue: 15, relativeUnit: 'Minute' }],
      },
    });
    expect(templates[0]).not.toHaveProperty('goalBinding');
    expect(templates[0]).not.toHaveProperty('goalRecordValue');
    expect(templates[0]).not.toHaveProperty('goalProgressTrigger');
  });


  it('exports a Task Goal link without inventing a zero contribution', () => {
    const ctx = createExportContext({
      'goal-db-id': 'goal:1',
      'kr-db-id': 'keyResult:1',
    });
    const [template] = projectTaskPlans([
      {
        id: 'task-link-only',
        name: 'Read linked context',
        status: 'Active',
        outcome: 'Open',
        completionPolicy: 'AllowCorrection',
        importance: 'moderate',
        tags: '[]',
        goalId: 'goal-db-id',
        keyResultId: 'kr-db-id',
        goalRecordValue: null,
        goalProgressTrigger: null,
        checklist: '[]',
      },
    ], ctx);

    expect(template).toMatchObject({
      goalRef: 'goal:1',
      keyResultRef: 'keyResult:1',
      contribution: null,
    });
  });

  it('exports reminders from PowerSync names, refs, JSON strings, and integer booleans', () => {
    const ctx = createExportContext({ 'group-db-id': 'reminderGroup:1' });
    const templates = projectReminderTemplates(
      [
        {
          id: 'template-db-id',
          name: 'Standup',
          type: 'once',
          trigger: '{"kind":"time"}',
          activeTime: '{"start":"09:00"}',
          notificationConfig: '{"channel":"system"}',
          selfEnabled: 1,
          status: 'active',
          importanceLevel: 'moderate',
          tags: '["work"]',
        },
      ],
      [
        {
          identityId: 'identity-1',
          profileId: 'group-db-id',
          routineId: 'template-db-id',
          enabled: 0,
        },
      ],
      [
        {
          id: 'template-db-id',
          identityId: 'identity-1',
          enabled: 1,
          triggerJson: '{"type":"WallClock"}',
        },
      ],
      ctx,
    );
    const responses = projectReminderResponses(
      [
        {
          id: 'response-db-id',
          templateId: 'template-db-id',
          action: 'clicked',
          timestamp: '2026-06-03T00:00:00.000Z',
        },
      ],
      ctx,
    );

    expect(templates[0]).toMatchObject({
      title: 'Standup',
      trigger: { kind: 'time' },
      selfEnabled: true,
      routineDefinition: {
        enabled: true,
        trigger: { type: 'WallClock' },
      },
      profileMemberships: [
        { profileRef: 'reminderGroup:1', enabled: false },
      ],
      tags: ['work'],
    });
    expect(responses[0]?.templateRef).toBe('reminderTemplate:1');
  });

  it('keeps schedule task required payloads present for re-import', () => {
    const ctx = createExportContext();

    const tasks = projectScheduleTasks(
      [
        {
          id: 'schedule-task-db-id',
          name: 'Run source',
          sourceModule: 'task',
          sourceEntityId: 'missing-source-id',
          status: 'active',
          enabled: true,
          cronExpression: '0 9 * * *',
          timezone: 'Asia/Shanghai',
          maxRetries: 5,
          retryableStatuses: '["FAILED"]',
          payload: '{"kind":"metadata"}',
        },
      ],
      ctx,
    );

    expect(tasks[0]).toMatchObject({
      enabled: true,
      schedule: { cronExpression: '0 9 * * *', timezone: 'Asia/Shanghai' },
      retryPolicy: { maxRetries: 5, retryableStatuses: ['FAILED'] },
      metadata: { kind: 'metadata' },
    });
    expect(Object.prototype.hasOwnProperty.call(tasks[0], 'schedule')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(tasks[0], 'execution')).toBe(true);
  });

});
