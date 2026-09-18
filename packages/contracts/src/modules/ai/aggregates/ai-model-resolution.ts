import { z } from 'zod';
import type { AiProviderConnectionId } from '../../../primitives';
import { AIModelInfoSchema, type AIModelInfo } from './ai-provider-config-client';

/** Capabilities that can change whether an AI workflow is executable. */
export const AI_MODEL_CAPABILITIES = [
  'chat',
  'streaming',
  'structuredOutput',
  'toolCalling',
  'vision',
] as const;

export type AIModelCapability = (typeof AI_MODEL_CAPABILITIES)[number];

export const AI_MODEL_CAPABILITY_STATES = ['verified', 'unknown', 'unsupported'] as const;
export type AIModelCapabilityState = (typeof AI_MODEL_CAPABILITY_STATES)[number];

export const AI_MODEL_CAPABILITY_PROVENANCE = [
  'provider_catalog',
  'provider_api',
  'runtime_probe',
] as const;
export type AIModelCapabilityProvenance = (typeof AI_MODEL_CAPABILITY_PROVENANCE)[number];

const AIModelCapabilityStateSchema = z.enum(AI_MODEL_CAPABILITY_STATES);

const AIModelCapabilitiesSchema = z.object({
  chat: AIModelCapabilityStateSchema,
  streaming: AIModelCapabilityStateSchema,
  structuredOutput: AIModelCapabilityStateSchema,
  toolCalling: AIModelCapabilityStateSchema,
  vision: AIModelCapabilityStateSchema,
});

/**
 * A refreshable model inventory for one user-owned ProviderConnection.
 *
 * This is a read projection, not a child aggregate of the connection. A
 * missing or expired snapshot cannot be treated as proof that a model exists.
 */
export const AIModelCatalogSnapshotSchema = z.object({
  providerConnectionId: z.string().trim().min(1),
  discoveredAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().nullable(),
  source: z.enum(['provider_api', 'manual']),
  status: z.enum(['available', 'unsupported', 'empty']),
  models: z.array(AIModelInfoSchema),
});

export type AIModelCatalogSnapshot = Omit<
  z.infer<typeof AIModelCatalogSnapshotSchema>,
  'providerConnectionId'
> & {
  providerConnectionId: AiProviderConnectionId;
};

/**
 * Capability evidence for one model on one connection.
 *
 * `verifiedAt`/`expiresAt` make stale evidence fail closed. Provenance is
 * retained so a manually/runtime-probed model may be used even when the
 * provider's `/models` endpoint does not list it.
 */
export const AIModelCapabilitySnapshotSchema = z.object({
  providerConnectionId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  verifiedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().nullable(),
  provenance: z.array(z.enum(AI_MODEL_CAPABILITY_PROVENANCE)).min(1),
  capabilities: AIModelCapabilitiesSchema,
});

export type AIModelCapabilitySnapshot = Omit<
  z.infer<typeof AIModelCapabilitySnapshotSchema>,
  'providerConnectionId'
> & {
  providerConnectionId: AiProviderConnectionId;
};

export const AI_EXECUTION_REQUIREMENT_LEVELS = ['required', 'optional', 'none'] as const;
export type AIExecutionRequirementLevel = (typeof AI_EXECUTION_REQUIREMENT_LEVELS)[number];

/** Minimum capabilities declared by an Agent/Workflow before model execution. */
export const AIExecutionRequirementSchema = z
  .object({
    chat: z.enum(AI_EXECUTION_REQUIREMENT_LEVELS).optional(),
    streaming: z.enum(AI_EXECUTION_REQUIREMENT_LEVELS).optional(),
    structuredOutput: z.enum(AI_EXECUTION_REQUIREMENT_LEVELS).optional(),
    toolCalling: z.enum(AI_EXECUTION_REQUIREMENT_LEVELS).optional(),
    vision: z.enum(AI_EXECUTION_REQUIREMENT_LEVELS).optional(),
  })
  .strict();

export type AIExecutionRequirement = z.infer<typeof AIExecutionRequirementSchema>;

/** The complete capability map expected from runtime model adapters. */
export type AIModelCapabilityMap = Record<AIModelCapability, AIModelCapabilityState>;

export type { AIModelInfo };
