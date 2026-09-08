/**
 * Prisma Adapters for Data Portability
 * 数据可移植性 Prisma 适配器。
 *
 * Direct Prisma queries for modules that don't export repository factories.
 * These implement the dependency interfaces used by the export use case.
 *
 * 对未提供仓储工厂的模块执行直接 Prisma 查询，
 * 实现导出 use case 所需的依赖接口。
 */

import type { PrismaClient } from '@memoflow/database';
import type {
  RepositoryRepoPort,
  ResourceFolderRepoPort,
  ResourceRepoPort,
  ScheduleRepoPort,
  ScheduleTaskRepoPort,
  EditorWorkspaceRepoPort,
  EditorSessionRepoPort,
  EditorGroupRepoPort,
  EditorTabRepoPort,
  AIConversationRepoPort,
  RoutineProfileMembershipRepoPort,
  RoutineDefinitionRepoPort,
} from '../../application/data-portability.dependencies';

export class PrismaRepositoryAdapter implements RepositoryRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.repository.findMany({ where: { identityId, deletedAt: null } });
  }
}

export class PrismaFolderAdapter implements ResourceFolderRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByRepositoryId(repositoryId: string): Promise<unknown[]> {
    return this.prisma.folder.findMany({ where: { repositoryId }, orderBy: { path: 'asc' } });
  }
}

export class PrismaResourceAdapter implements ResourceRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.resource.findMany({ where: { identityId, deletedAt: null } });
  }
}

export class PrismaRoutineDefinitionAdapter implements RoutineDefinitionRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.routineDefinition.findMany({
      where: { identityId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class PrismaRoutineProfileMembershipAdapter implements RoutineProfileMembershipRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.routineProfileMembership.findMany({
      where: { identityId },
      orderBy: [{ routineId: 'asc' }, { profileId: 'asc' }],
    });
  }
}

export class PrismaScheduleAdapter implements ScheduleRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.schedule.findMany({ where: { identityId } });
  }
}

export class PrismaScheduleTaskAdapter implements ScheduleTaskRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.scheduleTask.findMany({ where: { identityId, deletedAt: null } });
  }
}

export class PrismaEditorWorkspaceAdapter implements EditorWorkspaceRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    return this.prisma.editorWorkspace.findMany({ where: { identityId, deletedAt: null } });
  }
}

export class PrismaEditorSessionAdapter implements EditorSessionRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByWorkspaceId(workspaceId: string): Promise<unknown[]> {
    return this.prisma.editorWorkspaceSession.findMany({ where: { workspaceId, deletedAt: null } });
  }
}

export class PrismaEditorGroupAdapter implements EditorGroupRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findBySessionId(sessionId: string): Promise<unknown[]> {
    return this.prisma.editorWorkspaceSessionGroup.findMany({ where: { sessionId, deletedAt: null } });
  }
}

export class PrismaEditorTabAdapter implements EditorTabRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByGroupId(groupId: string): Promise<unknown[]> {
    return this.prisma.editorWorkspaceSessionGroupTab.findMany({ where: { groupId, deletedAt: null } });
  }
}

export class PrismaAIConversationAdapter implements AIConversationRepoPort {
  constructor(private readonly prisma: PrismaClient) {}
  async findByIdentityId(identityId: string, options?: { includeChildren?: boolean }): Promise<unknown[]> {
    return this.prisma.aiConversation.findMany({
      where: { identityId, deletedAt: null },
      include: options?.includeChildren ? { messages: { orderBy: { createdAt: 'asc' } } } : undefined,
    });
  }
}
