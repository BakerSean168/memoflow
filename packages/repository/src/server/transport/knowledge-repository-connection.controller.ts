import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import {
  CompleteKnowledgeRepositoryInstallationSchema,
  ConfirmKnowledgeRepositoryHeadSchema,
  CreateKnowledgeRepositoryConnectionSchema,
  DisconnectKnowledgeRepositoryConnectionSchema,
  KnowledgeRepositoryConnectionParamsSchema,
  PreviewKnowledgeRepositoryReconciliationSchema,
  StartKnowledgeRepositoryInstallationSchema,
  type CompleteKnowledgeRepositoryInstallationReq,
  type CompleteKnowledgeRepositoryInstallationRes,
  type ConfirmKnowledgeRepositoryHeadReq,
  type CreateKnowledgeRepositoryConnectionReq,
  type KnowledgeRemoteBindingClientDTO,
  type KnowledgeRepositoryInstallationTokenRes,
  type KnowledgeRepositoryInstallationIntentStatusResponse,
  type KnowledgeRepositoryReconciliationPreview,
  type ListKnowledgeRepositoryConnectionsRes,
  type StartKnowledgeRepositoryInstallationReq,
  type StartKnowledgeRepositoryInstallationRes,
  type DisconnectKnowledgeRepositoryConnectionRes,
  type PreviewKnowledgeRepositoryReconciliationReq,
  ListKnowledgeProjectionsSchema,
  CreateConfirmedKnowledgeNoteSchema,
  GetKnowledgeNoteLinkGraphSchema,
  ListKnowledgeWriteRequestsSchema,
  type CreateConfirmedKnowledgeNoteReq,
  type CreateConfirmedKnowledgeNoteResponse,
  type KnowledgeNoteProjectionClientDTO,
  type KnowledgeNoteProjectionListResponse,
  type ListKnowledgeNoteProjectionsReq,
  type GetKnowledgeNoteLinkGraphReq,
  type KnowledgeNoteLinkGraphResponse,
  type KnowledgeAttachmentContentResponse,
  type KnowledgeAttachmentProjectionListResponse,
  type ListKnowledgeAttachmentProjectionsReq,
  type ListKnowledgeWriteRequestsReq,
  type ListKnowledgeWriteRequestsRes,
  type KnowledgeWriteRequestReplayResponse,
} from '@memoflow/contracts/repository';
import { OperationAuditQuerySchema } from '@memoflow/contracts/operations';
import { formatZodErrors } from '@memoflow/utils/result';

