import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import {
  KnowledgeCaptureDecisionSchema,
  type KnowledgeCaptureWorkflowInput,
  type KnowledgeClarificationState,
  type KnowledgeDraft,
  type KnowledgeCaptureDecision,
} from '@memoflow/contracts/ai';
import type { IAIExecutionRecordPort } from '../../application/ports';
import type { MastraModelResolver } from '../models/model-resolver';
import {
  aiContextInstruction,
  requireAIContextEnvelope,
  setAIContextRequestContext,
  type AIContextAssemblerPort,
} from '../context';
import {
  normalizeMastraGenerateUsage,
  recordPlannerExecution,
  rememberResolvedPlannerModel,
} from './planner-observability';

function stringContext(requestContext: RequestContext, key: string): string | undefined {
  const value = requestContext.getRaw(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export type KnowledgeCapturePlannerMode = 'initial' | 'revise' | 'regenerate';

export interface KnowledgeCapturePlannerRequest {
  readonly input: KnowledgeCaptureWorkflowInput;
  readonly clarification: KnowledgeClarificationState;
  readonly mode: KnowledgeCapturePlannerMode;
  readonly currentDraft?: KnowledgeDraft;
  readonly instruction?: string;
  readonly forceDraft?: boolean;
}

export interface KnowledgeCapturePlannerPort {
  plan(
    request: KnowledgeCapturePlannerRequest,
    requestContext: RequestContext,
  ): Promise<KnowledgeCaptureDecision>;
}

/**
 * Internal Mastra worker for `knowledge.capture`. It can reason and produce a
 * typed Markdown note draft, but it owns no product mutation capability and is
 * never exposed as a user-facing Agent identity. Note writes happen only after
 * explicit workflow approval through the canonical persistence port.
 *
 * Protected Business Invariant 4: the draft's `targetSubpath` is vault-relative
 * only; the worker never sees a Desktop absolute path, so the web cannot leak
 * one back.
 */
export class KnowledgeCapturePlannerWorker implements KnowledgeCapturePlannerPort {
  readonly agent: Agent<'knowledge-capture-planner-worker'>;

  constructor(
    modelResolver: MastraModelResolver,
    private readonly executionRecordPort: IAIExecutionRecordPort | undefined,
    private readonly contextAssembler: AIContextAssemblerPort,
  ) {
    this.agent = new Agent({
      id: 'knowledge-capture-planner-worker',
      name: 'Knowledge Capture Planner Worker',
      description:
        'Internal structured note planner used only by the knowledge.capture durable workflow.',
      instructions: ({ requestContext }) => {
        const envelope = requireAIContextEnvelope(requestContext);
        const locale = envelope.invocation.locale;
        const language = locale === 'en-US' ? 'English' : 'Simplified Chinese';
        return [
          'You are an internal MemoFlow knowledge-capture worker. You are not a user-facing assistant.',
          'Return only the requested structured decision. Never claim that any knowledge note has been saved.',
          'You have no write tools. Product mutation occurs only after explicit workflow approval.',
          'Produce a single self-contained Markdown knowledge note: a clear title, a topic, and well-structured Markdown body (headings, lists, code blocks as appropriate).',
          'The targetSubpath must be vault-relative only — never an absolute filesystem path, never a leading slash, never a drive letter.',
          'Ask clarification only when missing information materially blocks a safe, useful note. Ask at most 3 concise questions.',
          'The workflow enforces a maximum of 3 clarification rounds; prefer a concrete draft over cosmetic clarification.',
          'Ground the note in the selected source content from the canonical context envelope; never invent authoritative facts it does not support.',
          `Write user-visible titles and notes in ${language}.`,
        ]
          .filter(Boolean)
          .join('\n');
      },
      model: async ({ requestContext }) => {
        const identityId = stringContext(requestContext, 'identityId');
        if (!identityId)
          throw new Error('Knowledge Capture Planner requires authenticated identityId');
        const resolved = await modelResolver.resolve({
          identityId,
          providerId: stringContext(requestContext, 'providerId'),
          modelId: stringContext(requestContext, 'modelId'),
          executionRequirement: {
            chat: 'required',
            structuredOutput: 'required',
          },
        });
        rememberResolvedPlannerModel(requestContext, resolved);
        return resolved.model;
      },
    });
  }

  async plan(
    request: KnowledgeCapturePlannerRequest,
    requestContext: RequestContext,
  ): Promise<KnowledgeCaptureDecision> {
    const contextEnvelope = await this.contextAssembler.assemble({
      invocation: {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        surface: 'knowledge.capture',
        locale: request.input.locale,
      },
      userInput: {
        topic: request.input.topic,
        title: request.input.title,
        source: request.input.source,
        surfaceContext: request.input.surfaceContext,
        clarification: request.clarification,
      },
      workflowInstructions: [
        {
          id: 'knowledge.capture.control',
          source: 'workflow.knowledge.capture',
          content: {
            mode: request.mode,
            forceDraft: request.forceDraft ?? false,
            instruction: request.instruction,
          },
          sensitivity: 'private',
        },
      ],
      domainFacts: request.currentDraft
        ? [
            {
              id: 'knowledge.capture.current-draft',
              source: 'workflow.knowledge.capture.state',
              content: request.currentDraft,
              sensitivity: 'private',
            },
          ]
        : undefined,
    });
    setAIContextRequestContext(requestContext, contextEnvelope);
    const prompt = [
      'Produce the next knowledge.capture decision from this trusted workflow state.',
      'Follow the mode, forceDraft, revision instruction and clarification controls in the workflow section of the canonical context envelope. Ask only material blockers; when forceDraft is true, return draft_ready using safe assumptions and record them in warnings. Regenerate substantively and revise precisely while preserving valid draft parts.',
      aiContextInstruction(contextEnvelope),
    ]
      .filter(Boolean)
      .join('\n\n');

    const startedAt = Date.now();
    try {
      const output = await this.agent.generate(prompt, {
        requestContext,
        structuredOutput: { schema: KnowledgeCaptureDecisionSchema },
      });
      const decision = KnowledgeCaptureDecisionSchema.parse(output.object);
      await recordPlannerExecution(this.executionRecordPort, {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        requestContext,
        taskType: 'MASTRA_KNOWLEDGE_PLANNER',
        mode: request.mode,
        status: 'COMPLETED',
        outcome: decision.status,
        usage: normalizeMastraGenerateUsage(output),
        processingMs: Date.now() - startedAt,
      });
      return decision;
    } catch (cause) {
      await recordPlannerExecution(this.executionRecordPort, {
        identityId: request.input.identityId,
        conversationId: request.input.conversationId,
        requestContext,
        taskType: 'MASTRA_KNOWLEDGE_PLANNER',
        mode: request.mode,
        status: 'FAILED',
        processingMs: Date.now() - startedAt,
      });
      throw cause;
    }
  }
}
