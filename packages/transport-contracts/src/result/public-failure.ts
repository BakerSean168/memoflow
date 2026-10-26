import { z } from 'zod';

/** JSON primitive accepted by public wire contracts. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON object accepted by public wire contracts. Optional properties are omitted on serialization. */
export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

/** Recursive JSON-safe value accepted by public wire contracts. */
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

/** Stable, transport-neutral failure categories. */
export const FailureCategories = {
  Validation: 'validation',
  Unauthenticated: 'unauthenticated',
  Permission: 'permission',
  NotFound: 'not_found',
  Conflict: 'conflict',
  RateLimited: 'rate_limited',
  Unavailable: 'unavailable',
  Timeout: 'timeout',
  Canceled: 'canceled',
  Internal: 'internal',
} as const;

/** Stable, transport-neutral failure category. */
export type FailureCategory = (typeof FailureCategories)[keyof typeof FailureCategories];

/** Runtime schema for {@link FailureCategory}. */
export const FailureCategorySchema = z.enum(FailureCategories);

/** Failure-level retryability fact. It does not authorize an operation retry by itself. */
export type FailureRetryHint =
  | { readonly kind: 'not_retryable' }
  | { readonly kind: 'transient' }
  | { readonly kind: 'after'; readonly afterMs: number };

/** Runtime schema for {@link FailureRetryHint}. */
export const FailureRetryHintSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('not_retryable') }),
  z.strictObject({ kind: z.literal('transient') }),
  z.strictObject({ kind: z.literal('after'), afterMs: z.number().int().nonnegative() }),
]);

/** Safe correlation reference carried by a public failure. */
export interface FailureReference {
  readonly requestId?: string;
  readonly traceId?: string;
}

/** Runtime schema for {@link FailureReference}. */
export const FailureReferenceSchema = z.strictObject({
  requestId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
});

/**
 * Canonical public failure.
 *
 * Public failures are JSON-safe and contain no Error instance, stack, provider response,
 * SQL, token, cookie, or arbitrary diagnostic context.
 */
export interface PublicFailure<
  Code extends string = string,
  Details extends JsonObject = JsonObject,
> {
  readonly code: Code;
  readonly category: FailureCategory;
  readonly details?: Details;
  readonly retryHint?: FailureRetryHint;
  readonly reference?: FailureReference;
}

const strictFailureDetailsSchemas = new WeakSet<object>();
declare const strictFailureDetailsBrand: unique symbol;

/** Zod object schema created through {@link strictFailureDetails}. */
export type StrictFailureDetailsSchema<Shape extends z.ZodRawShape = z.ZodRawShape> =
  z.ZodObject<Shape> & {
    readonly [strictFailureDetailsBrand]: true;
  };

/**
 * Create the only supported details-object schema for public failures.
 *
 * Zod objects strip unknown keys by default. Public failure details must reject them,
 * so every registry definition goes through this strict helper.
 */
export function strictFailureDetails<const Shape extends z.ZodRawShape>(
  shape: Shape,
): StrictFailureDetailsSchema<Shape> {
  const schema = z.strictObject(shape) as StrictFailureDetailsSchema<Shape>;
  strictFailureDetailsSchemas.add(schema);
  return schema;
}

/** Reusable strict empty details schema. */
export const EmptyFailureDetailsSchema = strictFailureDetails({});

/** Feature-owned definition for one public failure code. */
export interface FailureDefinition<
  Schema extends StrictFailureDetailsSchema = StrictFailureDetailsSchema,
> {
  readonly category: FailureCategory;
  readonly details: Schema;
  readonly retryHint?: FailureRetryHint;
  readonly telemetry: string;
}

/** Feature-owned registry of public failure definitions. */
export type FailureRegistry = Readonly<Record<string, FailureDefinition>>;

/** Public failure code union derived from a registry. */
export type FailureCodeOf<Registry extends FailureRegistry> = Extract<keyof Registry, string>;

/** Details output for a registry code. */
export type FailureDetailsOf<
  Registry extends FailureRegistry,
  Code extends FailureCodeOf<Registry>,
> = z.output<Registry[Code]['details']> & JsonObject;

/** Public failure union derived from a feature registry. */
export type PublicFailureOf<
  Registry extends FailureRegistry,
  Code extends FailureCodeOf<Registry> = FailureCodeOf<Registry>,
> =
  Code extends FailureCodeOf<Registry>
    ? PublicFailure<Code, FailureDetailsOf<Registry, Code>> & {
        readonly category: Registry[Code]['category'];
      }
    : never;

/**
 * Define and validate a feature failure registry.
 *
 * The returned object remains the single source used to derive code unions, schemas,
 * transport projections, presentation projections, and telemetry coverage.
 */
export function defineFailureRegistry<const Registry extends FailureRegistry>(
  registry: Registry,
): Registry {
  for (const [code, definition] of Object.entries(registry)) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(code)) {
      throw new Error(`Public failure code must be uppercase snake case: ${code}`);
    }
    if (!FailureCategorySchema.safeParse(definition.category).success) {
      throw new Error(`Public failure category is invalid: ${code}`);
    }
    if (!strictFailureDetailsSchemas.has(definition.details)) {
      throw new Error(`Public failure details must use strictFailureDetails(): ${code}`);
    }
    if (
      definition.retryHint !== undefined &&
      !FailureRetryHintSchema.safeParse(definition.retryHint).success
    ) {
      throw new Error(`Public failure retry hint is invalid: ${code}`);
    }
    if (!definition.telemetry.trim()) {
      throw new Error(`Public failure telemetry label must not be empty: ${code}`);
    }
  }
  const frozenRegistry = Object.fromEntries(
    Object.entries(registry).map(([code, definition]) => [
      code,
      Object.freeze({
        ...definition,
        retryHint: definition.retryHint ? Object.freeze({ ...definition.retryHint }) : undefined,
      }),
    ]),
  );
  return Object.freeze(frozenRegistry) as Registry;
}

