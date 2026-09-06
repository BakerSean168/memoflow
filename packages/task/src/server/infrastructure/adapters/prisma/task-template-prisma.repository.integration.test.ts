import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskTemplate } from '../../../domain/aggregates/task-template';
import { RecurrenceRule, TaskTimeConfig } from '../../../domain/value-objects';
import { TaskTemplatePrismaRepository } from './task-template-prisma.repository';
import { TaskLabelOwnershipError } from '../../../domain/repositories/i-task-template-repository';
import {
  cleanTaskTables,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

describe('TaskTemplatePrismaRepository integration', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanTaskTables();
  });

  it('persists and loads a one-time task template by id', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    // Create a one-time task template
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Complete Project',
      description: 'Finish the quarterly project',
      importance: ImportanceLevel.Important,
      dueDate: tomorrow,
    });

    await repository.save(template);

    const saved = await repository.findByIdForIdentity(identityId, template.id);

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(template.id);
    expect(saved?.identityId).toBe(identityId);
    expect(saved?.title).toBe('Complete Project');
    expect(saved?.taskType).toBe('OneTime');
  });

  it('persists and loads a recurring task template by id', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const startDate = new Date();
    startDate.setHours(9, 0, 0, 0);

    const timeConfig = TaskTimeConfig.createTimePoint(startDate, 9 * 60);

    const recurrenceRule = RecurrenceRule.createWeekly([0], 1);

    // Create a recurring task template
    const template = TaskTemplate.createRecurringTask({
      identityId,
      title: 'Weekly Review',
      description: 'Review the week',
      importance: ImportanceLevel.Moderate,
      timeConfig,
      recurrenceRule,
    });

    await repository.save(template);

    const saved = await repository.findByIdForIdentity(identityId, template.id);

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(template.id);
    expect(saved?.taskType).toBe('Recurring');
    expect(saved?.recurrenceRule).toBeDefined();
  });

  it('lists templates by identity', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template1 = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Task 1',
      importance: ImportanceLevel.Important,
      dueDate: tomorrow,
    });

    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 2);

    const template2 = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Task 2',
      importance: ImportanceLevel.Minor,
      dueDate: nextDay,
    });

    await repository.save(template1);
    await repository.save(template2);

    const templates = await repository.findByIdentityId(identityId);

    expect(templates).toHaveLength(2);
    expect(templates.map((t) => t.id)).toContain(template1.id);
    expect(templates.map((t) => t.id)).toContain(template2.id);
  });

  it('preserves task importance levels', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Important Task',
      description: 'A high-importance task',
      importance: ImportanceLevel.Important,
      dueDate: tomorrow,
    });

    await repository.save(template);
    const saved = await repository.findByIdForIdentity(identityId, template.id);

    expect(saved?.importance).toBe(ImportanceLevel.Important);
    expect(saved?.title).toBe('Important Task');
  });

  it('updates existing template', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Original Title',
      importance: ImportanceLevel.Minor,
      dueDate: tomorrow,
    });

    await repository.save(template);

    // Update the template
    template.updateTitle('Updated Title');
    // R2-5a 乐观锁契约：变更后由调用方递增版本。
    template.advanceVersion();

    await repository.save(template);

    const saved = await repository.findByIdForIdentity(identityId, template.id);

    expect(saved?.title).toBe('Updated Title');
  });

  it('handles soft deletion', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'To Delete',
      importance: ImportanceLevel.Moderate,
      dueDate: tomorrow,
    });

    await repository.save(template);

    // Soft delete
    template.softDelete();
    await repository.save(template);

    const saved = await repository.findByIdForIdentity(identityId, template.id);

    expect(saved?.deletedAt).not.toBeNull();
  });

  it('handles task type persistence correctly', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'One-time Task',
      importance: ImportanceLevel.Moderate,
      dueDate: tomorrow,
    });

    await repository.save(template);
    const saved = await repository.findByIdForIdentity(identityId, template.id);

    expect(saved?.taskType).toBe('OneTime');
    expect(saved?.recurrenceRule).toBeNull();
  });

  it('round-trip: domain -> persistence -> domain preserves data integrity', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);

    const startDate = new Date();
    startDate.setHours(9, 0, 0, 0);
    const timeConfig = TaskTimeConfig.createTimePoint(startDate, 9 * 60);

    const recurrenceRule = RecurrenceRule.createDaily(2);

    const original = TaskTemplate.createRecurringTask({
      identityId,
      title: 'Complex Recurring Task',
      description: 'A detailed recurring task',
      importance: ImportanceLevel.Moderate,
      timeConfig,
      recurrenceRule,
    });

    await repository.save(original);
    const loaded = await repository.findByIdForIdentity(String(original.identityId), original.id);

    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe(original.title);
    expect(loaded?.description).toBe(original.description);
    expect(loaded?.taskType).toBe(original.taskType);
    expect(loaded?.importance).toBe(original.importance);
  });

  it('persists shared Task labels, hydrates labels[] and filters with strict AND + identity isolation', async () => {
    const identityId = IdentityId.generate();
    const otherIdentityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });
    const prisma = await getPrisma();
    const repository = new TaskTemplatePrismaRepository(prisma);
    const first = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Work and AI',
      importance: ImportanceLevel.Important,
      dueDate: new Date(Date.now() + 86400000),
    });
    const second = TaskTemplate.createOneTimeTask({
      identityId,
      title: 'Work only',
      importance: ImportanceLevel.Moderate,
      dueDate: new Date(Date.now() + 2 * 86400000),
    });
    await repository.save(first);
    await repository.save(second);

    const work = await prisma.label.create({
      data: {
        id: `task-label-work-${Date.now()}`,
        identityId,
        name: '#Work',
        normalizedName: '#work',
      },
    });
    const ai = await prisma.label.create({
      data: { id: `task-label-ai-${Date.now()}`, identityId, name: '#AI', normalizedName: '#ai' },
    });
    const foreign = await prisma.label.create({
      data: {
        id: `task-label-foreign-${Date.now()}`,
        identityId: otherIdentityId,
        name: '#Foreign',
        normalizedName: '#foreign',
      },
    });

    await repository.replaceLabels(identityId, String(first.id), [work.id, ai.id]);
    await repository.replaceLabels(identityId, String(second.id), [work.id]);

    const loaded = await repository.findByIdForIdentity(identityId, String(first.id));
    expect(loaded?.labels.map((label) => label.id).sort()).toEqual([ai.id, work.id].sort());
    const both = await repository.findByLabelIdsAll(identityId, [work.id, ai.id]);
    expect(both.map((template) => String(template.id))).toEqual([String(first.id)]);
    expect(both[0]?.labels.map((label) => label.id).sort()).toEqual([ai.id, work.id].sort());
    await expect(
      repository.replaceLabels(identityId, String(first.id), [foreign.id]),
    ).rejects.toBeInstanceOf(TaskLabelOwnershipError);
  });
});
