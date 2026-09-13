import { NotificationCategory, NotificationType } from '@memoflow/contracts/notification';
import { NotificationTemplate } from '../../aggregates/notification-template';
import { NotificationTemplateDomainService } from '../notification-template-domain-service';

function createPlanConfig() {
  return {
    template: {
      title: 'Hello {{name}}',
      content: 'Welcome {{name}}',
      variables: ['name'],
    },
    channels: {
      inApp: true,
      email: true,
      push: false,
      sms: false,
    },
    emailTemplate: {
      subject: 'Hi {{name}}',
      htmlBody: '<b>{{name}}</b>',
    },
    pushTemplate: {
      title: 'Push {{name}}',
      body: 'Body {{name}}',
    },
  };
}

function createPlan(name = 'Welcome Template', isSystemTemplate = false) {
  return NotificationTemplate.create({
    name,
    type: NotificationType.Info,
    category: NotificationCategory.System,
    template: createPlanConfig(),
    isSystemTemplate,
  });
}

function createRepository() {
  return {
    isNameUsed: vi.fn(),
    save: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    findAll: vi.fn(),
    findByCategory: vi.fn(),
    findByType: vi.fn(),
    findSystemTemplates: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
}

describe('NotificationTemplateDomainService', () => {
  it('creates a template only when the name is unused', async () => {
    const repo = createRepository();
    repo.isNameUsed.mockResolvedValue(false);
    const service = new NotificationTemplateDomainService(repo as never);

    const template = await service.createPlan({
      name: 'Welcome Template',
      type: NotificationType.Info,
      category: NotificationCategory.System,
      template: createPlanConfig(),
    });

    expect(template.name).toBe('Welcome Template');
    expect(repo.save).toHaveBeenCalledWith(template);

    repo.isNameUsed.mockResolvedValue(true);

    await expect(
      service.createPlan({
        name: 'Welcome Template',
        type: NotificationType.Info,
        category: NotificationCategory.System,
        template: createPlanConfig(),
      }),
    ).rejects.toThrow('Template name is already in use');
  });

  it('delegates reads and lifecycle operations to the repository', async () => {
    const repo = createRepository();
    const template = createPlan();
    repo.findById.mockResolvedValue(template);
    repo.findByName.mockResolvedValue(template);
    repo.findAll.mockResolvedValue([template]);
    repo.findByCategory.mockResolvedValue([template]);
    repo.findByType.mockResolvedValue([template]);
    repo.findSystemTemplates.mockResolvedValue([template]);
    repo.count.mockResolvedValue(3);

    const service = new NotificationTemplateDomainService(repo as never);

    expect(await service.getPlan(String(template.id))).toBe(template);
    expect(await service.getPlanByName(template.name)).toBe(template);
    expect(await service.getAllTemplates({ includeInactive: true })).toEqual([template]);
    expect(
      await service.getPlansByCategory(NotificationCategory.System, { activeOnly: true }),
    ).toEqual([template]);
    expect(
      await service.getPlansByType(NotificationType.Info, { activeOnly: true }),
    ).toEqual([template]);
    expect(await service.getSystemTemplates()).toEqual([template]);
    expect(await service.countTemplates({ activeOnly: true })).toBe(3);

    await service.activatePlan(String(template.id));
    expect(template.isActive).toBe(true);

    await service.deactivatePlan(String(template.id));
    expect(template.isActive).toBe(false);

    await service.deletePlan(String(template.id));
    expect(repo.delete).toHaveBeenCalledWith(String(template.id));
  });

  it('updates, previews, and validates an existing template', async () => {
    const repo = createRepository();
    const template = createPlan();
    repo.findById.mockResolvedValue(template);
    const service = new NotificationTemplateDomainService(repo as never);

    const updated = await service.updatePlanConfig(String(template.id), {
      template: {
        title: 'Updated {{name}}',
        content: 'Body {{name}}',
        variables: ['name'],
      },
    });

    expect(updated.render({ name: 'Ada' }).title).toBe('Updated Ada');
    expect(repo.save).toHaveBeenCalledWith(template);

    expect(await service.previewTemplate(String(template.id), { name: 'Ada' })).toEqual({
      title: 'Updated Ada',
      content: 'Body Ada',
    });
    expect(await service.previewEmailTemplate(String(template.id), { name: 'Ada' })).toEqual({
      subject: 'Hi Ada',
      htmlBody: '<b>Ada</b>',
      textBody: undefined,
    });
    expect(await service.previewPushTemplate(String(template.id), { name: 'Ada' })).toEqual({
      title: 'Push Ada',
      body: 'Body Ada',
    });
    expect(await service.validateTemplateVariables(String(template.id), { name: 'Ada' })).toEqual({
      isValid: true,
      missingVariables: [],
    });
  });

  it('guards missing templates and system-template deletion', async () => {
    const repo = createRepository();
    const systemTemplate = createPlan('System Template', true);
    const service = new NotificationTemplateDomainService(repo as never);

    repo.findById.mockResolvedValueOnce(null);
    await expect(service.updatePlanConfig('missing', {})).rejects.toThrow('Template not found');

    repo.findById.mockResolvedValueOnce(null);
    await expect(service.activatePlan('missing')).rejects.toThrow('Template not found');

    repo.findById.mockResolvedValueOnce(null);
    await expect(service.deactivatePlan('missing')).rejects.toThrow('Template not found');

    repo.findById.mockResolvedValueOnce(systemTemplate);
    await expect(service.previewTemplate(String(systemTemplate.id), {})).rejects.toThrow(
      'Missing template variables: name',
    );

    repo.findById.mockResolvedValueOnce(systemTemplate);
    await expect(service.deletePlan(String(systemTemplate.id))).rejects.toThrow(
      'Cannot delete system template',
    );
  });
});
