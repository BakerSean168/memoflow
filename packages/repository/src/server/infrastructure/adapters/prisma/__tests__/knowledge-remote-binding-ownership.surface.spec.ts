import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('knowledge remote binding ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../application/ports/knowledge-remote-binding.repositories.ts'),
    'utf8',
  );
  const prisma = readFileSync(
    resolve(__dirname, '../knowledge-remote-binding-prisma.repositories.ts'),
    'utf8',
  );
  const service = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/knowledge-repository-connection.service.ts',
    ),
    'utf8',
  );
  const projectionService = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/knowledge-repository-projection.service.ts',
    ),
    'utf8',
  );

  it('binding lifecycle exposes only identity-scoped disconnect rather than provider status mutation', () => {
    expect(port).toMatch(
      /markDisconnected\(identityId: string, id: string, disconnectedAt: number\): Promise<boolean>/,
    );
    expect(port).not.toContain('updateStatus');
  });

  it('authenticated reads require id + identityId', () => {
    expect(port).toMatch(/findByIdForIdentity\([\s\S]*?identityId: string,[\s\S]*?id: string/);
    expect(prisma).toContain('findFirst({ where: { id, identityId } })');
  });

  it('prisma disconnect filters by id + identityId + active lifecycle', () => {
    expect(prisma).toContain('where: { id, identityId, disconnectedAt: null }');
    expect(prisma).toContain('disconnectedAt: new Date(disconnectedAt)');
    expect(prisma).not.toContain('knowledgeRepositoryConnection');
  });

  it('save refuses identity reassignment and never rewrites identityId on update', () => {
    expect(prisma).toContain('existing.identityId !== binding.identityId');
    expect(prisma).toContain(
      "throw new Error('Knowledge remote binding not found for the current identity.');",
    );
    expect(prisma).toMatch(/where: \{ id: binding\.id, identityId: binding\.identityId \}/);
    const updateSection = prisma.slice(prisma.indexOf('const updated ='));
    const dataStart = updateSection.indexOf('data: {');
    const dataEnd = updateSection.indexOf('});', dataStart);
    const updateData = updateSection.slice(dataStart, dataEnd);
    expect(updateData).not.toContain('identityId:');
  });

  it('connection service uses authenticated binding reads and never mutates provider state into binding lifecycle', () => {
    expect(service).toContain('findByIdForIdentity(identityId, bindingId)');
    expect(service).toContain('observationRepository.save(');
    expect(service).toContain('historyFenceRepository.save(');
    expect(service).not.toContain('.updateStatus(');
  });

  it('ordinary list is provider-I/O free', () => {
    const start = service.indexOf('async list(identityId: string)');
    const end = service.indexOf('async refreshObservation(', start);
    const listBody = service.slice(start, end);
    expect(listBody).toContain('bindingRepository.findByIdentityId(identityId)');
    expect(listBody).toContain('observationRepository.findByBindingIds');
    expect(listBody).not.toContain('githubAppClient');
    expect(listBody).not.toContain('.save(');
  });

  it('projection bootstrap may bare-load a binding only to re-own it by identity', () => {
    expect(projectionService).toContain('private async loadOwnedConnectionById(');
    expect(projectionService).toContain(
      'const connection = await this.options.connectionRepository.findById(connectionId);',
    );
    expect(projectionService).toContain(
      'return this.options.connectionRepository.findByIdForIdentity(',
    );
    expect(projectionService.match(/connectionRepository\.findById\(/g)).toHaveLength(1);
  });
});
