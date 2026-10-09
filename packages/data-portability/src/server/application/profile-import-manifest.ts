import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ProfileImportBinding } from '@memoflow/contracts/data-portability';

type JsonValue = z.infer<ReturnType<typeof z.json>>;

/** JSON object keys and ref-addressed collections have canonical order; other arrays retain order. */
function canonical(value: JsonValue, field = ''): string {
  if (Array.isArray(value)) {
    const parts = value.map((item) => canonical(item));
    const refCollection =
      field.endsWith('Refs') ||
      value.every(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          Object.keys(item).some((key) => key === 'ref' || key.endsWith('Ref')),
      );
    return `[${(refCollection ? parts.sort() : parts).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key]!, key)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function profileImportDigest(value: unknown): string {
  return createHash('sha256')
    .update(canonical(z.json().parse(value)))
    .digest('hex');
}

/** Select the batch's roots, leaving nested facts intact so extra/missing children fail verification. */
export function selectProfileImportPayload(
  payload: unknown,
  bindings: readonly ProfileImportBinding[],
): JsonValue {
  const parsed = z.record(z.string(), z.json()).parse(payload);
  const refs = new Set(bindings.map((binding) => binding.ref));
  return Object.fromEntries(
    Object.entries(parsed).map(([field, value]) => {
      if (!Array.isArray(value)) return [field, value];
      return [
        field,
        value.filter((item) => {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`Unscoped portable root collection: ${field}`);
          }
          if (typeof item.ref === 'string') return refs.has(item.ref);
          const relationships = Object.entries(item).filter(([key]) => key.endsWith('Ref'));
          if (!relationships.length) throw new Error(`Unscoped portable root collection: ${field}`);
          return relationships.some(([, ref]) => typeof ref === 'string' && refs.has(ref));
        }),
      ];
    }),
  );
}