/** Create a typed public failure from a feature registry. */
export function createPublicFailure<
  const Registry extends FailureRegistry,
  Code extends FailureCodeOf<Registry>,
>(
  registry: Registry,
  code: Code,
  details: z.input<Registry[Code]['details']>,
  reference?: FailureReference,
): PublicFailureOf<Registry, Code> {
  const definition = registry[code];
  const parsedDetails = definition.details.parse(details) as FailureDetailsOf<Registry, Code>;
  if (!isJsonValue(parsedDetails)) {
    throw new Error(`Public failure details are not JSON-safe: ${code}`);
  }
  return {
    code,
    category: definition.category,
    details: parsedDetails,
    retryHint: definition.retryHint,
    reference,
  } as PublicFailureOf<Registry, Code>;
}

function retryHintSchemaFor(hint: FailureRetryHint | undefined): z.ZodTypeAny {
  if (!hint) return z.undefined().optional();
  switch (hint.kind) {
    case 'not_retryable':
      return z.strictObject({ kind: z.literal('not_retryable') });
    case 'transient':
      return z.strictObject({ kind: z.literal('transient') });
    case 'after':
      return z.strictObject({
        kind: z.literal('after'),
        afterMs: z.literal(hint.afterMs),
      });
  }
}

/**
 * Create the runtime public-failure schema derived from a feature registry.
 *
 * The tuple cast is intentionally isolated here because Zod 4 does not expose its
 * internal discriminated-union option type as public API.
 */
export function createPublicFailureSchema<const Registry extends FailureRegistry>(
  registry: Registry,
): z.ZodType<PublicFailureOf<Registry>> {
  const variants = Object.entries(registry).map(([code, definition]) =>
    z.strictObject({
      code: z.literal(code),
      category: z.literal(definition.category),
      details: definition.details.optional(),
      retryHint: retryHintSchemaFor(definition.retryHint),
      reference: FailureReferenceSchema.optional(),
    }),
  );

  if (variants.length === 0) {
    throw new Error('A public failure registry must define at least one code');
  }

  const schema: z.ZodTypeAny =
    variants.length === 1
      ? variants[0]
      : z.union(variants as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);

  return schema.superRefine((failure, context) => {
    const candidate = failure as { readonly details?: unknown };
    if (candidate.details !== undefined && !isJsonValue(candidate.details)) {
      context.addIssue({
        code: 'custom',
        path: ['details'],
        message: 'Public failure details must be JSON-safe',
      });
    }
  }) as unknown as z.ZodType<PublicFailureOf<Registry>>;
}

/**
 * Define a complete projection keyed by every code in a registry.
 * Missing keys fail at compile time; extra keys fail closed at runtime.
 */
export function defineFailureProjection<
  const Registry extends FailureRegistry,
  const Projection extends Record<FailureCodeOf<Registry>, unknown>,
>(registry: Registry, projection: Projection): Projection {
  const registryCodes = Object.keys(registry).sort();
  const projectionCodes = Object.keys(projection).sort();
  if (
    registryCodes.length !== projectionCodes.length ||
    registryCodes.some((code, index) => code !== projectionCodes[index])
  ) {
    throw new Error(
      `Failure projection codes must exactly match registry codes: expected ${registryCodes.join(', ')}, received ${projectionCodes.join(', ')}`,
    );
  }
  return Object.freeze({ ...projection }) as Projection;
}

/** Return whether a value is JSON-safe. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== 'object') {
    return false;
  }
  if (value instanceof Date || value instanceof Error) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).every(
    ([, entry]) => entry === undefined || isJsonValue(entry),
  );
}

const PUBLIC_FAILURE_KEYS = new Set(['code', 'category', 'details', 'retryHint', 'reference']);

/**
 * Detect a generic JSON-safe public failure carried by a legacy envelope.
 *
 * Feature-specific consumers must still validate with their registry-derived schema.
 * This guard only protects the shared transport boundary from Error instances,
 * arbitrary context, provider bodies, and unknown top-level fields.
 */
export function isPublicFailure(value: unknown): value is PublicFailure {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !PUBLIC_FAILURE_KEYS.has(key))) {
    return false;
  }
  if (typeof record.code !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(record.code)) {
    return false;
  }
  if (!FailureCategorySchema.safeParse(record.category).success) {
    return false;
  }
  if (
    record.details !== undefined &&
    (typeof record.details !== 'object' ||
      record.details === null ||
      Array.isArray(record.details) ||
      !isJsonValue(record.details))
  ) {
    return false;
  }
  if (
    record.retryHint !== undefined &&
    !FailureRetryHintSchema.safeParse(record.retryHint).success
  ) {
    return false;
  }
  if (
    record.reference !== undefined &&
    !FailureReferenceSchema.safeParse(record.reference).success
  ) {
    return false;
  }
  return true;
}
