/**
 * AI Provider Config - Domain Aggregate
 */

import { AggregateRoot } from '@memoflow/utils/domain';
import type { AIProviderDefinitionId } from '@memoflow/contracts/ai';
import type {
  AIEventMap,
  AIProviderConfigClientDTO,
  AIProviderConfigServerDTO,
} from '@memoflow/contracts/ai';
import type { AIProviderCredentialRef, IdentityId as IIdentityId } from '@memoflow/contracts/primitives';
import { AiProviderConfigId } from '../../domain/value-objects/ai-provider-config-id';
import { IdentityId } from '@memoflow/domain-shared/shared';

export interface AIProviderConfigState {
  id: AiProviderConfigId;
  identityId: IIdentityId;
  name: string;
  providerDefinitionId: AIProviderDefinitionId;
  baseUrl: string;
  credentialRef: AIProviderCredentialRef;
  defaultModel: string | null;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class AIProviderConfig extends AggregateRoot<AiProviderConfigId> {
  private _props: Omit<AIProviderConfigState, 'id'>;

  private constructor(state: AIProviderConfigState) {
    super(state.id);
    const { id, ...rest } = state;
    void id;
    this._props = { ...rest };
  }

  // ===== Getters =====

  public get identityId(): IIdentityId {
    return this._props.identityId;
  }

  public get name(): string {
    return this._props.name;
  }

  public get providerDefinitionId(): AIProviderDefinitionId {
    return this._props.providerDefinitionId;
  }

  public get baseUrl(): string {
    return this._props.baseUrl;
  }

  public get credentialRef(): AIProviderCredentialRef {
    return this._props.credentialRef;
  }

  public get defaultModel(): string | null {
    return this._props.defaultModel;
  }


  public get isActive(): boolean {
    return this._props.isActive;
  }

  public get isDefault(): boolean {
    return this._props.isDefault;
  }

  public get priority(): number {
    return this._props.priority;
  }

  public get createdAt(): Date {
    return this._props.createdAt;
  }

  public get updatedAt(): Date {
    return this._props.updatedAt;
  }

  public get version(): number {
    return this._props.version;
  }

  public get deletedAt(): Date | null {
    return this._props.deletedAt;
  }

  // ===== Factory Methods =====

  public static create(params: {
    identityId: string;
    name: string;
    providerDefinitionId: AIProviderDefinitionId;
    baseUrl: string;
    credentialRef: AIProviderCredentialRef;
    defaultModel?: string;
    isDefault?: boolean;
    priority?: number;
  }): AIProviderConfig {
    const now = new Date();
    const identityId = IdentityId.of(params.identityId);
    const instance = new AIProviderConfig({
      id: AiProviderConfigId.generate(),
      identityId,
      name: params.name.trim(),
      providerDefinitionId: params.providerDefinitionId,
      baseUrl: AIProviderConfig.normalizeBaseUrl(params.baseUrl),
      credentialRef: params.credentialRef,
      defaultModel: params.defaultModel ?? null,
      isActive: true,
      isDefault: params.isDefault ?? false,
      priority: params.priority ?? 100,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    instance.addDomainEvent<AIEventMap['ai:provider-config-created']>('ai:provider-config-created', {
      identityId,
      providerConnection: instance.toServerDTO(),
    });

    return instance;
  }

  public static load(state: AIProviderConfigState): AIProviderConfig {
    return new AIProviderConfig(state);
  }

  // ===== Business Methods =====

  public updateName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      throw new Error('Provider name must be 1-50 characters');
    }
    this._props.name = trimmed;
    this._props.updatedAt = new Date();
  }

  public updateBaseUrl(baseUrl: string): void {
    this._props.baseUrl = AIProviderConfig.normalizeBaseUrl(baseUrl);
    this._props.updatedAt = new Date();
  }

  public updateCredentialRef(credentialRef: AIProviderCredentialRef): void {
    if (!credentialRef || credentialRef.trim().length === 0) {
      throw new Error('Credential reference cannot be empty');
    }
    this._props.credentialRef = credentialRef;
    this._props.updatedAt = new Date();
  }

  public setDefaultModel(modelId: string | null): void {
    this._props.defaultModel = modelId;
    this._props.updatedAt = new Date();
  }

  public activate(): void {
    this._props.isActive = true;
    this._props.updatedAt = new Date();
  }

  public deactivate(): void {
    this._props.isActive = false;
    if (this._props.isDefault) {
      this._props.isDefault = false;
    }
    this._props.updatedAt = new Date();
  }

  public setAsDefault(): void {
    if (!this._props.isActive) {
      throw new Error('Cannot set inactive provider as default');
    }
    this._props.isDefault = true;
    this._props.updatedAt = new Date();

    this.addDomainEvent<AIEventMap['ai:provider-config-set-default']>(
      'ai:provider-config-set-default',
      {
        identityId: this._props.identityId,
        providerConnection: this.toServerDTO(),
      },
    );
  }

  public unsetDefault(): void {
    this._props.isDefault = false;
    this._props.updatedAt = new Date();
  }

  public updatePriority(priority: number): void {
    if (priority < 1 || priority > 999) {
      throw new Error('Priority must be between 1 and 999');
    }
    this._props.priority = priority;
    this._props.updatedAt = new Date();
  }

  // ===== DTO Conversion =====

  public toServerDTO(): AIProviderConfigServerDTO {
    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.name,
      providerDefinitionId: this._props.providerDefinitionId,
      baseUrl: this._props.baseUrl,
      credentialRef: this._props.credentialRef,
      defaultModel: this._props.defaultModel,
      isActive: this._props.isActive,
      isDefault: this._props.isDefault,
      priority: this._props.priority,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }

  public toClientDTO(): AIProviderConfigClientDTO {
    return {
      id: String(this.id) as AIProviderConfigClientDTO['id'],
      identityId: String(this._props.identityId) as AIProviderConfigClientDTO['identityId'],
      name: this._props.name,
      providerDefinitionId: this._props.providerDefinitionId,
      baseUrl: this._props.baseUrl,
      credentialRef: this._props.credentialRef,
      defaultModel: this._props.defaultModel,
      isActive: this._props.isActive,
      isDefault: this._props.isDefault,
      priority: this._props.priority,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }

  // ===== Static Helpers =====

  public static normalizeBaseUrl(url: string): string {
    let normalized = url.trim();
    while (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
}