export interface KnowledgeRepositoryConnectionUseCases {
  startKnowledgeRepositoryInstallation(
    ctx: Context,
    request: StartKnowledgeRepositoryInstallationReq,
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>>;
  completeKnowledgeRepositoryInstallation(
    ctx: Context,
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  getKnowledgeRepositoryInstallationIntentStatus(
    ctx: Context,
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>>;
  finalizeKnowledgeRepositoryInstallationIntent(
    ctx: Context,
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  listKnowledgeRepositoryConnections(
    ctx: Context,
  ): Promise<Result<ListKnowledgeRepositoryConnectionsRes>>;
  refreshKnowledgeRepositoryObservation(
    ctx: Context,
    connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  connectKnowledgeRepository(
    ctx: Context,
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  disconnectKnowledgeRepository(
    ctx: Context,
    connectionId: string,
    purgeCloudData?: boolean,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>>;
  issueDesktopKnowledgeRepositoryToken(
    ctx: Context,
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>>;
  previewKnowledgeRepositoryReconciliation(
    ctx: Context,
    connectionId: string,
    request: PreviewKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>>;
  confirmKnowledgeRepositoryHead(
    ctx: Context,
    connectionId: string,
    request: ConfirmKnowledgeRepositoryHeadReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  listKnowledgeNoteProjections(
    ctx: Context,
    request: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>>;
  getKnowledgeNoteProjection(
    ctx: Context,
    projectionId: string,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>>;
  getKnowledgeNoteLinkGraph(
    ctx: Context,
    projectionId: string,
    request: GetKnowledgeNoteLinkGraphReq,
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>>;
  listKnowledgeAttachmentProjections(
    ctx: Context,
    request: ListKnowledgeAttachmentProjectionsReq,
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>>;
  getKnowledgeAttachmentContent(
    ctx: Context,
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>>;
  createConfirmedKnowledgeNote(
    ctx: Context,
    request: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>>;
  listKnowledgeWriteRequests(
    ctx: Context,
    request: ListKnowledgeWriteRequestsReq,
  ): Promise<Result<ListKnowledgeWriteRequestsRes>>;
  replayKnowledgeWriteRequestProjection(
    ctx: Context,
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>>;
  queryKnowledgeTimeline(ctx: Context): Promise<Result<unknown>>;
  getOperationAudit(
    ctx: Context,
    request?: { source?: string; operationId?: string; limit?: number },
  ): Promise<Result<unknown>>;
}

export class KnowledgeRepositoryConnectionController {
  constructor(private readonly useCases: KnowledgeRepositoryConnectionUseCases) {}

  async startInstallation(ctx: Context, input: unknown) {
    const parsed = StartKnowledgeRepositoryInstallationSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid GitHub App installation request',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.startKnowledgeRepositoryInstallation(ctx, parsed.data);
  }

  async completeInstallation(ctx: Context, input: unknown) {
    const parsed = CompleteKnowledgeRepositoryInstallationSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid GitHub App installation callback',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.completeKnowledgeRepositoryInstallation(ctx, parsed.data);
  }

  async getInstallationIntentStatus(ctx: Context, intentId: string) {
    if (!intentId) {
      return fail({ code: 'VALIDATION_ERROR', message: 'installation intent id is required' });
    }
    return this.useCases.getKnowledgeRepositoryInstallationIntentStatus(ctx, intentId);
  }

  async finalizeInstallationIntent(ctx: Context, intentId: string) {
    if (!intentId) {
      return fail({ code: 'VALIDATION_ERROR', message: 'installation intent id is required' });
    }
    return this.useCases.finalizeKnowledgeRepositoryInstallationIntent(ctx, intentId);
  }

  async listConnections(ctx: Context) {
    return this.useCases.listKnowledgeRepositoryConnections(ctx);
  }

  async refreshObservation(ctx: Context, input: unknown) {
    const parsed = KnowledgeRepositoryConnectionParamsSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge remote binding id',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.refreshKnowledgeRepositoryObservation(ctx, parsed.data.connectionId);
  }

  async connect(ctx: Context, input: unknown) {
    const parsed = CreateKnowledgeRepositoryConnectionSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository connection request',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.connectKnowledgeRepository(ctx, parsed.data);
  }

  async disconnect(ctx: Context, input: unknown): Promise<Result<null>> {
    const parsed = DisconnectKnowledgeRepositoryConnectionSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository connection id',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    const result = await this.useCases.disconnectKnowledgeRepository(
      ctx,
      parsed.data.connectionId,
      parsed.data.purgeCloudData,
    );
    if (!result.ok) return result as Result<null>;
    // Serialize as data:null (no { disconnected: true } dual-track body).
    return ok(null);
  }

  async issueDesktopToken(ctx: Context, input: unknown) {
    const parsed = KnowledgeRepositoryConnectionParamsSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository connection id',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.issueDesktopKnowledgeRepositoryToken(ctx, parsed.data.connectionId);
  }

  async previewReconciliation(ctx: Context, paramsInput: unknown, bodyInput: unknown) {
    const params = KnowledgeRepositoryConnectionParamsSchema.safeParse(paramsInput);
    const body = PreviewKnowledgeRepositoryReconciliationSchema.safeParse(bodyInput);
    if (!params.success || !body.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository reconciliation preview request',
        details: formatZodErrors([
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ]),
      });
    }
    return this.useCases.previewKnowledgeRepositoryReconciliation(
      ctx,
      params.data.connectionId,
      body.data,
    );
  }

  async confirmHead(ctx: Context, paramsInput: unknown, bodyInput: unknown) {
    const params = KnowledgeRepositoryConnectionParamsSchema.safeParse(paramsInput);
    const body = ConfirmKnowledgeRepositoryHeadSchema.safeParse(bodyInput);
    if (!params.success || !body.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository HEAD confirmation',
        details: formatZodErrors([
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ]),
      });
    }
    return this.useCases.confirmKnowledgeRepositoryHead(ctx, params.data.connectionId, body.data);
  }

  async listNotes(ctx: Context, input: unknown) {
    const parsed = ListKnowledgeProjectionsSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge note query',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.listKnowledgeNoteProjections(ctx, parsed.data);
  }

  async getNote(ctx: Context, projectionId: string) {
    if (!projectionId) {
      return fail({ code: 'VALIDATION_ERROR', message: 'projectionId is required' });
    }
    return this.useCases.getKnowledgeNoteProjection(ctx, projectionId);
  }

  async getNoteLinkGraph(ctx: Context, projectionId: string, input: unknown) {
    const parsed = GetKnowledgeNoteLinkGraphSchema.safeParse(input ?? {});
    if (!projectionId || !parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge note link graph request',
        details: parsed.success ? undefined : formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.getKnowledgeNoteLinkGraph(ctx, projectionId, parsed.data);
  }

  async listAttachments(ctx: Context, input: unknown) {
    const parsed = ListKnowledgeProjectionsSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge attachment query',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.listKnowledgeAttachmentProjections(ctx, parsed.data);
  }

  async getAttachmentContent(ctx: Context, projectionId: string) {
    if (!projectionId) {
      return fail({ code: 'VALIDATION_ERROR', message: 'projectionId is required' });
    }
    return this.useCases.getKnowledgeAttachmentContent(ctx, projectionId);
  }

  async createNote(ctx: Context, input: unknown) {
    const parsed = CreateConfirmedKnowledgeNoteSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid confirmed knowledge note request',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.createConfirmedKnowledgeNote(ctx, parsed.data);
  }

  async listWriteRequests(ctx: Context, input: unknown) {
    const parsed = ListKnowledgeWriteRequestsSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge write request query',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.listKnowledgeWriteRequests(ctx, parsed.data);
  }

  async replayWriteRequestProjection(ctx: Context, writeRequestId: string) {
    if (!writeRequestId) {
      return fail({ code: 'VALIDATION_ERROR', message: 'writeRequestId is required' });
    }
    return this.useCases.replayKnowledgeWriteRequestProjection(ctx, writeRequestId);
  }

  async queryKnowledgeTimeline(ctx: Context) {
    return this.useCases.queryKnowledgeTimeline(ctx);
  }

  async getOperationAudit(ctx: Context, input: unknown) {
    const parsed = OperationAuditQuerySchema.safeParse({
      identityId: ctx.identityId,
      ...(typeof input === 'object' && input !== null ? input : {}),
      limit: parseAuditLimit(input),
    });
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid audit query',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.useCases.getOperationAudit(ctx, {
      source: parsed.data.source,
      operationId: parsed.data.operationId,
      limit: parsed.data.limit,
    });
  }
}

function parseAuditLimit(input: unknown): number | undefined {
  if (typeof input === 'object' && input !== null && 'limit' in input) {
    const raw = Number((input as { limit: unknown }).limit);
    if (Number.isFinite(raw)) return Math.min(200, Math.max(1, Math.floor(raw)));
  }
  return 50;
}
