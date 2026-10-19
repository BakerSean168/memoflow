import { z } from 'zod';

const handle = z.strictObject({
  handle: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
});
const start = z.strictObject({
  idempotencyKey: z.string().min(1).max(200),
  kind: z.literal('task.create'),
  input: z.strictObject({
    idea: z.string().min(1).max(8000),
    goalId: z.string().optional(),
    surfaceContext: z
      .strictObject({
        currentRoute: z.string().max(500).optional(),
        timezone: z.string().min(1).max(100).optional(),
      })
      .optional(),
  }),
  consent: z.strictObject({
    providerId: z.string().min(1),
    providerVersion: z.number().int().positive(),
    modelId: z.string().min(1),
    acceptFees: z.literal(true),
  }),
});
const resume = handle.extend({
  reviewToken: z.string().length(64),
  command: z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('answer'),
      answers: z.array(z.string().min(1)).min(1).max(3),
    }),
    z.strictObject({ type: z.literal('approve') }),
    z.strictObject({ type: z.literal('retry') }),
    z.strictObject({ type: z.literal('cancel_remaining') }),
  ]),
});

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const assistedToolDescriptors = {
  assisted_workflow_start: {
    requiredScope: 'tasks:write',
    definition: {
      description: 'Start or recover one reviewed Task planning workflow.',
      inputSchema: start.shape,
      annotations,
    },
  },
  assisted_workflow_get: {
    requiredScope: 'tasks:write',
    definition: {
      description: 'Read the current revision of an owned assisted Task workflow.',
      inputSchema: handle.shape,
      annotations,
    },
  },
  assisted_workflow_review: {
    requiredScope: 'tasks:write',
    definition: {
      description: 'Read the canonical typed ask or Task draft requiring a decision.',
      inputSchema: handle.shape,
      annotations,
    },
  },
  assisted_workflow_resume: {
    requiredScope: 'tasks:write',
    definition: {
      description:
        'Answer a typed clarification, approve the exact reviewed draft, or recover a suspended Task apply.',
      inputSchema: resume.shape,
      annotations,
    },
  },
  assisted_workflow_cancel: {
    requiredScope: 'tasks:write',
    definition: {
      description: 'Cancel remaining work while preserving committed Task facts.',
      inputSchema: handle.shape,
      annotations,
    },
  },
} as const;
export type GatewayAssistedToolName = keyof typeof assistedToolDescriptors;
