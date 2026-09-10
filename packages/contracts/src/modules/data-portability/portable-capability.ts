import type { z } from 'zod';
import type {
  PortableCapabilityKey,
  PortableReferenceV3,
} from './dtos/portable-v3.dto';

/** Operation-local portable reference seam exposed to owner capabilities. */
export interface PortableReferencePort {
  declareExportReference(capabilityKey: PortableCapabilityKey, sourceKey: string): PortableReferenceV3;
  resolveExportReference(capabilityKey: PortableCapabilityKey, sourceKey: string): PortableReferenceV3;
  bindImportedReference(portableRef: PortableReferenceV3, targetKey: string): void;
  resolveImportedReference(portableRef: PortableReferenceV3): string;
}

/** Host-owned execution context. Persistent identity is never part of portable payloads. */
export interface PortableCapabilityExecutionContext {
  readonly identityId: string;
  readonly batchId?: string;
  readonly references: PortableReferencePort;
}

/** Owner-level import/export receipt aggregated by Data Portability. */
export interface PortableCapabilityReceipt {
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly warnings: readonly string[];
}

/**
 * Owner-module contract for one portable business capability.
 * Payload semantics and validation remain owned by the implementing module.
 */
export interface PortableCapability<TPayload> {
  readonly key: PortableCapabilityKey;
  readonly schemaVersion: number;
  readonly dependsOn?: readonly PortableCapabilityKey[];
  readonly payloadSchema: z.ZodType<TPayload>;
  export(context: PortableCapabilityExecutionContext): Promise<TPayload | null>;
  dryRun(
    payload: TPayload,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt>;
  apply(
    payload: TPayload,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt>;
}
