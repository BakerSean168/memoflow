import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/contracts/data-portability';
import {
  LabelPortablePayloadV3Schema,
  type LabelPortablePayloadV3,
} from '@memoflow/contracts/label';
import { normalizeLabelName } from '../domain/label';
import type { LabelService } from './label-service';

/** Label-owned `labels@3` portability capability. Persistent ids stay host-side. */
export class LabelPortableCapability implements PortableCapability<LabelPortablePayloadV3> {
  readonly key = 'labels' as const;
  readonly schemaVersion = 3;
  readonly payloadSchema = LabelPortablePayloadV3Schema;

  constructor(private readonly service: LabelService) {}

  async export(context: PortableCapabilityExecutionContext): Promise<LabelPortablePayloadV3> {
    const labels = await this.service.list({ identityId: context.identityId, limit: 500 });
    return {
      labels: labels.map((label) => ({
        ref: context.references.declareExportReference(this.key, label.id),
        name: label.name,
        color: label.color,
      })),
    };
  }

  async dryRun(
    payload: LabelPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = LabelPortablePayloadV3Schema.parse(payload);
    const existing = await this.service.list({ identityId: context.identityId, limit: 500 });
    const byName = new Map(existing.map((label) => [label.normalizedName, label]));
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of target.labels) {
      const current = byName.get(normalizeLabelName(item.name));
      if (!current) created += 1;
      else if (current.name !== item.name || current.color !== item.color) updated += 1;
      else skipped += 1;
    }

    return { created, updated, skipped, warnings: [] };
  }

  async apply(
    payload: LabelPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = LabelPortablePayloadV3Schema.parse(payload);
    const existing = await this.service.list({ identityId: context.identityId, limit: 500 });
    const byName = new Map(existing.map((label) => [label.normalizedName, label]));
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of target.labels) {
      const normalizedName = normalizeLabelName(item.name);
      let current = byName.get(normalizedName);
      if (!current) {
        current = await this.service.create({
          identityId: context.identityId,
          name: item.name,
          color: item.color,
        });
        byName.set(normalizedName, current);
        created += 1;
      } else if (current.name !== item.name || current.color !== item.color) {
        current = await this.service.update({
          identityId: context.identityId,
          labelId: current.id,
          name: item.name,
          color: item.color,
        });
        byName.set(normalizedName, current);
        updated += 1;
      } else {
        skipped += 1;
      }
      context.references.bindImportedReference(item.ref, current.id);
    }

    return { created, updated, skipped, warnings: [] };
  }
}

export function createLabelPortableCapability(service: LabelService): LabelPortableCapability {
  return new LabelPortableCapability(service);
}
