import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Structural locks for identity isolation and M:N Profile ownership. */
describe('reminder template ownership surface', () => {
  const templatePort = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-reminder-template-repository.ts'),
    'utf8',
  );
  const groupPort = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-reminder-group-repository.ts'),
    'utf8',
  );
  const prismaTemplate = readFileSync(
    resolve(__dirname, '../reminder-template-prisma.repository.ts'),
    'utf8',
  );
  const prismaGroup = readFileSync(
    resolve(__dirname, '../reminder-group-prisma.repository.ts'),
    'utf8',
  );
  const powersyncTemplate = readFileSync(
    resolve(__dirname, '../../powersync/reminder-template-powersync.repository.ts'),
    'utf8',
  );
  const powersyncGroup = readFileSync(
    resolve(__dirname, '../../powersync/reminder-group-powersync.repository.ts'),
    'utf8',
  );
  const getUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-reminder-template.use-case.ts'),
    'utf8',
  );
  const listUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/list-reminder-templates.use-case.ts'),
    'utf8',
  );
  const deleteUseCase = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/delete-reminder-template.use-case.ts'),
    'utf8',
  );
  const actionService = readFileSync(
    resolve(__dirname, '../../../../application/services/reminder-template-action-application-service.ts'),
    'utf8',
  );
  const module = readFileSync(resolve(__dirname, '../../../reminder.module.ts'), 'utf8');
  const domainService = readFileSync(
    resolve(__dirname, '../../../../domain/services/reminder-domain-service.ts'),
    'utf8',
  );
  const controlService = readFileSync(
    resolve(__dirname, '../../../../domain/services/reminder-template-control-service.ts'),
    'utf8',
  );
  const mapper = readFileSync(
    resolve(__dirname, '../../../../application/mappers/reminder-template-client.mapper.ts'),
    'utf8',
  );
  const groupApp = readFileSync(
    resolve(__dirname, '../../../../application/services/reminder-group-application-service.ts'),
    'utf8',
  );

  it('ports require identity-scoped aggregate loads and deletes', () => {
    expect(templatePort).toContain('findByIdForIdentity(');
    expect(templatePort).toContain('identityId: string');
    expect(groupPort).toContain(
      'findByIdForIdentity(identityId: string, id: string): Promise<ReminderGroup | null>;',
    );
    expect(templatePort).toContain('delete(identityId: string, id: string): Promise<void>;');
    expect(templatePort).toContain('exists(identityId: string, id: string): Promise<boolean>;');
    expect(groupPort).toContain('delete(identityId: string, id: string): Promise<void>;');
    expect(groupPort).toContain('exists(identityId: string, id: string): Promise<boolean>;');
  });

  it('drops bare findById dual methods', () => {
    expect(groupPort).not.toContain('findById(id: string): Promise<ReminderGroup | null>;');
    expect(templatePort).not.toMatch(/\bfindById\(\n\s*id: string,/);
    expect(prismaGroup).not.toMatch(/async findById\(id: string\)/);
    expect(prismaTemplate).not.toMatch(/async findById\(\n\s*id: string,/);
    expect(powersyncGroup).not.toMatch(/async findById\(id: string\)/);
    expect(powersyncTemplate).not.toMatch(/async findById\(\n\s*id: string,/);
  });

  it('template reads remain identity-scoped end-to-end', () => {
    expect(prismaTemplate).toContain('where: { id, identityId }');
    expect(getUseCase).toContain('findByIdForIdentity(cx.identityId, id');
    expect(deleteUseCase).toContain('findByIdForIdentity(cx.identityId, id)');
    expect(actionService).toContain('findByIdForIdentity(');
    expect(actionService).toContain('ctx.identityId');
    expect(module).toContain('findByIdForIdentity(ctx.identityId, templateId, options)');
    expect(domainService).toContain(
      'return this.reminderTemplateRepository.findByIdForIdentity(identityId, id, options);',
    );
  });

  it('findByIds is identity-scoped and Profile paths are loaded from the canonical store', () => {
    expect(groupPort).toContain(
      'findByIds(identityId: string, ids: string[]): Promise<ReminderGroup[]>;',
    );
    expect(templatePort).toContain('findByIds(');
    expect(prismaGroup).toContain('where: { id: { in: ids }, identityId }');
    expect(prismaTemplate).toContain('where: { id: { in: ids }, identityId }');
    expect(controlService).toContain('listMembershipsForRoutines({');
    expect(controlService).toContain('findProfilesByIds({ identityId, profileIds })');
    expect(mapper).toContain('profileMemberships = status.profileMemberships');
  });

  it('single ReminderTemplate -> Group ownership is physically absent from repository/query surfaces', () => {
    expect(templatePort).not.toContain('findByGroupId');
    expect(prismaTemplate).not.toContain('reminderGroupId');
    expect(powersyncTemplate).not.toContain('reminder_group_id');
    expect(listUseCase).not.toContain('groupId');
    expect(listUseCase).not.toContain('findByGroupId');
    expect(mapper).not.toMatch(/dto\.groupId\s*=/);
    expect(mapper).not.toMatch(/dto\.groupName\s*=/);
  });

  it('Profile operations use membership-aware domain paths', () => {
    expect(domainService).toContain('getTemplatesForProfile(');
    expect(domainService).toContain('listMembershipsForProfile({ identityId, profileId })');
    expect(domainService).toContain('updateGroupStats(identityId: string, profileId: string)');
    expect(groupApp).toContain('syncTemplatesEffectiveEnabledByProfile(ctx.identityId, id)');
    expect(groupApp).not.toContain('setProfileMembershipsEnabled(');
  });

  it('prisma/powersync hard delete and active queries preserve identity isolation', () => {
    expect(prismaTemplate).toContain('async delete(identityId: string, id: string)');
    expect(prismaTemplate).toContain(
      "throw new Error('Reminder template not found for the current identity.');",
    );
    expect(prismaGroup).toContain('async delete(identityId: string, id: string)');
    expect(powersyncTemplate).toContain(
      'DELETE FROM reminder_templates WHERE id = ? AND identity_id = ?',
    );
    expect(powersyncGroup).toContain(
      'DELETE FROM reminder_groups WHERE id = ? AND identity_id = ?',
    );
    expect(prismaTemplate).toContain('async findActive(\n    identityId: string,');
    expect(powersyncTemplate).toContain(
      "SELECT * FROM reminder_templates WHERE identity_id = ? AND self_enabled = 1 AND status = 'Active' AND deleted_at IS NULL ORDER BY created_at ASC",
    );
  });
});
