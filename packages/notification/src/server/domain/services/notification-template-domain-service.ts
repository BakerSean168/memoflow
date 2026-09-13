/**
 * NotificationTemplate 领域服务
 *
 * 管理通知模板的业务逻辑
 */

import type { INotificationTemplateRepository } from '../repositories/i-notification-template-repository';
import type { NotificationTemplateConfigServerDTO } from '@memoflow/contracts/notification';
import { NotificationTemplate } from '../aggregates/notification-template';
import { NotificationCategory, NotificationType } from '@memoflow/contracts/notification';

/**
 * NotificationTemplateDomainService
 */
export class NotificationTemplateDomainService {
  constructor(
    private readonly templateRepo: INotificationTemplateRepository,
    // private readonly eventBus: IEventBus,
  ) {}

  /**
   * 创建新模板
   */
  public async createPlan(params: {
    name: string;
    type: NotificationType;
    category: NotificationCategory;
    template: NotificationTemplateConfigServerDTO;
    description?: string;
    isSystemTemplate?: boolean;
  }): Promise<NotificationTemplate> {
    // 1. 验证：检查名称是否已被使用
    const isNameUsed = await this.templateRepo.isNameUsed(params.name);
    if (isNameUsed) {
      throw new Error(`Template name is already in use: ${params.name}`);
    }

    // 2. 创建聚合根
    const template = NotificationTemplate.create(params);

    // 3. 持久化
    await this.templateRepo.save(template);

    // 4. 触发领域事件
    // await this.eventBus.publish({
    //   type: 'notification.template.created',
    //   aggregateId: template.id,
    //   timestamp: Date.now(),
    //   payload: {
    //     template: template.toServerDTO(),
    //   },
    // });

    return template;
  }

  /**
   * 获取模板
   */
  public async getPlan(id: string): Promise<NotificationTemplate | null> {
    return await this.templateRepo.findById(id);
  }

  /**
   * 通过名称获取模板
   */
  public async getPlanByName(name: string): Promise<NotificationTemplate | null> {
    return await this.templateRepo.findByName(name);
  }

  /**
   * 获取所有模板
   */
  public async getAllTemplates(options?: {
    includeInactive?: boolean;
  }): Promise<NotificationTemplate[]> {
    return await this.templateRepo.findAll(options);
  }

  /**
   * 获取分类模板
   */
  public async getPlansByCategory(
    category: NotificationCategory,
    options?: { activeOnly?: boolean },
  ): Promise<NotificationTemplate[]> {
    return await this.templateRepo.findByCategory(category, options);
  }

  /**
   * 获取类型模板
   */
  public async getPlansByType(
    type: NotificationType,
    options?: { activeOnly?: boolean },
  ): Promise<NotificationTemplate[]> {
    return await this.templateRepo.findByType(type, options);
  }

  /**
   * 获取系统预设模板
   */
  public async getSystemTemplates(): Promise<NotificationTemplate[]> {
    return await this.templateRepo.findSystemTemplates();
  }

  /**
   * 更新模板配置
   */
  public async updatePlanConfig(
    id: string,
    template: Partial<NotificationTemplateConfigServerDTO>,
  ): Promise<NotificationTemplate> {
    const templateEntity = await this.templateRepo.findById(id);
    if (!templateEntity) {
      throw new Error(`Template not found: ${id}`);
    }

    templateEntity.updatePlan(template);
    await this.templateRepo.save(templateEntity);

    return templateEntity;
  }

  /**
   * 激活模板
   */
  public async activatePlan(id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    template.activate();
    await this.templateRepo.save(template);

    // await this.eventBus.publish({
    //   type: 'notification.template.activation.changed',
    //   aggregateId: id,
    //   timestamp: Date.now(),
    //   payload: {
    //     templateId: id,
    //     isActive: true,
    //   },
    // });
  }

  /**
   * 停用模板
   */
  public async deactivatePlan(id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    template.deactivate();
    await this.templateRepo.save(template);

    // await this.eventBus.publish({
    //   type: 'notification.template.activation.changed',
    //   aggregateId: id,
    //   timestamp: Date.now(),
    //   payload: {
    //     templateId: id,
    //     isActive: false,
    //   },
    // });
  }

  /**
   * 删除模板
   */
  public async deletePlan(id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    if (template.isSystemTemplate) {
      throw new Error('Cannot delete system template');
    }

    await this.templateRepo.delete(id);
  }

  /**
   * 预览模板渲染
   */
  public async previewTemplate(
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{ title: string; content: string }> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    // 验证变量
    const validation = template.validateVariables(variables);
    if (!validation.isValid) {
      throw new Error(`Missing template variables: ${validation.missingVariables.join(', ')}`);
    }

    return template.render(variables);
  }

  /**
   * 预览邮件模板
   */
  public async previewEmailTemplate(
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{ subject: string; htmlBody: string; textBody?: string }> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    return template.renderEmail(variables);
  }

  /**
   * 预览推送模板
   */
  public async previewPushTemplate(
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{ title: string; body: string }> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    return template.renderPush(variables);
  }

  /**
   * 验证模板变量
   */
  public async validateTemplateVariables(
    id: string,
    variables: Record<string, unknown>,
  ): Promise<{ isValid: boolean; missingVariables: string[] }> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    return template.validateVariables(variables);
  }

  /**
   * 统计模板数量
   */
  public async countTemplates(options?: { activeOnly?: boolean }): Promise<number> {
    return await this.templateRepo.count(options);
  }
}
