/**
 * Owner-driven portable backup envelope — schemaVersion 3.
 *
 * The envelope owns only orchestration metadata. Capability payload semantics
 * are owned and validated by the registering product module.
 */
import { z } from 'zod';

export const PortableCapabilityKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'Capability key must be lowercase kebab-case');
export type PortableCapabilityKey = z.infer<typeof PortableCapabilityKeySchema>;

export const PortableReferenceV3Schema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*:[1-9][0-9]*$/, 'Portable reference must be capability-scoped');
export type PortableReferenceV3 = z.infer<typeof PortableReferenceV3Schema>;

export const PortableCapabilityEnvelopeV3Schema = z
  .object({
    key: PortableCapabilityKeySchema,
    schemaVersion: z.number().int().positive(),
    payload: z.json(),
  })
  .strict();
export type PortableCapabilityEnvelopeV3 = z.infer<typeof PortableCapabilityEnvelopeV3Schema>;

export const PortableBackupEnvelopeV3Schema = z
  .object({
    format: z.literal('memoflow.user-data-export'),
    schemaVersion: z.literal(3),
    exportedAt: z.string().min(1),
    productVersion: z.string().min(1),
    capabilities: z.array(PortableCapabilityEnvelopeV3Schema),
  })
  .strict()
  .superRefine((envelope, ctx) => {
    const seen = new Set<string>();
    for (const [index, capability] of envelope.capabilities.entries()) {
      if (seen.has(capability.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['capabilities', index, 'key'],
          message: `Duplicate capability key: ${capability.key}`,
        });
      }
      seen.add(capability.key);
    }
  });
export type PortableBackupEnvelopeV3 = z.infer<typeof PortableBackupEnvelopeV3Schema>;
