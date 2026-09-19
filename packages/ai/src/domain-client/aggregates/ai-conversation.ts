import { AggregateRoot } from '@memoflow/utils/domain';
import type { AIConversationClientDTO } from '@memoflow/contracts/ai';
import { ConversationStatus } from '@memoflow/contracts/ai';
import { AiConversationId } from '../../server/domain/value-objects/ai-conversation-id';
import { IdentityId } from '@memoflow/domain-shared/shared';

export interface AIConversationState {
  id: AiConversationId;
  identityId: IdentityId;
  name: string;
  status: ConversationStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Client-domain representation of the product-owned Conversation shell. */
export class AIConversation extends AggregateRoot<AiConversationId> {
  private _props: AIConversationState;

  private constructor(props: AIConversationState) {
    super(props.id);
    this._props = props;
  }

  public get identityId(): IdentityId { return this._props.identityId; }
  public get name(): string { return this._props.name; }
  public get status(): ConversationStatus { return this._props.status; }
  public get version(): number { return this._props.version; }
  public get createdAt(): Date { return this._props.createdAt; }
  public get updatedAt(): Date { return this._props.updatedAt; }
  public get deletedAt(): Date | null { return this._props.deletedAt; }

  public static create(params: { identityId: string; name: string }): AIConversation {
    const now = new Date();
    return new AIConversation({
      id: AiConversationId.of(AiConversationId.generate()),
      identityId: IdentityId.of(params.identityId),
      name: params.name,
      status: ConversationStatus.Active,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  public static load(state: AIConversationState): AIConversation { return new AIConversation(state); }

  public toDTO(): AIConversationClientDTO {
    return {
      id: String(this._props.id) as AIConversationClientDTO['id'],
      identityId: String(this._props.identityId) as AIConversationClientDTO['identityId'],
      name: this._props.name,
      status: this._props.status,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }

  public rename(name: string): void {
    this._props.name = name;
    this._props.updatedAt = new Date();
  }

  public archive(): void {
    this._props.status = ConversationStatus.Archived;
    this._props.updatedAt = new Date();
  }
}
