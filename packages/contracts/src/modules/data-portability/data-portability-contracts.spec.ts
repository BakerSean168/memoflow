import { describe, expect, it } from 'vitest';
import {
  ExportServerHeldDataDisclosureReqSchema,
  ExportUserDataReqSchema,
  ImportUserDataReqSchema,
  parseUserDataExportEnvelope,
  PortableAIDataSchema,
  PortableEditorDataSchema,
  PortableGoalDataSchema,
  PortableRefSchema,
  PortableReminderDataSchema,
  PortableRepositoryDataSchema,
  PortableScheduleDataSchema,
  PortableSettingsSchema,
  PortableTaskDataSchema,
  PortableUserDataV2Schema,
  ServerHeldDataDisclosureEnvelopeV1Schema,
} from './index';

const baseEnvelope = {
  kind: 'memoflow.user-data-export' as const,
  schemaVersion: 2 as const,
  exportedAt: '2026-08-26T00:00:00.000Z',
  scope: {
    includesBinaryResources: false as const,
    importMode: 'append-create-like' as const,
  },
};

const validGoal = {
  _ref: 'goal:1',
  name: 'Ship Core vNext',
  status: 'Active',
  sortOrder: 0,
  keyResults: [
    {
      _ref: 'keyResult:1',
      title: 'All gates pass',
      calculationMethod: 'Sum',
      startingValue: 0,
      progressBaselineValue: null,
      targetValue: 10,
      currentValue: 3,
      unit: 'gates',
      weight: 1,
      sortOrder: 0,
    },
  ],
  goalReviews: [],
};

const validTask = {
  _ref: 'taskPlan:1',
  title: 'Write tests',
  taskType: 'OneTime',
  importance: 'moderate',
  tags: [],
  status: 'Active',
  outcome: 'Open',
  completionPolicy: 'AllowCorrection',
  goalRef: 'goal:1',
  keyResultRef: 'keyResult:1',
  contribution: { value: 2.5, trigger: 'EachCompletion' },
  checklist: [],
  timeConfig: {},
};

