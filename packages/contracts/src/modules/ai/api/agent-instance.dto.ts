import { z } from 'zod';
import { AgentInstanceSlugSchema, LocalAgentConnectionInputSchema } from './local-agent.dto';

export const AgentDriverKindSchema = z.enum(['mastra', 'codex', 'claude', 'pi', 'dsh']);
export type AgentDriverKind = z.infer<typeof AgentDriverKindSchema>;
export const AgentNativeConfigSchema = LocalAgentConnectionInputSchema.pick({
  executablePath: true,
  homePath: true,
  writeScopes: true,
})
  .partial()
  .strict();
const identity = {
  name: z.string().trim().min(1).max(120),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  enabled: z.boolean(),
};
export const CreateAgentInstanceSchema = z
  .object({
    instanceId: AgentInstanceSlugSchema,
    driver: AgentDriverKindSchema,
    ...identity,
    nativeConfig: AgentNativeConfigSchema.optional(),
  })
  .strict()
  .refine((value) => value.driver !== 'mastra' || value.nativeConfig === undefined, {
    message: 'Mastra does not accept native configuration',
  });
export type CreateAgentInstance = z.infer<typeof CreateAgentInstanceSchema>;
export const UpdateAgentInstanceSchema = z
  .object({
    ...identity,
    nativeConfig: AgentNativeConfigSchema,
  })
  .partial()
  .strict();
export type UpdateAgentInstance = z.infer<typeof UpdateAgentInstanceSchema>;
export const AgentInstanceSchema = z
  .object({
    instanceId: AgentInstanceSlugSchema,
    driver: AgentDriverKindSchema,
    ...identity,
    nativeConfig: AgentNativeConfigSchema.optional(),
    legacyConnectionId: z.string().min(1).optional(),
    revision: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type AgentInstance = z.infer<typeof AgentInstanceSchema>;
export const AgentInstanceModelBindingSchema = z
  .object({
    instanceId: AgentInstanceSlugSchema,
    connectionId: z.string().min(1).max(512),
    modelId: z.string().min(1).max(512),
  })
  .strict();
export type AgentInstanceModelBinding = z.infer<typeof AgentInstanceModelBindingSchema>;
export const AgentRegistrySnapshotSchema = z
  .object({
    instances: z.array(AgentInstanceSchema),
    bindings: z.array(AgentInstanceModelBindingSchema),
  })
  .strict();
export type AgentRegistrySnapshot = z.infer<typeof AgentRegistrySnapshotSchema>;
const cas = {
  instanceId: AgentInstanceSlugSchema,
  expectedRevision: z.number().int().nonnegative(),
};
export const AgentRegistryCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('create'), instance: CreateAgentInstanceSchema }).strict(),
  z.object({ action: z.literal('update'), ...cas, patch: UpdateAgentInstanceSchema }).strict(),
  z.object({ action: z.literal('remove'), ...cas }).strict(),
  z
    .object({
      action: z.literal('bind'),
      ...cas,
      connectionId: z.string().min(1).max(512),
      modelId: z.string().min(1).max(512),
    })
    .strict(),
  z
    .object({ action: z.literal('unbind'), ...cas, connectionId: z.string().min(1).max(512) })
    .strict(),
]);
export type AgentRegistryCommand = z.infer<typeof AgentRegistryCommandSchema>;
