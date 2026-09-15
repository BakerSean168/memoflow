/**
 * NotificationTemplate 聚合根实现
 * 通知模板聚合根 - 服务端实现
 */

import type { NotificationTemplateId, IdentityId } from '@memoflow/contracts/primitives';
import type {
  NotificationEventMap,
  NotificationTemplateServerDTO,
  NotificationTemplateClientDTO,
  NotificationTemplateConfigServerDTO,
} from '@memoflow/contracts/notification';
import { NotificationCategory, NotificationType } from '@memoflow/contracts/notification';
import { AggregateRoot } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import { NotificationTemplateId as NotificationTemplateIdType } from '../value-objects/notification-template-id';
import { NotificationTemplateConfig } from '../value-objects/notification-template-config';

const logger = createLogger('NotificationTemplate');

/**
 * NotificationTemplate 内部状态接口
 */
export interface NotificationTemplateState {
  id: NotificationTemplateId;
  name: string;
  description: string | null;
  type: NotificationType;
  category: NotificationCategory;
  template: NotificationTemplateConfig;
  isActive: boolean;
  isSystemTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * NotificationTemplate 聚合根
 * 负责通知模板的创建、更新和管理
 */
export class NotificationTemplate extends AggregateRoot<NotificationTemplateId> {
  // ===== 私有状态 =====
  private _props: NotificationTemplateState;

  // ===== 构造函数（私有） =====
  private constructor(state: NotificationTemplateState) {
    super(state.id);
    this._props = { ...state };
  }

  // ===== Getter 属性 =====
  public get name(): string {
    return this._props.name;
  }

  public get description(): string | null {
    return this._props.description;
  }

  public get type(): NotificationType {
    return this._props.type;
  }

  public get category(): NotificationCategory {
    return this._props.category;
  }

  public get template(): NotificationTemplateConfigServerDTO {
    return this._props.template.toContract();
  }

  public get isActive(): boolean {
    return this._props.isActive;
  }

  public get isSystemTemplate(): boolean {
    return this._props.isSystemTemplate;
  }

  public get createdAt(): Date {
    return this._props.createdAt;
  }

  public get updatedAt(): Date {
    return this._props.updatedAt;
  }

  // ===== 业务方法 =====

  /**
   * 激活模板
   */
  public activate(): void {
    if (this._props.isActive) return;
    this._props.isActive = true;
    this._props.updatedAt = new Date();

    this.addDomainEvent<NotificationEventMap['notification:template-activated']>(
      'notification:template-activated',
      { templateId: this.id as NotificationTemplateId },
    );

    logger.info('✅ [聚合根] 模板已激活', { id: String(this.id) });
  }

  /**
   * 停用模板
   */
  public deactivate(): void {
    if (!this._props.isActive) return;
    this._props.isActive = false;
    this._props.updatedAt = new Date();

    this.addDomainEvent<NotificationEventMap['notification:template-deactivated']>(
      'notification:template-deactivated',
      { templateId: this.id as NotificationTemplateId },
    );

    logger.info('✅ [聚合根] 模板已停用', { id: String(this.id) });
  }

  /**
   * 更新模板配置
   */
  public updatePlan(template: Partial<NotificationTemplateConfigServerDTO>): void {
    const current = this._props.template.toContract();
    const updated = { ...current, ...template };
    this._props.template = NotificationTemplateConfig.fromContract(updated);
    this._props.updatedAt = new Date();

    this.addDomainEvent<NotificationEventMap['notification:template-updated']>(
      'notification:template-updated',
      { templateId: this.id as NotificationTemplateId, changedFields: Object.keys(template) },
    );

    logger.info('✅ [聚合根] 模板配置已更新', { id: String(this.id) });
  }

  /**
   * 渲染模板
   */
  public render(variables: Record<string, unknown>): { title: string; content: string } {
    return this._props.template.render(variables);
  }

  /**
   * 渲染邮件模板
   */
  public renderEmail(variables: Record<string, unknown>): {
    subject: string;
    htmlBody: string;
    textBody?: string;
  } {
    const emailTemplate = this._props.template.emailTemplate;
    if (!emailTemplate) {
      throw new Error('该模板未配置邮件模板');
    }

    let subject = emailTemplate.subject;
    let htmlBody = emailTemplate.htmlBody ?? '';
    let textBody = emailTemplate.textBody ?? undefined;

    // 替换变量
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(pattern, String(value ?? ''));
      htmlBody = htmlBody.replace(pattern, String(value ?? ''));
      if (textBody !== undefined) {
        textBody = textBody.replace(pattern, String(value ?? ''));
      }
    }

    return { subject, htmlBody, textBody };
  }

  /**
   * 渲染推送模板
   */
  public renderPush(variables: Record<string, unknown>): { title: string; body: string } {
    const pushTemplate = this._props.template.pushTemplate;
    if (!pushTemplate) {
      throw new Error('该模板未配置推送模板');
    }

    let title = pushTemplate.title;
    let body = pushTemplate.body;

    // 替换变量
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      title = title.replace(pattern, String(value ?? ''));
      body = body.replace(pattern, String(value ?? ''));
    }

    return { title, body };
  }

  /**
   * 验证变量是否满足模板要求
   */
  public validateVariables(variables: Record<string, unknown>): {
    isValid: boolean;
    missingVariables: string[];
  } {
    return this._props.template.validateVariables(variables);
  }

  // ===== 转换方法 =====

  public toServerDTO(): NotificationTemplateServerDTO {
    return {
      id: this.id as NotificationTemplateId,
      name: this._props.name,
      description: this._props.description,
      type: this._props.type,
      category: this._props.category,
      template: this._props.template.toContract(),
      isActive: this._props.isActive,
      isSystemTemplate: this._props.isSystemTemplate,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
    };
  }

  public toClientDTO(): NotificationTemplateClientDTO {
    return {
      id: this.id as NotificationTemplateId,
      name: this._props.name,
      description: this._props.description,
      type: this._props.type,
      category: this._props.category,
      template: this._props.template.toContract(),
      isActive: this._props.isActive,
      isSystemTemplate: this._props.isSystemTemplate,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
    };
  }

  // ===== 静态工厂方法 =====

  public static load(state: NotificationTemplateState): NotificationTemplate {
    return new NotificationTemplate(state);
  }

  public static create(params: {
    name: string;
    type: NotificationType;
    category: NotificationCategory;
    template: NotificationTemplateConfigServerDTO;
    description?: string | null;
    isSystemTemplate?: boolean;
  }): NotificationTemplate {
    logger.info('🔨 [聚合根] 创建 NotificationTemplate 实例', {
      name: params.name,
      type: params.type,
      category: params.category,
    });

    const id = NotificationTemplateIdType.of(NotificationTemplateIdType.generate());
    const now = new Date();

    const template = new NotificationTemplate({
      id,
      name: params.name,
      description: params.description ?? null,
      type: params.type,
      category: params.category,
      template: NotificationTemplateConfig.fromContract(params.template),
      isActive: true,
      isSystemTemplate: params.isSystemTemplate ?? false,
      createdAt: now,
      updatedAt: now,
    });

    logger.info('✅ [聚合根] NotificationTemplate 实例已创建', { id: String(id) });

    // NOTE: NotificationTemplate does not have identityId; using template id as fallback.
    template.addDomainEvent<NotificationEventMap['notification:template-created']>(
      'notification:template-created',
      { identityId: String(id) as IdentityId, templateId: id as NotificationTemplateId, name: params.name, type: params.type, category: params.category },
    );

    return template;
  }
}
