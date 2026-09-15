import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/contracts/data-portability';
import {
  PreferencePortablePayloadV3Schema,
  type PreferenceNamespace,
  type PreferenceNamespaceResponse,
  type PreferencePortablePayloadV3,
} from '@memoflow/contracts/setting';
import type { UserPreferenceService } from './user-preference-service';

const NAMESPACES = ['presentation', 'regional'] as const satisfies readonly PreferenceNamespace[];
const MAX_CAS_ATTEMPTS = 3;

function changedKeys(
  current: Record<string, unknown>,
  target: Record<string, unknown>,
): string[] {
  return Object.keys(target).filter((key) => !Object.is(current[key], target[key]));
}

function namespaceTarget(
  profile: PreferencePortablePayloadV3,
  namespace: PreferenceNamespace,
): Record<string, unknown> {
  return profile[namespace] as unknown as Record<string, unknown>;
}

/** Canonical owner logic shared by standalone Settings import/export and Data Portability V3. */
export class PreferencePortableService {
  constructor(private readonly preferenceService: UserPreferenceService) {}

  async export(identityId: string): Promise<PreferencePortablePayloadV3> {
    return PreferencePortablePayloadV3Schema.parse(
      await this.preferenceService.getPreferenceProfile(identityId),
    );
  }

  async dryRun(
    identityId: string,
    payload: PreferencePortablePayloadV3,
  ): Promise<PortableCapabilityReceipt> {
    const target = PreferencePortablePayloadV3Schema.parse(payload);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const namespace of NAMESPACES) {
      const current = await this.preferenceService.getPreferenceNamespace(identityId, namespace);
      const changes = this.diffNamespace(current, namespaceTarget(target, namespace));
      if (current.revision === 0) created += 1;
      else if (changes.length > 0) updated += 1;
      else skipped += 1;
    }

    return { created, updated, skipped, warnings: [] };
  }

  async apply(
    identityId: string,
    payload: PreferencePortablePayloadV3,
  ): Promise<PortableCapabilityReceipt> {
    const target = PreferencePortablePayloadV3Schema.parse(payload);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const namespace of NAMESPACES) {
      const outcome = await this.applyNamespace(identityId, namespace, namespaceTarget(target, namespace));
      if (outcome === 'created') created += 1;
      else if (outcome === 'updated') updated += 1;
      else skipped += 1;
    }

    return { created, updated, skipped, warnings: [] };
  }

  private diffNamespace(
    current: PreferenceNamespaceResponse,
    target: Record<string, unknown>,
  ): string[] {
    return changedKeys(
      current.preferences as unknown as Record<string, unknown>,
      target,
    );
  }

  private async applyNamespace(
    identityId: string,
    namespace: PreferenceNamespace,
    target: Record<string, unknown>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt += 1) {
      const current = await this.preferenceService.getPreferenceNamespace(identityId, namespace);
      const changes = this.diffNamespace(current, target);
      const wasMissing = current.revision === 0;
      if (!wasMissing && changes.length === 0) return 'skipped';

      const result = await this.preferenceService.patchPreferenceNamespace(
        identityId,
        namespace,
        target,
        current.revision,
      );
      if (!('code' in result)) return wasMissing ? 'created' : 'updated';
    }

    throw new Error(`Preference portability CAS retries exhausted for ${namespace}`);
  }
}

/** Setting-owned `preferences@3` implementation consumed by the generic portability registry. */
export class PreferencePortableCapability implements PortableCapability<PreferencePortablePayloadV3> {
  readonly key = 'preferences' as const;
  readonly schemaVersion = 3;
  readonly payloadSchema = PreferencePortablePayloadV3Schema;

  constructor(private readonly portableService: PreferencePortableService) {}

  export(context: PortableCapabilityExecutionContext): Promise<PreferencePortablePayloadV3> {
    return this.portableService.export(context.identityId);
  }

  dryRun(
    payload: PreferencePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    return this.portableService.dryRun(context.identityId, payload);
  }

  apply(
    payload: PreferencePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    return this.portableService.apply(context.identityId, payload);
  }
}

export function createPreferencePortableCapability(
  preferenceService: UserPreferenceService,
): PreferencePortableCapability {
  return new PreferencePortableCapability(new PreferencePortableService(preferenceService));
}
