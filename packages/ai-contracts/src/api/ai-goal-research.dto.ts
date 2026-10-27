import { z } from 'zod';

export const GoalResearchIntentSchema = z.enum(['requirements', 'timeline', 'resources']);
export type GoalResearchIntent = z.infer<typeof GoalResearchIntentSchema>;

function isObviouslyNonPublicIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a >= 224;
}

function isObviouslyNonPublicIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!value.includes(':')) return false;
  if (value === '::' || value === '::1') return true;
  if (/^fe[89ab]/u.test(value)) return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff')) return true;
  if (value.startsWith('2001:db8:')) return true;
  if (value.startsWith('::ffff:')) return isObviouslyNonPublicIpv4(value.slice('::ffff:'.length));
  return false;
}

function isObviouslyNonPublicResearchHost(hostname: string): boolean {
  const value = hostname.trim().toLowerCase().replace(/\.$/u, '');
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value === 'metadata.google.internal' ||
    value === 'metadata.google.com' ||
    value === 'instance-data.ec2.internal'
  ) {
    return true;
  }
  return isObviouslyNonPublicIpv4(value) || isObviouslyNonPublicIpv6(value);
}

export const GoalResearchPublicUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password &&
        !isObviouslyNonPublicResearchHost(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'Research source must be a public HTTP(S) URL without embedded credentials');

export const GoalResearchSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: GoalResearchPublicUrlSchema,
    snippet: z.string().trim().max(1200).optional(),
  })
  .strict();
export type GoalResearchSource = z.infer<typeof GoalResearchSourceSchema>;

/**
 * Bounded public-web evidence used only by Goal planning.
 *
 * External research is never owner/domain truth. It is invocation/workflow
 * evidence with explicit provenance and can disappear without blocking the
 * durable Goal workflow.
 */
export const GoalResearchEvidenceSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    intent: GoalResearchIntentSchema,
    summary: z.string().trim().min(1).max(6000),
    sources: z.array(GoalResearchSourceSchema).min(1).max(6),
    trust: z.literal('external_untrusted'),
    provenance: z.literal('external'),
  })
  .strict();
export type GoalResearchEvidence = z.infer<typeof GoalResearchEvidenceSchema>;
