import { describe, expect, it } from 'vitest';
import { TaskPortablePayloadV3Schema } from './portable-v3';

function payload() {
  return {
    plans: [
      {
        ref: 'tasks:1',
        title: 'Portable Task',
        description: null,
        schedule: { kind: 'OneTime', date: '2026-09-14', timing: { kind: 'AllDay' } },
        reminderConfig: null,
        importance: 'Moderate',
        status: 'Active',
        outcome: 'Open',
        completionPolicy: 'AllowCorrection',
        closedAt: null,
        archived: false,
        abandonedReason: null,
        goalLink: null,
        labelRefs: ['labels:1'],
        checklist: [{ ref: 'tasks:2', title: 'Proof', order: 0 }],
      },
    ],
    occurrences: [
      {
        ref: 'tasks:3',
        planRef: 'tasks:1',
        scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
        importanceSnapshot: 'Moderate',
        status: 'Pending',
        actualStartAt: null,
        result: null,
        checklistState: [
          {
            definitionRef: 'tasks:2',
            titleSnapshot: 'Proof',
            orderSnapshot: 0,
            completed: false,
            completedAt: null,
          },
        ],
      },
    ],
  };
}

describe('Task portable V3 contracts', () => {
  it('rejects a terminal status without its matching result kind', () => {
    const missing = structuredClone(payload());
    missing.occurrences[0]!.status = 'Completed';
    expect(TaskPortablePayloadV3Schema.safeParse(missing).success).toBe(false);

    const mismatched = structuredClone(payload());
    mismatched.occurrences[0]!.status = 'Missed';
    mismatched.occurrences[0]!.result = {
      kind: 'Skipped',
      recordedAt: 1,
      reason: null,
    } as never;
    expect(TaskPortablePayloadV3Schema.safeParse(mismatched).success).toBe(false);
  });

  it('rejects a terminal result on a Pending/InProgress occurrence', () => {
    const invalid = structuredClone(payload());
    invalid.occurrences[0]!.result = {
      kind: 'Completed',
      recordedAt: 1,
      actualDurationMinutes: null,
      note: null,
      rating: null,
    } as never;

    expect(TaskPortablePayloadV3Schema.safeParse(invalid).success).toBe(false);
  });

  it('accepts terminal statuses paired with their matching result', () => {
    const completed = structuredClone(payload());
    completed.occurrences[0]!.status = 'Completed';
    completed.occurrences[0]!.result = {
      kind: 'Completed',
      recordedAt: 1,
      actualDurationMinutes: null,
      note: null,
      rating: null,
    } as never;
    expect(TaskPortablePayloadV3Schema.safeParse(completed).success).toBe(true);
  });

  it('rejects duplicate occurrence keys for the same plan and schedule date', () => {
    const duplicated = structuredClone(payload());
    duplicated.occurrences.push({
      ...structuredClone(duplicated.occurrences[0]!),
      ref: 'tasks:4',
    });

    expect(TaskPortablePayloadV3Schema.safeParse(duplicated).success).toBe(false);
  });

  it('accepts the same schedule date across different plans', () => {
    const shared = structuredClone(payload());
    shared.plans.push({
      ...structuredClone(shared.plans[0]!),
      ref: 'tasks:5',
      title: 'Second Task',
      goalLink: null,
      labelRefs: [],
      checklist: [{ ref: 'tasks:6', title: 'Proof', order: 0 }],
    });
    shared.occurrences.push({
      ...structuredClone(shared.occurrences[0]!),
      ref: 'tasks:7',
      planRef: 'tasks:5',
      checklistState: [
        {
          definitionRef: 'tasks:6',
          titleSnapshot: 'Proof',
          orderSnapshot: 0,
          completed: false,
          completedAt: null,
        },
      ],
    });

    expect(TaskPortablePayloadV3Schema.safeParse(shared).success).toBe(true);
  });
});
