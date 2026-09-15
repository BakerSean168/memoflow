import { describe, it, expect } from 'vitest';
import type { NotificationTemplateConfigServerDTO } from '@memoflow/contracts/notification';
import { NotificationTemplate } from '../notification-template';
import { NotificationType, NotificationCategory } from '@memoflow/contracts/notification';

describe('NotificationTemplate Aggregate Root', () => {
  function aTemplateConfig(
    overrides: Partial<NotificationTemplateConfigServerDTO> = {},
  ): NotificationTemplateConfigServerDTO {
    return {
      template: {
        title: 'Hello {{name}}',
        content: 'Welcome to {{app}}, {{name}}!',
        variables: ['name', 'app'],
      },
      channels: { inApp: true, email: false, push: false, sms: false },
      emailTemplate: null,
      pushTemplate: null,
      ...overrides,
    };
  }

  function aTemplate(overrides: Partial<Parameters<typeof NotificationTemplate.create>[0]> = {}) {
    return NotificationTemplate.create({
      name: 'Welcome Template',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      template: aTemplateConfig(),
      ...overrides,
    });
  }

  describe('create()', () => {
    it('should create an active template', () => {
      const tmpl = aTemplate();

      expect(tmpl.id).toBeTruthy();
      expect(tmpl.name).toBe('Welcome Template');
      expect(tmpl.type).toBe(NotificationType.Info);
      expect(tmpl.category).toBe(NotificationCategory.System);
      expect(tmpl.isActive).toBe(true);
      expect(tmpl.isSystemTemplate).toBe(false);
    });

    it('should accept a description', () => {
      const tmpl = aTemplate({ description: 'A welcome template' });

      expect(tmpl.description).toBe('A welcome template');
    });

    it('should default description to null', () => {
      const tmpl = aTemplate();

      expect(tmpl.description).toBeNull();
    });

    it('should accept isSystemTemplate flag', () => {
      const tmpl = aTemplate({ isSystemTemplate: true });

      expect(tmpl.isSystemTemplate).toBe(true);
    });

    it('should set createdAt and updatedAt', () => {
      const tmpl = aTemplate();

      expect(tmpl.createdAt).toBeInstanceOf(Date);
      expect(tmpl.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('activate() / deactivate()', () => {
    it('should deactivate an active template', () => {
      const tmpl = aTemplate();

      tmpl.deactivate();

      expect(tmpl.isActive).toBe(false);
    });

    it('should activate a deactivated template', () => {
      const tmpl = aTemplate();
      tmpl.deactivate();

      tmpl.activate();

      expect(tmpl.isActive).toBe(true);
    });

    it('should be idempotent when activating an already active template', () => {
      const tmpl = aTemplate();
      const before = tmpl.updatedAt;

      tmpl.activate();

      // No-op, updatedAt should not change
      expect(tmpl.isActive).toBe(true);
      expect(tmpl.updatedAt.getTime()).toBe(before.getTime());
    });

    it('should be idempotent when deactivating an already inactive template', () => {
      const tmpl = aTemplate();
      tmpl.deactivate();
      const before = tmpl.updatedAt;

      tmpl.deactivate();

      expect(tmpl.isActive).toBe(false);
      expect(tmpl.updatedAt.getTime()).toBe(before.getTime());
    });
  });

  describe('updatePlan()', () => {
    it('should update the template configuration', () => {
      const tmpl = aTemplate();

      tmpl.updatePlan({
        template: { title: 'Updated {{name}}', content: 'New content', variables: ['name'] },
        channels: { inApp: true, email: true, push: false, sms: false },
      });

      const config = tmpl.template;
      expect(config.template.title).toBe('Updated {{name}}');
      expect(config.channels.email).toBe(true);
    });

    it('should partially update template (merge with existing)', () => {
      const tmpl = aTemplate();

      tmpl.updatePlan({
        channels: { inApp: true, email: true, push: true, sms: false },
      });

      const config = tmpl.template;
      expect(config.channels.push).toBe(true);
      // Original template content should remain
      expect(config.template.title).toBe('Hello {{name}}');
    });
  });

  describe('render()', () => {
    it('should substitute variables in title and content', () => {
      const tmpl = aTemplate();

      const result = tmpl.render({ name: 'Alice', app: 'MemoFlow' });

      expect(result.title).toBe('Hello Alice');
      expect(result.content).toBe('Welcome to MemoFlow, Alice!');
    });

    it('should replace multiple occurrences of the same variable', () => {
      const tmpl = aTemplate({
        template: aTemplateConfig({
          template: {
            title: '{{name}} - {{name}}',
            content: 'Hi {{name}}!',
            variables: ['name'],
          },
        }),
      });

      const result = tmpl.render({ name: 'Bob' });

      expect(result.title).toBe('Bob - Bob');
      expect(result.content).toBe('Hi Bob!');
    });

    it('should leave placeholders when variables are missing', () => {
      const tmpl = aTemplate();

      const result = tmpl.render({ name: 'Alice' });

      expect(result.title).toBe('Hello Alice');
      expect(result.content).toContain('{{app}}');
    });

    it('should handle empty variables gracefully', () => {
      const tmpl = aTemplate();

      const result = tmpl.render({});

      expect(result.title).toContain('{{name}}');
    });
  });

  describe('renderEmail()', () => {
    it('should render an email template', () => {
      const tmpl = aTemplate({
        template: aTemplateConfig({
          emailTemplate: {
            subject: 'Welcome {{name}}',
            htmlBody: '<h1>Hi {{name}}</h1>',
            textBody: 'Hi {{name}}',
          },
        }),
      });

      const result = tmpl.renderEmail({ name: 'Alice' });

      expect(result.subject).toBe('Welcome Alice');
      expect(result.htmlBody).toBe('<h1>Hi Alice</h1>');
      expect(result.textBody).toBe('Hi Alice');
    });

    it('should throw when no email template is configured', () => {
      const tmpl = aTemplate();

      expect(() => tmpl.renderEmail({ name: 'Alice' })).toThrow('该模板未配置邮件模板');
    });
  });

  describe('renderPush()', () => {
    it('should render a push template', () => {
      const tmpl = aTemplate({
        template: aTemplateConfig({
          pushTemplate: {
            title: 'Push {{name}}',
            body: 'Hello {{name}} from push!',
          },
        }),
      });

      const result = tmpl.renderPush({ name: 'Alice' });

      expect(result.title).toBe('Push Alice');
      expect(result.body).toBe('Hello Alice from push!');
    });

    it('should throw when no push template is configured', () => {
      const tmpl = aTemplate();

      expect(() => tmpl.renderPush({ name: 'Alice' })).toThrow('该模板未配置推送模板');
    });
  });

  describe('validateVariables()', () => {
    it('should return valid when all variables are provided', () => {
      const tmpl = aTemplate();

      const result = tmpl.validateVariables({ name: 'Alice', app: 'MemoFlow' });

      expect(result.isValid).toBe(true);
      expect(result.missingVariables).toEqual([]);
    });

    it('should report missing variables', () => {
      const tmpl = aTemplate();

      const result = tmpl.validateVariables({ name: 'Alice' });

      expect(result.isValid).toBe(false);
      expect(result.missingVariables).toContain('app');
    });

    it('should return valid when no variables are required', () => {
      const tmpl = aTemplate({
        template: aTemplateConfig({
          template: { title: 'Static title', content: 'Static content', variables: [] },
        }),
      });

      const result = tmpl.validateVariables({});

      expect(result.isValid).toBe(true);
    });
  });

  describe('toServerDTO()', () => {
    it('should convert to a server DTO', () => {
      const tmpl = aTemplate();

      const dto = tmpl.toServerDTO();

      expect(dto.id).toBeTruthy();
      expect(dto.name).toBe('Welcome Template');
      expect(dto.type).toBe(NotificationType.Info);
      expect(dto.category).toBe(NotificationCategory.System);
      expect(dto.isActive).toBe(true);
      expect(dto.isSystemTemplate).toBe(false);
      expect(typeof dto.createdAt).toBe('number');
      expect(typeof dto.updatedAt).toBe('number');
      expect(dto.template).toBeDefined();
    });
  });

  describe('toClientDTO()', () => {
    it('should convert to a client DTO', () => {
      const tmpl = aTemplate();

      const dto = tmpl.toClientDTO();

      expect(dto.id).toBeTruthy();
      expect(dto.name).toBe('Welcome Template');
      expect(dto.type).toBe(NotificationType.Info);
      expect(dto.category).toBe(NotificationCategory.System);
      expect(dto.isActive).toBe(true);
      expect(typeof dto.createdAt).toBe('number');
      expect(typeof dto.updatedAt).toBe('number');
      expect(dto.template).toBeDefined();
    });
  });

  describe('load()', () => {
    it('should reconstruct from state', () => {
      const original = aTemplate();
      original.deactivate();

      const loaded = NotificationTemplate.load({
        id: original.id as any,
        name: original.name,
        description: original.description,
        type: original.type,
        category: original.category,
        template: (original as any)._props.template,
        isActive: original.isActive,
        isSystemTemplate: original.isSystemTemplate,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
      });

      expect(loaded.name).toBe('Welcome Template');
      expect(loaded.isActive).toBe(false);
    });
  });
});
