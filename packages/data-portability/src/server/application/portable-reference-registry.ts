import type {
  PortableCapabilityKey,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import {
  PortableCapabilityKeySchema,
  PortableReferenceV3Schema,
} from '@memoflow/contracts/data-portability';

/**
 * Operation-local mapping between private persistence identifiers and portable refs.
 * Private source/target identifiers never become serialized backup values.
 */
export class PortableReferenceRegistry {
  private readonly counters = new Map<PortableCapabilityKey, number>();
  private readonly exportRefs = new Map<string, PortableReferenceV3>();
  private readonly importTargets = new Map<PortableReferenceV3, string>();

  declareExportReference(capabilityKey: PortableCapabilityKey, sourceKey: string): PortableReferenceV3 {
    this.assertCapabilityKey(capabilityKey);
    this.assertPrivateKey(sourceKey, 'source');
    const mapKey = this.exportMapKey(capabilityKey, sourceKey);
    const existing = this.exportRefs.get(mapKey);
    if (existing) return existing;

    const ordinal = (this.counters.get(capabilityKey) ?? 0) + 1;
    this.counters.set(capabilityKey, ordinal);
    const portableRef = PortableReferenceV3Schema.parse(`${capabilityKey}:${ordinal}`);
    this.exportRefs.set(mapKey, portableRef);
    return portableRef;
  }

  resolveExportReference(capabilityKey: PortableCapabilityKey, sourceKey: string): PortableReferenceV3 {
    this.assertCapabilityKey(capabilityKey);
    this.assertPrivateKey(sourceKey, 'source');
    const portableRef = this.exportRefs.get(this.exportMapKey(capabilityKey, sourceKey));
    if (!portableRef) {
      throw new Error(`Portable export reference is not declared: ${capabilityKey}`);
    }
    return portableRef;
  }

  bindImportedReference(portableRef: PortableReferenceV3, targetKey: string): void {
    PortableReferenceV3Schema.parse(portableRef);
    this.assertPrivateKey(targetKey, 'target');
    const existing = this.importTargets.get(portableRef);
    if (existing && existing !== targetKey) {
      throw new Error(`Portable import reference already bound: ${portableRef}`);
    }
    this.importTargets.set(portableRef, targetKey);
  }

  resolveImportedReference(portableRef: PortableReferenceV3): string {
    PortableReferenceV3Schema.parse(portableRef);
    const targetKey = this.importTargets.get(portableRef);
    if (!targetKey) {
      throw new Error(`Portable import reference is not bound: ${portableRef}`);
    }
    return targetKey;
  }

  private exportMapKey(capabilityKey: PortableCapabilityKey, sourceKey: string): string {
    return `${capabilityKey}\u0000${sourceKey}`;
  }

  private assertCapabilityKey(capabilityKey: PortableCapabilityKey): void {
    if (!PortableCapabilityKeySchema.safeParse(capabilityKey).success) {
      throw new Error(`Invalid portable capability key: ${String(capabilityKey)}`);
    }
  }

  private assertPrivateKey(value: string, kind: 'source' | 'target'): void {
    if (value.trim().length === 0) {
      throw new Error(`Portable ${kind} reference key must be non-empty`);
    }
  }
}
