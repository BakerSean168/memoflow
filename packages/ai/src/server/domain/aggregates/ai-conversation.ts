import { AggregateRoot } from '@memoflow/utils/domain';
import type { AIConversationClientDTO, AIConversationServerDTO } from '@memoflow/contracts/ai';
import { ConversationStatus } from '@memoflow/contracts/ai';
import type { AIEventMap } from '@memoflow/contracts/ai';
import type { IdentityId as IIdentityId } from '@memoflow/contracts/primitives';
import { AiConversationId } from '../value-objects/ai-conversation-id';
import { IdentityId } from '@memoflow/domain-shared/shared';

export interface AIConversationState {
  id: AiConversationId;
  identityId: IIdentityId;
  name: string;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
}

/** Product conversation shell. Mastra Memory owns Assistant message history. */
export class AIConversation extends AggregateRoot<AiConversationId> {
  private _props: Omit<AIConversationState, 'id'>;

  private constructor(state: AIConversationState) {
    super(state.id);
    const { id, ...rest } = state;
    void id;
    this._props = { ...rest };
  }

  public get identityId(): IIdentityId { return this._props.identityId; }
  public get name(): string { return this._props.name; }
  public get status(): ConversationStatus { return this._props.status; }
  public get createdAt(): Date { return this._props.createdAt; }
  public get updatedAt(): Date { return this._props.updatedAt; }
  public get deletedAt(): Date | null { return this._props.deletedAt; }
  public get version(): number { return this._props.version; }

  public static create(params: { identityId: string; name: string }): AIConversation {
    const now = new Date();
    const identityId = IdentityId.of(params.identityId);
    const conversation = new AIConversation({
      id: AiConversationId.generate(),
      identityId,
      name: params.name,
      status: ConversationStatus.Active,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    });
    conversation.addDomainEvent<AIEventMap['ai:conversation-created']>('ai:conversation-created', {
      identityId,
      conversation: conversation.toServerDTO(),
    });
    return conversation;
  }

  public static load(state: AIConversationState): AIConversation { return new AIConversation(state); }

  public updateStatus(status: ConversationStatus): void {
    if (this._props.status === status) return;
    const oldStatus = this._props.status;
    this._props.status = status;
    this._props.updatedAt = new Date();
    this.addDomainEvent<AIEventMap['ai:conversation-status-changed']>('ai:conversation-status-changed', {
      identityId: this._props.identityId,
      conversation: this.toServerDTO(),
      oldStatus,
      newStatus: status,
    });
  }

  public rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Conversation name cannot be empty');
    this._props.name = trimmed;
    this._props.updatedAt = new Date();
    this.addDomainEvent<AIEventMap['ai:conversation-updated']>('ai:conversation-updated', {
      identityId: this._props.identityId,
      conversation: this.toServerDTO(),
      changes: ['name'],
    });
  }

  public softDelete(): void {
    const deletedAt = new Date();
    this._props.deletedAt = deletedAt;
    this._props.status = ConversationStatus.Archived;
    this._props.updatedAt = deletedAt;
    this.addDomainEvent<AIEventMap['ai:conversation-deleted']>('ai:conversation-deleted', {
      identityId: this._props.identityId,
      conversationId: this.id,
      conversation: this.toServerDTO(),
      deletedAt: deletedAt.getTime(),
    });
  }

  public toServerDTO(): AIConversationServerDTO {
    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.name,
      status: this._props.status,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt ? this._props.deletedAt.getTime() : null,
    };
  }

  public toClientDTO(): AIConversationClientDTO {
    return {
      id: String(this.id) as AIConversationClientDTO['id'],
      identityId: String(this._props.identityId) as AIConversationClientDTO['identityId'],
      name: this._props.name,
      status: this._props.status,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }
}