describe('parseUserDataExportEnvelope V2', () => {
  it('accepts the current business-backup envelope', () => {
    expect(parseUserDataExportEnvelope({ ...baseEnvelope, data: {} }).ok).toBe(true);
  });

  it('rejects stale V1 business-backup envelopes', () => {
    const result = parseUserDataExportEnvelope({ ...baseEnvelope, schemaVersion: 1, data: {} });
    expect(result).toEqual({
      ok: false,
      error: 'Envelope validation failed: schemaVersion — Invalid input: expected 2',
    });
  });

  it('rejects the server-held disclosure envelope as non-importable', () => {
    const result = parseUserDataExportEnvelope({ kind: 'memoflow.server-held-data-disclosure' });
    expect(result).toEqual({
      ok: false,
      error:
        'Server-held data disclosure is not importable. Export/import only memoflow.user-data-export business backups.',
    });
  });

  it('rejects missing data', () => {
    expect(parseUserDataExportEnvelope(baseEnvelope).ok).toBe(false);
  });

  it('rejects identity fields inside the strict canonical preference profile', () => {
    const result = parseUserDataExportEnvelope({
      ...baseEnvelope,
      data: {
        settings: {
          preferences: {
            presentation: { theme: 'dark', language: 'en-US', identityId: 'leaked-identity' },
            regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
          },
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('identityId');
  });

  it('rejects nested auth or persistent IDs inside otherwise open metadata', () => {
    const auth = parseUserDataExportEnvelope({
      ...baseEnvelope,
      data: {
        repositories: {
          repositories: [
            {
              _ref: 'repository:1',
              name: 'Knowledge',
              type: 'local',
              config: { auth: { token: 'x' } },
              status: 'ACTIVE',
            },
          ],
          folders: [],
          resources: [],
        },
      },
    });
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.error).toContain('data.repositories.repositories.0.config.auth');

    const persistentId = parseUserDataExportEnvelope({
      ...baseEnvelope,
      data: {
        repositories: {
          repositories: [],
          folders: [],
          resources: [
            {
              _ref: 'resource:1',
              repositoryRef: 'repository:1',
              type: 'markdown',
              name: 'note.md',
              path: '/note.md',
              status: 'ACTIVE',
              metadata: { source: { resourceId: 'db-id' } },
            },
          ],
        },
      },
    });
    expect(persistentId.ok).toBe(false);
    if (!persistentId.ok) expect(persistentId.error).toContain('metadata.source.resourceId');
  });

  it('allows sensitive-looking words inside user-authored string values', () => {
    const result = parseUserDataExportEnvelope({
      ...baseEnvelope,
      data: {
        ai: {
          conversations: [
            {
              _ref: 'aiConversation:1',
              name: 'Chat',
              status: 'ACTIVE',
              messages: [
                {
                  _ref: 'aiMessage:1',
                  role: 'user',
                  content: 'Remember to rotate the API token after migration.',
                },
              ],
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe('request contracts', () => {
  it('validates export/import requests', () => {
    expect(ExportUserDataReqSchema.safeParse({}).success).toBe(true);
    expect(ExportUserDataReqSchema.safeParse({ include: ['goals', 'tasks'] }).success).toBe(true);
    expect(ExportUserDataReqSchema.safeParse({ include: ['invalid'] }).success).toBe(false);
    expect(ImportUserDataReqSchema.safeParse({ content: '{}', dryRun: true }).success).toBe(true);
    expect(ImportUserDataReqSchema.safeParse({}).success).toBe(false);
  });

  it('keeps the server-held disclosure request a separate contract', () => {
    expect(ExportServerHeldDataDisclosureReqSchema.safeParse({}).success).toBe(true);
  });
});

describe('PortableUserDataV2Schema', () => {
  it('accepts an empty backup and rejects unknown top-level modules', () => {
    expect(PortableUserDataV2Schema.safeParse({}).success).toBe(true);
    expect(PortableUserDataV2Schema.safeParse({ unknownModule: {} }).success).toBe(false);
  });

  it('composes canonical Goal and Task vNext shapes', () => {
    expect(
      PortableUserDataV2Schema.safeParse({
        goals: { items: [validGoal], records: [] },
        tasks: { templates: [validTask], instances: [] },
      }).success,
    ).toBe(true);
  });

  it('rejects persistent identity/database fields', () => {
    expect(
      PortableUserDataV2Schema.safeParse({
        settings: { preferences: {}, identityId: 'identity-1' },
      }).success,
    ).toBe(false);
  });
});

describe('Task Goal link / contribution portable contract', () => {
  it('supports both link-only and link+contribution Task plans', () => {
    expect(
      PortableTaskDataSchema.safeParse({ templates: [validTask], instances: [] }).success,
    ).toBe(true);
    expect(
      PortableTaskDataSchema.safeParse({
        templates: [{ ...validTask, contribution: null }],
        instances: [],
      }).success,
    ).toBe(true);
  });

  it('rejects contribution without the Goal/KR link', () => {
    expect(
      PortableTaskDataSchema.safeParse({
        templates: [{ ...validTask, goalRef: null, keyResultRef: null }],
        instances: [],
      }).success,
    ).toBe(false);
  });

  it('rejects retired flat contribution fields and opaque goalBinding blobs', () => {
    expect(
      PortableTaskDataSchema.safeParse({
        templates: [{ ...validTask, goalRecordValue: 2.5 }],
        instances: [],
      }).success,
    ).toBe(false);
    expect(
      PortableTaskDataSchema.safeParse({
        templates: [{ ...validTask, goalBinding: { goalId: 'goal-db-id' } }],
        instances: [],
      }).success,
    ).toBe(false);
  });
});

describe('module schemas', () => {
  it('accepts canonical Goal vNext data', () => {
    expect(PortableGoalDataSchema.safeParse({ items: [validGoal], records: [] }).success).toBe(
      true,
    );
  });

  it('accepts canonical Reminder data', () => {
    expect(
      PortableReminderDataSchema.safeParse({ groups: [], templates: [], responses: [] }).success,
    ).toBe(true);
  });

  it('accepts repository, schedule, editor, AI, and settings empty shapes', () => {
    expect(
      PortableRepositoryDataSchema.safeParse({ repositories: [], folders: [], resources: [] })
        .success,
    ).toBe(true);
    expect(PortableScheduleDataSchema.safeParse({ entries: [], tasks: [] }).success).toBe(true);
    expect(PortableEditorDataSchema.safeParse({ workspaces: [] }).success).toBe(true);
    expect(PortableAIDataSchema.safeParse({ conversations: [] }).success).toBe(true);
    expect(
      PortableSettingsSchema.safeParse({
        preferences: {
          presentation: { theme: 'auto', language: 'en-US' },
          regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
        },
      }).success,
    ).toBe(true);
  });
});

describe('portable reference format', () => {
  it.each([
    ['goal:1', true],
    ['taskPlan:42', true],
    ['badref', false],
    ['Goal:1', false],
    ['goal:abc', false],
  ])('%s validity = %s', (value, valid) => {
    expect(PortableRefSchema.safeParse(value).success).toBe(valid);
  });
});

describe('server-held disclosure schema', () => {
  it('keeps disclosure explicitly non-importable', () => {
    const result = ServerHeldDataDisclosureEnvelopeV1Schema.safeParse({
      kind: 'memoflow.server-held-data-disclosure',
      schemaVersion: 1,
      disclosedAt: '2026-08-26T00:00:00.000Z',
      subject: { identityId: 'identity-1' },
      scope: {
        importMode: 'not-importable',
        includesImportableBusinessDataBackup: false,
        includesLocalVaultFiles: false,
        includesGithubRepositoryHistory: false,
        includesApplicationManagedReplayableGithubAuthorization: false,
        includesNonReplayableGithubInstallationIdentifiers: true,
        includesCachedAttachmentBytes: true,
        includesEphemeralWorkerLeases: false,
        includesDatabaseInternalRetrievalVector: false,
      },
      data: {
        knowledgeSpaces: [],
        knowledgeRemoteBindings: [],
        remoteRepositoryObservations: [],
        remoteHistoryFences: [],
        knowledgeProjectionCheckpoints: [],
        githubWebhookDeliveries: [],
        knowledgeNoteProjections: [],
        knowledgeAttachmentProjections: [],
        knowledgeAttachmentContentCaches: [],
        knowledgeWriteRequests: [],
        aiKnowledgeIndexEntries: [],
      },
    });
    expect(result.success).toBe(true);
  });
});
