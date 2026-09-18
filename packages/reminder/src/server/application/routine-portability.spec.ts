import { describe, expect, it, vi } from 'vitest';
import {
  PortableReferenceV3Schema,
  type PortableCapabilityExecutionContext,
  type PortableReferencePort,
  type PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { asInstant } from '@memoflow/time';
import {
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
  createElapsedTrigger,
  createSnoozeOverride,
} from '../domain/routine';
import type {
  ProfileMembership as ProfileMembershipFact,
  RoutineDefinition as RoutineDefinitionFact,
  RoutineProfile as RoutineProfileFact,
  RoutineTemporaryOverride,
} from '../domain/routine';
import type {
  RoutineOccurrenceFact,
  RoutineOccurrenceTruthStore,
  RoutineProfileStore,
  RoutineTemporaryOverrideStore,
} from '../domain/ports';
import type { RoutineInteractionFact, RoutineInteractionApplyReceipt } from '../domain/ports';
import { RoutinePortableCapability } from './routine-portability';

class FakeReferences implements PortableReferencePort {
  private readonly counters = new Map<string, number>();
  private readonly exports = new Map<string, PortableReferenceV3>();
  private readonly imports = new Map<PortableReferenceV3, string>();

  declareExportReference(capabilityKey: string, sourceKey: string): PortableReferenceV3 {
    const mapKey = `${capabilityKey}:${sourceKey}`;
    const existing = this.exports.get(mapKey);
    if (existing) return existing;
    const next = (this.counters.get(capabilityKey) ?? 0) + 1;
    this.counters.set(capabilityKey, next);
    const value = PortableReferenceV3Schema.parse(`${capabilityKey}:${next}`);
    this.exports.set(mapKey, value);
    return value;
  }

  resolveExportReference(capabilityKey: string, sourceKey: string): PortableReferenceV3 {
    const value = this.exports.get(`${capabilityKey}:${sourceKey}`);
    if (!value) throw new Error(`missing export reference ${capabilityKey}:${sourceKey}`);
    return value;
  }

  bindImportedReference(portableRef: PortableReferenceV3, targetKey: string): void {
    this.imports.set(portableRef, targetKey);
  }

  resolveImportedReference(portableRef: PortableReferenceV3): string {
    const value = this.imports.get(portableRef);
    if (!value) throw new Error(`missing import reference ${portableRef}`);
    return value;
  }
}

function context(references: PortableReferencePort): PortableCapabilityExecutionContext {
  return { identityId: 'identity-routine', batchId: 'batch-routine-v3', references };
}

function makeStores() {
  let definitions: RoutineDefinitionFact[] = [];
  let profiles: RoutineProfileFact[] = [];
  let memberships: ProfileMembershipFact[] = [];
  const overrides = new Map<string, RoutineTemporaryOverride>();
  let occurrences: RoutineOccurrenceFact[] = [];
  let interactions: RoutineInteractionFact[] = [];

  const profileStore: RoutineProfileStore = {
    upsertDefinition: vi.fn(async (definition) => {
      definitions = [...definitions.filter((item) => item.id !== definition.id), definition];
    }),
    updateDefinition: vi.fn(async () => {}),
    createDefinitionWithMemberships: vi.fn(async ({ definition, memberships: next }) => {
      definitions = [...definitions, definition];
      memberships = [...memberships, ...next];
    }),
    findDefinition: vi.fn(async ({ routineId }) => definitions.find((item) => item.id === routineId) ?? null),
    listDefinitions: vi.fn(async () => [...definitions]),
    deleteDefinition: vi.fn(async () => {}),
    upsertProfile: vi.fn(async (profile) => {
      profiles = [...profiles.filter((item) => item.id !== profile.id), profile];
    }),
    updateProfile: vi.fn(async () => {}),
    findProfile: vi.fn(async ({ profileId }) => profiles.find((item) => item.id === profileId) ?? null),
    listProfiles: vi.fn(async () => [...profiles]),
    findProfilesByIds: vi.fn(async ({ profileIds }) => profiles.filter((item) => profileIds.includes(item.id))),
    deleteProfile: vi.fn(async () => {}),
    upsertMembership: vi.fn(async (membership) => {
      memberships = [
        ...memberships.filter(
          (item) => item.routineId !== membership.routineId || item.profileId !== membership.profileId,
        ),
        membership,
      ];
    }),
    listMembershipsForRoutine: vi.fn(async ({ routineId }) =>
      memberships.filter((item) => item.routineId === routineId),
    ),
    listMembershipsForRoutines: vi.fn(async ({ routineIds }) =>
      memberships.filter((item) => routineIds.includes(item.routineId)),
    ),
    listMembershipsForProfile: vi.fn(async ({ profileId }) =>
      memberships.filter((item) => item.profileId === profileId),
    ),
    deleteMembership: vi.fn(async () => {}),
    replaceRoutineMemberships: vi.fn(async ({ routineId, memberships: next }) => {
      memberships = [...memberships.filter((item) => item.routineId !== routineId), ...next];
    }),
  };

  const overrideStore: RoutineTemporaryOverrideStore = {
    findRoutineTemporaryOverride: vi.fn(async ({ routineId }) => overrides.get(routineId) ?? null),
    setRoutineTemporaryOverride: vi.fn(async ({ routineId, override }) => {
      overrides.set(routineId, override);
    }),
    clearRoutineTemporaryOverride: vi.fn(async ({ routineId }) => {
      overrides.delete(routineId);
    }),
  };

  const occurrenceStore: RoutineOccurrenceTruthStore = {
    ensureOpenOccurrence: vi.fn(async (input) => {
      const current = occurrences.find(
        (item) =>
          item.identityId === input.identityId &&
          item.routineId === input.routineId &&
          item.occurrenceKey === input.occurrenceKey,
      );
      if (current) return current;
      const created: RoutineOccurrenceFact = {
        id: `occurrence-${occurrences.length + 1}`,
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        triggerKind: input.triggerKind,
        scheduledFor: input.scheduledFor == null ? null : asInstant(Number(input.scheduledFor)),
        becameDueAt: asInstant(Number(input.becameDueAt)),
        sourceRevision: input.sourceRevision == null ? null : String(input.sourceRevision),
        resolutionState: 'Open',
        resolvedAt: null,
        resolutionKind: null,
        resolutionReason: null,
      };
      occurrences = [...occurrences, created];
      return created;
    }),
    findOccurrence: vi.fn(async (input) =>
      occurrences.find(
        (item) =>
          item.identityId === input.identityId &&
          item.routineId === input.routineId &&
          item.occurrenceKey === input.occurrenceKey,
      ) ?? null,
    ),
    listOccurrences: vi.fn(async () => [...occurrences]),
    resolveOccurrence: vi.fn(async (input) => {
      const current = occurrences.find(
        (item) =>
          item.identityId === input.identityId &&
          item.routineId === input.routineId &&
          item.occurrenceKey === input.occurrenceKey,
      );
      if (!current) throw new Error('missing occurrence');
      const resolved: RoutineOccurrenceFact = {
        ...current,
        resolutionState: input.state,
        resolvedAt: asInstant(Number(input.resolvedAt)),
        resolutionKind: input.resolutionKind,
        resolutionReason: input.reason ?? null,
      };
      occurrences = [...occurrences.filter((item) => item !== current), resolved];
      return resolved;
    }),
    applyInteraction: vi.fn(async (input): Promise<RoutineInteractionApplyReceipt> => {
      const existing = interactions.find((item) => item.idempotencyKey === input.idempotencyKey);
      if (existing) {
        const occurrence = occurrences.find(
          (item) => item.routineId === input.routineId && item.occurrenceKey === input.occurrenceKey,
        );
        if (!occurrence) throw new Error('missing interaction occurrence');
        return { interaction: existing, occurrence, replayed: true };
      }
      const interaction: RoutineInteractionFact = {
        id: `interaction-${interactions.length + 1}`,
        idempotencyKey: input.idempotencyKey,
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        action: input.action,
        actedAt: asInstant(Number(input.actedAt)),
        responseLatencyMs: input.responseLatencyMs ?? null,
        snoozeDurationMs: input.snoozeDurationMs ?? null,
        metadata: input.metadata ?? null,
      };
      interactions = [...interactions, interaction];
      const occurrence = occurrences.find(
        (item) => item.routineId === input.routineId && item.occurrenceKey === input.occurrenceKey,
      );
      if (!occurrence) throw new Error('missing interaction occurrence');
      return { interaction, occurrence, replayed: false };
    }),
    listInteractions: vi.fn(async ({ routineId, occurrenceKey }) =>
      interactions.filter((item) => item.routineId === routineId && item.occurrenceKey === occurrenceKey),
    ),
    listInteractionsForIdentity: vi.fn(async ({ identityId }) =>
      interactions.filter((item) => item.identityId === identityId),
    ),
  };

  return {
    profileStore,
    overrideStore,
    occurrenceStore,
    state: {
      get definitions() {
        return definitions;
      },
      get profiles() {
        return profiles;
      },
      get memberships() {
        return memberships;
      },
      get overrides() {
        return overrides;
      },
      get occurrences() {
        return occurrences;
      },
      get interactions() {
        return interactions;
      },
    },
  };
}

function seedSource(stores: ReturnType<typeof makeStores>): void {
  const now = new Date(1_758_000_000_000);
  const definition = RoutineDefinition.create({
    id: 'routine-source',
    identityId: 'identity-routine',
    name: 'Stretch',
    description: 'Desk break',
    enabled: true,
    trigger: createElapsedTrigger({ durationMs: 900_000, anchor: 'last-satisfied' }),
    now,
  });
  const profile = RoutineProfile.create({
    id: 'profile-source',
    identityId: 'identity-routine',
    name: 'Workday',
    description: null,
    enabled: true,
    now,
  });
  const membership = ProfileMembership.create({
    identityId: 'identity-routine',
    routineId: definition.id,
    profileId: profile.id,
    enabled: true,
    now,
  });
  const override = createSnoozeOverride({
    now: 1_758_000_000_000,
    durationMs: 60_000,
    reason: 'meeting',
    source: 'user',
  });
  const occurrence: RoutineOccurrenceFact = {
    id: 'occurrence-source',
    identityId: 'identity-routine',
    routineId: definition.id,
    occurrenceKey: 'routine:routine-source:oc:1758000000000',
    triggerKind: 'Elapsed',
    scheduledFor: null,
    becameDueAt: asInstant(1_758_000_000_000),
    sourceRevision: 'scheduler-attempt-should-not-export',
    resolutionState: 'Satisfied',
    resolvedAt: asInstant(1_758_000_060_000),
    resolutionKind: 'ExplicitComplete',
    resolutionReason: 'done',
  };
  const interaction: RoutineInteractionFact = {
    id: 'interaction-source',
    idempotencyKey: 'interaction-source-key',
    identityId: 'identity-routine',
    routineId: definition.id,
    occurrenceKey: occurrence.occurrenceKey,
    action: 'Completed',
    actedAt: asInstant(1_758_000_060_000),
    responseLatencyMs: 500,
    snoozeDurationMs: null,
    metadata: { surface: 'test' },
  };
  void stores.profileStore.upsertDefinition(definition);
  void stores.profileStore.upsertProfile(profile);
  void stores.profileStore.upsertMembership(membership);
  void stores.overrideStore.setRoutineTemporaryOverride({
    identityId: 'identity-routine',
    routineId: definition.id,
    override,
  });
  void stores.occurrenceStore.ensureOpenOccurrence({
    identityId: occurrence.identityId,
    routineId: occurrence.routineId,
    occurrenceKey: occurrence.occurrenceKey,
    triggerKind: occurrence.triggerKind,
    scheduledFor: occurrence.scheduledFor,
    becameDueAt: occurrence.becameDueAt,
    sourceRevision: occurrence.sourceRevision,
  }).then(() => stores.occurrenceStore.resolveOccurrence({
    identityId: occurrence.identityId,
    routineId: occurrence.routineId,
    occurrenceKey: occurrence.occurrenceKey,
    state: occurrence.resolutionState === 'Open' ? 'Satisfied' : occurrence.resolutionState,
    resolutionKind: occurrence.resolutionKind ?? 'ExplicitComplete',
    resolvedAt: occurrence.resolvedAt ?? occurrence.becameDueAt,
    reason: occurrence.resolutionReason,
  }));
  void stores.occurrenceStore.applyInteraction({
    idempotencyKey: interaction.idempotencyKey,
    identityId: interaction.identityId,
    routineId: interaction.routineId,
    occurrenceKey: interaction.occurrenceKey,
    action: interaction.action,
    actedAt: interaction.actedAt,
    responseLatencyMs: interaction.responseLatencyMs,
    snoozeDurationMs: interaction.snoozeDurationMs,
    metadata: interaction.metadata,
  });
}

describe('RoutinePortableCapability', () => {
  it('round-trips owner facts while omitting RuntimeContext and scheduler reliability state', async () => {
    const source = makeStores();
    seedSource(source);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const capability = new RoutinePortableCapability(
      source.profileStore,
      source.overrideStore,
      source.occurrenceStore,
    );
    const payload = await capability.export(context(new FakeReferences()));

    expect(payload.definitions).toHaveLength(1);
    expect(payload.profiles).toHaveLength(1);
    expect(payload.overrides).toHaveLength(1);
    expect(payload.occurrences[0]).not.toHaveProperty('sourceRevision');
    expect(payload).not.toHaveProperty('runtimeContext');
    expect(payload.interactions[0]).not.toHaveProperty('metadata');
    expect(payload.interactions).toHaveLength(1);

    const target = makeStores();
    const targetCapability = new RoutinePortableCapability(
      target.profileStore,
      target.overrideStore,
      target.occurrenceStore,
    );
    await expect(targetCapability.dryRun(payload, context(new FakeReferences()))).resolves.toMatchObject({
      created: 6,
      updated: 0,
      skipped: 0,
    });
    await targetCapability.apply(payload, context(new FakeReferences()));
    const roundTripped = await targetCapability.export(context(new FakeReferences()));
    expect(roundTripped).toEqual(payload);
  });

  it('converges an existing open occurrence to an imported durable resolution', async () => {
    const source = makeStores();
    seedSource(source);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sourceCapability = new RoutinePortableCapability(
      source.profileStore,
      source.overrideStore,
      source.occurrenceStore,
    );
    const payload = await sourceCapability.export(context(new FakeReferences()));

    const target = makeStores();
    const targetCapability = new RoutinePortableCapability(
      target.profileStore,
      target.overrideStore,
      target.occurrenceStore,
    );
    const preflightReferences = new FakeReferences();
    await targetCapability.dryRun(payload, context(preflightReferences));
    const routineId = preflightReferences.resolveImportedReference(payload.definitions[0]!.ref);
    const occurrence = payload.occurrences[0]!;
    await target.occurrenceStore.ensureOpenOccurrence({
      identityId: 'identity-routine',
      routineId,
      occurrenceKey: occurrence.occurrenceKey,
      triggerKind: occurrence.triggerKind,
      scheduledFor: occurrence.scheduledFor,
      becameDueAt: occurrence.becameDueAt,
      sourceRevision: null,
    });

    const receipt = await targetCapability.apply(payload, context(new FakeReferences()));
    expect(receipt.updated).toBeGreaterThanOrEqual(1);
    expect(target.state.occurrences[0]?.resolutionState).toBe('Satisfied');
  });

  it('fails closed when a membership or interaction references an absent owner fact', async () => {
    const stores = makeStores();
    const capability = new RoutinePortableCapability(
      stores.profileStore,
      stores.overrideStore,
      stores.occurrenceStore,
    );
    const invalidMembership = {
      definitions: [],
      profiles: [],
      memberships: [{ routineRef: 'routines:1', profileRef: 'routines:2', enabled: true }],
      overrides: [],
      occurrences: [],
      interactions: [],
    };
    await expect(
      capability.dryRun(invalidMembership as never, context(new FakeReferences())),
    ).rejects.toThrow('unknown definition');

    const invalidInteraction = {
      definitions: [],
      profiles: [],
      memberships: [],
      overrides: [],
      occurrences: [],
      interactions: [
        {
          ref: 'routines:1',
          occurrenceRef: 'routines:2',
          action: 'Completed',
          actedAt: 1,
          responseLatencyMs: null,
          snoozeDurationMs: null,
        },
      ],
    };
    await expect(
      capability.dryRun(invalidInteraction as never, context(new FakeReferences())),
    ).rejects.toThrow('unknown occurrence');
  });
});
