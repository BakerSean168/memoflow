import type {
  PortableBackupEnvelopeV3,
  PortableCapabilityKey,
} from '@memoflow/contracts/data-portability';
import { parsePortableBackupEnvelopeV3 } from '@memoflow/contracts/data-portability';
import type {
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
  RegisteredPortableCapability,
} from './portable-capability';
import { PortableCapabilityRegistry } from './portable-capability';
import { PortableReferenceRegistry } from './portable-reference-registry';

export interface PortableCapabilityCoordinatorOptions {
  readonly productVersion: string;
  readonly nowIsoString: () => string;
  readonly createBatchId: () => string;
}

export interface PortableCapabilityReceiptEntry extends PortableCapabilityReceipt {
  readonly key: PortableCapabilityKey;
  readonly schemaVersion: number;
}

export interface PortableImportReceiptV3 {
  readonly batchId: string;
  readonly dryRun: boolean;
  readonly capabilities: readonly PortableCapabilityReceiptEntry[];
  readonly created: Readonly<Record<string, number>>;
  readonly updated: Readonly<Record<string, number>>;
  readonly skipped: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
}

export interface PortableExportResultV3 {
  readonly envelope: PortableBackupEnvelopeV3;
  readonly capabilityKeys: readonly PortableCapabilityKey[];
}

/**
 * V3 orchestration layer. It understands capability ordering, envelope/version
 * checks and receipts, but never understands owner payload fields.
 */
export class PortableCapabilityCoordinator {
  constructor(
    private readonly registry: PortableCapabilityRegistry,
    private readonly options: PortableCapabilityCoordinatorOptions,
  ) {
    if (options.productVersion.trim().length === 0) {
      throw new Error('Portable productVersion must be non-empty');
    }
  }

  async export(
    identityId: string,
    include?: readonly PortableCapabilityKey[],
  ): Promise<PortableExportResultV3> {
    this.assertIdentity(identityId);
    const ordered = this.registry.resolveDependencyOrder(include);
    const references = new PortableReferenceRegistry();
    const context: PortableCapabilityExecutionContext = { identityId, references };
    const capabilities: PortableBackupEnvelopeV3['capabilities'] = [];

    for (const capability of ordered) {
      const payload = await capability.exportValidated(context);
      if (payload === null) continue;
      capabilities.push({
        key: capability.key,
        schemaVersion: capability.schemaVersion,
        payload: payload as PortableBackupEnvelopeV3['capabilities'][number]['payload'],
      });
    }

    const candidate = {
      format: 'memoflow.user-data-export' as const,
      schemaVersion: 3 as const,
      exportedAt: this.options.nowIsoString(),
      productVersion: this.options.productVersion,
      capabilities,
    };
    const parsed = parsePortableBackupEnvelopeV3(candidate);
    if (!parsed.ok) {
      throw new Error(`Portable owner export produced an unsafe V3 envelope: ${parsed.error}`);
    }

    return {
      envelope: parsed.envelope,
      capabilityKeys: parsed.envelope.capabilities.map((capability) => capability.key),
    };
  }

  decode(content: string): PortableBackupEnvelopeV3 {
    let raw: unknown;
    try {
      raw = JSON.parse(content) as unknown;
    } catch {
      throw new Error('Portable V3 content is not valid JSON');
    }
    const parsed = parsePortableBackupEnvelopeV3(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.envelope;
  }

  async dryRun(
    content: string,
    identityId: string,
    batchId = this.options.createBatchId(),
  ): Promise<PortableImportReceiptV3> {
    return this.executeImport(this.decode(content), identityId, batchId, true);
  }

  async apply(
    content: string,
    identityId: string,
    batchId = this.options.createBatchId(),
  ): Promise<PortableImportReceiptV3> {
    return this.executeImport(this.decode(content), identityId, batchId, false);
  }

  private async executeImport(
    envelope: PortableBackupEnvelopeV3,
    identityId: string,
    batchId: string,
    dryRun: boolean,
  ): Promise<PortableImportReceiptV3> {
    this.assertIdentity(identityId);
    if (batchId.trim().length === 0) throw new Error('Portable import batchId must be non-empty');

    const byKey = new Map(envelope.capabilities.map((entry) => [entry.key, entry] as const));
    const ordered = this.registry.resolveDependencyOrder([...byKey.keys()], {
      requireExplicitDependencies: true,
    });

    // Validate every owner payload and version before the first mutation-capable apply call.
    for (const capability of ordered) {
      const entry = byKey.get(capability.key);
      if (!entry) throw new Error(`Portable capability payload is missing: ${capability.key}`);
      this.assertCompatibleVersion(capability, entry.schemaVersion);
      capability.validatePayload(entry.payload);
    }

    const references = new PortableReferenceRegistry();
    const context: PortableCapabilityExecutionContext = {
      identityId,
      batchId,
      references,
    };
    const entries: PortableCapabilityReceiptEntry[] = [];

    for (const capability of ordered) {
      const payload = byKey.get(capability.key)?.payload;
      const receipt = dryRun
        ? await capability.dryRunValidated(payload, context)
        : await capability.applyValidated(payload, context);
      entries.push({
        key: capability.key,
        schemaVersion: capability.schemaVersion,
        ...receipt,
      });
    }

    return this.buildReceipt(batchId, dryRun, entries);
  }

  private buildReceipt(
    batchId: string,
    dryRun: boolean,
    entries: readonly PortableCapabilityReceiptEntry[],
  ): PortableImportReceiptV3 {
    const created: Record<string, number> = {};
    const updated: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const warnings: string[] = [];
    for (const entry of entries) {
      created[entry.key] = entry.created;
      updated[entry.key] = entry.updated;
      skipped[entry.key] = entry.skipped;
      warnings.push(...entry.warnings.map((warning) => `${entry.key}: ${warning}`));
    }
    return { batchId, dryRun, capabilities: entries, created, updated, skipped, warnings };
  }

  private assertCompatibleVersion(
    capability: RegisteredPortableCapability,
    envelopeVersion: number,
  ): void {
    if (envelopeVersion !== capability.schemaVersion) {
      throw new Error(
        `Portable capability version mismatch for ${capability.key}: expected ${capability.schemaVersion}, received ${envelopeVersion}`,
      );
    }
  }

  private assertIdentity(identityId: string): void {
    if (identityId.trim().length === 0) throw new Error('Portable host identity must be non-empty');
  }
}
