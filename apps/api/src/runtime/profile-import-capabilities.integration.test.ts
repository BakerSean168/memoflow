import { afterAll, beforeEach, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { createDataPortabilityModule } from '@memoflow/data-portability';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { composeProfileImportCapabilities } from './compose-profile-import-capabilities';

beforeEach(cleanAll);
afterAll(disconnectPrisma);

it('joins all ten capabilities to one transaction without historical delivery or duplicate facts', async () => {
  const db = await getPrisma();
  const account = await seedAccount({
    profile: {
      nickname: 'Target',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    },
  });
  const content = JSON.stringify({
    format: 'memoflow.user-data-export',
    schemaVersion: 3,
    exportedAt: '2026-10-09T00:00:00Z',
    productVersion: 'test',
    capabilities: [
      { key: 'preferences', schemaVersion: 3, payload: createDefaultUserPreferenceProfile() },
      {
        key: 'account-profile',
        schemaVersion: 3,
        payload: {
          nickname: 'Copied',
          realName: null,
          avatarUrl: null,
          bio: 'Source bio',
          gender: 'PreferNotToSay',
          birthday: null,
        },
      },
      {
        key: 'notification-delivery-preferences',
        schemaVersion: 3,
        payload: { globalChannels: { Email: false }, workflowOverrides: {} },
      },
      { key: 'labels', schemaVersion: 3, payload: { labels: [] } },
      { key: 'goals', schemaVersion: 3, payload: { goals: [] } },
      { key: 'tasks', schemaVersion: 3, payload: { plans: [], occurrences: [] } },
      {
        key: 'schedules',
        schemaVersion: 3,
        payload: {
          entries: [
            {
              ref: 'schedules:1',
              title: 'Restored meeting',
              description: null,
              range: { kind: 'AllDay', start: '2026-10-09', end: '2026-10-10' },
              location: null,
              attendees: null,
            },
          ],
        },
      },
      {
        key: 'ai-conversations',
        schemaVersion: 3,
        payload: {
          conversations: [
            { ref: 'ai-conversations:1', name: 'Archived discussion', status: 'Archived' },
          ],
        },
      },
      {
        key: 'routines',
        schemaVersion: 3,
        payload: {
          preferences: { globalEnabled: false },
          definitions: [
            {
              ref: 'routines:1',
              name: 'Stretch',
              description: null,
              enabled: false,
              trigger: null,
              activatedAt: null,
            },
          ],
          profiles: [{ ref: 'routines:2', name: 'Workday', description: null, enabled: true }],
          memberships: [{ routineRef: 'routines:1', profileRef: 'routines:2', enabled: true }],
          overrides: [],
          occurrences: [
            {
              ref: 'routines:3',
              routineRef: 'routines:1',
              occurrenceKey: 'historical-1',
              triggerKind: 'Elapsed',
              scheduledFor: null,
              becameDueAt: 1000,
              resolutionState: 'Satisfied',
              resolvedAt: 2000,
              resolutionKind: 'ExplicitComplete',
              resolutionReason: null,
            },
          ],
          interactions: [
            {
              ref: 'routines:4',
              occurrenceRef: 'routines:3',
              action: 'Completed',
              actedAt: 2000,
              responseLatencyMs: null,
              snoozeDurationMs: null,
            },
          ],
        },
      },
      {
        key: 'notifications',
        schemaVersion: 3,
        payload: {
          facts: [
            {
              ref: 'notifications:1',
              workflowKey: 'routine.intervention',
              topic: 'routine.due',
              title: 'Historical reminder',
              content: 'Stretch',
              type: 'Reminder',
              category: 'Reminder',
              importance: 'Important',
              urgency: 'High',
              relatedEntityType: null,
              navigationIntent: null,
              actions: [{ kind: 'archive', actionKey: 'archive', labelKey: 'archive' }],
              presentation: null,
              readAt: 2000,
              archivedAt: 2000,
              expiresAt: null,
            },
          ],
          interactions: [
            {
              ref: 'notifications:2',
              notificationRef: 'notifications:1',
              actionKey: 'archive',
              actionKind: 'archive',
              occurredAt: 2000,
              outcome: 'accepted',
            },
          ],
        },
      },
    ],
  });
  async function apply(fault: boolean) {
    return db.$transaction(
      async (tx) => {
        const capabilities = composeProfileImportCapabilities(tx);
        expect(capabilities).toHaveLength(10);
        const result = await createDataPortabilityModule({
          portableCapabilities: capabilities,
        }).portableCapabilityCoordinator.applyProfileCopy(content, account.id, 'ten-owner-batch');
        if (fault) throw new Error('fault after ten owners');
        return result;
      },
      { timeout: 15_000 },
    );
  }
  await expect(apply(true)).rejects.toThrow('fault after ten owners');
  expect(await db.userPreferenceRecord.count()).toBe(0);
  expect(await db.notification.count()).toBe(0);
  expect(await db.routineOccurrence.count()).toBe(0);
  expect(await db.aiConversation.count()).toBe(0);
  expect(
    (await db.account.findUniqueOrThrow({ where: { id: account.id } })).profile,
  ).not.toHaveProperty('bio', 'Source bio');
  const committed = await apply(false);
  await apply(false);
  expect(await db.userPreferenceRecord.count()).toBe(2);
  expect(await db.notification.count()).toBe(1);
  expect(await db.notificationInteraction.count()).toBe(1);
  expect(await db.routineDefinition.count()).toBe(1);
  expect(await db.routineProfileMembership.count()).toBe(1);
  expect(await db.routineOccurrence.count()).toBe(1);
  expect(await db.routineInteraction.count()).toBe(1);
  expect(await db.aiConversation.count()).toBe(1);
  expect(await db.schedule.count()).toBe(1);
  expect(await db.notificationDispatchOutbox.count()).toBe(0);
  expect(await db.taskGoalOutbox.count()).toBe(0);
  const verifier = createDataPortabilityModule({
    portableCapabilities: composeProfileImportCapabilities(db),
  }).portableCapabilityCoordinator;
  const readback = () =>
    verifier.readProfileManifests(
      account.id,
      committed.bindings,
      committed.manifests.map((entry) => entry.key),
    );
  expect(await readback()).toEqual(committed.manifests);
  await db.aiConversation.create({
    data: {
      id: 'unrelated-later-conversation',
      identityId: account.id,
      name: 'Later',
      status: 'Active',
    },
  });
  expect(await readback()).toEqual(committed.manifests);
  await db.aiConversation.updateMany({
    where: { identityId: account.id, name: 'Archived discussion' },
    data: { name: 'Changed content' },
  });
  expect(await readback()).not.toEqual(committed.manifests);
});

it('preserves custom target profile/preferences in the copy plan without writing during preflight', async () => {
  const db = await getPrisma();
  const account = await seedAccount({
    profile: {
      nickname: 'Keep target',
      realName: 'Target name',
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    },
  });
  const owner = composeProfileImportCapabilities(db).find(
    (entry) => entry.key === 'account-profile',
  )!;
  const source = {
    nickname: 'Source',
    realName: 'Source name',
    avatarUrl: null,
    bio: 'Copy bio',
    gender: 'PreferNotToSay',
    birthday: null,
  };
  const refs = {
    declareExportReference: () => 'account-profile:1',
    resolveExportReference: () => 'account-profile:1',
    bindImportedReference: () => undefined,
    resolveImportedReference: () => 'unused',
  };
  const plan = await owner.planProfileImport!(source, { identityId: account.id, references: refs });
  expect(plan.payload).toMatchObject({
    nickname: 'Keep target',
    realName: 'Target name',
    bio: 'Copy bio',
  });
  expect(plan.preservedFields).toEqual(['nickname', 'realName']);
  expect(
    (await db.account.findUniqueOrThrow({ where: { id: account.id } })).profile,
  ).toHaveProperty('bio', null);
});

it('preserves non-default Setting, explicit notification choices and the Routine master gate', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const defaults = createDefaultUserPreferenceProfile();
  await db.userPreferenceRecord.create({
    data: {
      identityId: account.id,
      namespace: 'presentation',
      payload: { theme: 'dark', language: 'en-US' },
    },
  });
  await db.notificationPreference.create({
    data: {
      id: 'preference-target',
      identityId: account.id,
      globalChannels: JSON.stringify({ Email: false }),
      workflowOverrides: '{}',
    },
  });
  await db.routinePreference.create({
    data: { id: 'routine-preference', identityId: account.id, globalEnabled: false },
  });
  const owners = composeProfileImportCapabilities(db);
  const references = {
    declareExportReference: () => 'routines:1',
    resolveExportReference: () => 'routines:1',
    bindImportedReference: () => undefined,
    resolveImportedReference: () => 'unused',
  };
  const context = { identityId: account.id, references };
  const preferencePlan = await owners.find((owner) => owner.key === 'preferences')!
    .planProfileImport!(defaults, context);
  expect(preferencePlan.payload).toMatchObject({
    presentation: { theme: 'dark', language: 'en-US' },
  });
  expect(preferencePlan.preservedFields).toEqual(['presentation.theme', 'presentation.language']);
  const notificationPlan = await owners.find(
    (owner) => owner.key === 'notification-delivery-preferences',
  )!.planProfileImport!(
    { globalChannels: { Email: true, Desktop: false }, workflowOverrides: {} },
    context,
  );
  expect(notificationPlan.payload).toEqual({
    globalChannels: { Email: false, Desktop: false },
    workflowOverrides: {},
  });
  expect(notificationPlan.preservedFields).toEqual(['globalChannels.Email']);
  const routine = owners.find((owner) => owner.key === 'routines')!;
  const exported = await routine.export(context);
  const routinePlan = await routine.planProfileImport!(
    { ...(exported as object), preferences: { globalEnabled: true } },
    context,
  );
  expect(routinePlan.payload).toMatchObject({ preferences: { globalEnabled: false } });
  expect(routinePlan.preservedFields).toEqual(['preferences.globalEnabled']);
  expect((await db.userPreferenceRecord.findFirstOrThrow()).revision).toBe(1);
});

it('does not resurrect an imported AI shell deleted after a previous standalone apply', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const coordinator = createDataPortabilityModule({
    portableCapabilities: composeProfileImportCapabilities(db),
  }).portableCapabilityCoordinator;
  const content = JSON.stringify({
    format: 'memoflow.user-data-export',
    schemaVersion: 3,
    exportedAt: '2026-10-09',
    productVersion: 'test',
    capabilities: [
      {
        key: 'ai-conversations',
        schemaVersion: 3,
        payload: {
          conversations: [{ ref: 'ai-conversations:1', name: 'Copied', status: 'Active' }],
        },
      },
    ],
  });
  await coordinator.apply(content, account.id, 'ai-stable-batch');
  await db.aiConversation.updateMany({
    where: { identityId: account.id },
    data: { deletedAt: new Date() },
  });
  await expect(coordinator.apply(content, account.id, 'ai-stable-batch')).rejects.toThrow(
    'deterministic target conflicts',
  );
  expect(await db.aiConversation.count({ where: { deletedAt: null } })).toBe(0);
});
