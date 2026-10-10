import type { Prisma, PrismaClient, AiAgentInstance as PrismaAgent } from '@memoflow/database';
import {
  AgentConversationSelectionSchema,
  type AgentConversationSelection,
  AgentInstanceSchema,
  AgentInstanceModelBindingSchema,
  type AgentInstance,
  type AgentInstanceModelBinding,
  type AgentRegistrySnapshot,
} from '@memoflow/contracts/ai';
import {
  AgentRegistryError,
  type IAgentInstanceRepository,
} from '../../../application/agent-instance/agent-instance.repository';

const webDriver = 'mastra';

function assertMastra(instance: AgentInstance): void {
  if (instance.driver !== webDriver || instance.nativeConfig || instance.legacyConnectionId)
    throw new AgentRegistryError('FORBIDDEN');
}

function fromRow(row: PrismaAgent): AgentInstance {
  return AgentInstanceSchema.parse({
    instanceId: row.instanceId,
    driver: row.driver,
    name: row.name,
    accentColor: row.accentColor ?? '#6469da',
    enabled: row.enabled,
    revision: row.revision,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

async function checkedConnection(
  tx: Prisma.TransactionClient,
  owner: string,
  connectionId: string,
  modelId: string,
): Promise<void> {
  const connection = await tx.aiProviderConfig.findFirst({
    where: { id: connectionId, identityId: owner, deletedAt: null, isActive: true },
    select: { defaultModel: true, availableModels: true },
  });
  if (!connection) throw new AgentRegistryError('NOT_FOUND');
  let available: unknown;
  try {
    available = JSON.parse(connection.availableModels);
  } catch {
    throw new AgentRegistryError('VALIDATION_ERROR');
  }
  if (
    connection.defaultModel !== modelId &&
    (!Array.isArray(available) ||
      !available.some(
        (entry) => entry && typeof entry === 'object' && 'id' in entry && entry.id === modelId,
      ))
  )
    throw new AgentRegistryError('VALIDATION_ERROR');
}

/** PostgreSQL owner-scoped Agent Registry. The existing ProviderSecretVault is never queried for writes. */
export class AgentInstancePrismaRepository implements IAgentInstanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(owner: string): Promise<AgentRegistrySnapshot> {
    const [instances, bindings] = await Promise.all([
      this.prisma.aiAgentInstance.findMany({
        where: { identityId: owner },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.aiAgentInstanceBinding.findMany({ where: { identityId: owner } }),
    ]);
    return {
      instances: instances.map(fromRow),
      bindings: bindings.map((binding) =>
        AgentInstanceModelBindingSchema.parse({
          instanceId: binding.instanceId,
          connectionId: binding.connectionId,
          modelId: binding.modelId,
        }),
      ),
    };
  }

  async create(owner: string, instance: AgentInstance): Promise<AgentInstance> {
    const parsed = AgentInstanceSchema.parse(instance);
    assertMastra(parsed);
    try {
      const row = await this.prisma.aiAgentInstance.create({
        data: {
          identityId: owner,
          instanceId: parsed.instanceId,
          driver: parsed.driver,
          name: parsed.name,
          accentColor: parsed.accentColor,
          enabled: parsed.enabled,
          revision: parsed.revision,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
        },
      });
      return fromRow(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AgentRegistryError('CONFLICT');
      throw error;
    }
  }

  async replace(
    owner: string,
    instance: AgentInstance,
    expectedRevision: number,
  ): Promise<AgentInstance> {
    const parsed = AgentInstanceSchema.parse(instance);
    assertMastra(parsed);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const record = await tx.aiAgentInstance.findUnique({
          where: { identityId_instanceId: { identityId: owner, instanceId: parsed.instanceId } },
        });
        if (!record && expectedRevision === 0 && parsed.instanceId === 'mastra') {
          return fromRow(
            await tx.aiAgentInstance.create({
              data: {
                identityId: owner,
                instanceId: 'mastra',
                driver: 'mastra',
                name: parsed.name,
                accentColor: parsed.accentColor,
                enabled: parsed.enabled,
                revision: 1,
              },
            }),
          );
        }
        if (!record) throw new AgentRegistryError('NOT_FOUND');
        if (record.revision !== expectedRevision) throw new AgentRegistryError('CONFLICT');
        const updated = await tx.aiAgentInstance.updateMany({
          where: { identityId: owner, instanceId: parsed.instanceId, revision: expectedRevision },
          data: {
            name: parsed.name,
            accentColor: parsed.accentColor,
            enabled: parsed.enabled,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new AgentRegistryError('CONFLICT');
        const row = await tx.aiAgentInstance.findUniqueOrThrow({
          where: { identityId_instanceId: { identityId: owner, instanceId: parsed.instanceId } },
        });
        return fromRow(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AgentRegistryError('CONFLICT');
      throw error;
    }
  }

  async remove(owner: string, instanceId: string, expectedRevision: number): Promise<void> {
    try {
      const deleted = await this.prisma.aiAgentInstance.deleteMany({
        where: { identityId: owner, instanceId, revision: expectedRevision },
      });
      if (deleted.count !== 1) throw new AgentRegistryError('CONFLICT');
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'P2003')
        throw new AgentRegistryError('CONFLICT');
      throw cause;
    }
  }

  async hasConversationBindings(owner: string, instanceId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.aiAgentConversationBinding.findFirst({
        where: { identityId: owner, instanceId },
        select: { id: true },
      }),
    );
  }
  async getConversationInstance(owner: string, conversationId: string): Promise<string | null> {
    const row = await this.prisma.aiAgentConversationBinding.findUnique({
      where: { identityId_conversationId: { identityId: owner, conversationId } },
      select: { instanceId: true },
    });
    return row?.instanceId ?? null;
  }
  async getConversationSelection(
    owner: string,
    conversationId: string,
  ): Promise<AgentConversationSelection | null> {
    const row = await this.prisma.aiAgentConversationBinding.findUnique({
      where: { identityId_conversationId: { identityId: owner, conversationId } },
      select: { instanceId: true, providerId: true, modelId: true },
    });
    return row
      ? AgentConversationSelectionSchema.parse({
          agentInstanceId: row.instanceId,
          providerId: row.providerId,
          modelId: row.modelId,
        })
      : null;
  }
  async claimConversationInstance(
    owner: string,
    conversationId: string,
    instanceId: string,
    providerId?: string,
    modelId?: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.aiAgentConversationBinding.upsert({
          where: { identityId_conversationId: { identityId: owner, conversationId } },
          create: { identityId: owner, conversationId, instanceId },
          update: {},
        });
        if (row.instanceId !== instanceId) throw new AgentRegistryError('CONFLICT');
        if (providerId && modelId)
          await tx.aiAgentConversationBinding.update({
            where: { id: row.id },
            data: { providerId, modelId },
          });
      });
    } catch (cause) {
      if (isUniqueViolation(cause)) {
        const claimed = await this.getConversationInstance(owner, conversationId);
        if (claimed === instanceId) {
          if (providerId && modelId) {
            const updated = await this.prisma.aiAgentConversationBinding.updateMany({
              where: { identityId: owner, conversationId, instanceId },
              data: { providerId, modelId },
            });
            if (updated.count !== 1) throw new AgentRegistryError('CONFLICT');
          }
          return;
        }
        throw new AgentRegistryError('CONFLICT');
      }
      throw cause;
    }
  }
  async hasConnectionBindings(owner: string, connectionId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.aiAgentInstanceBinding.findFirst({
        where: { identityId: owner, connectionId },
        select: { id: true },
      }),
    );
  }

  async bind(
    owner: string,
    instance: AgentInstance,
    expectedRevision: number,
    binding: AgentInstanceModelBinding,
    remove: boolean,
  ): Promise<AgentInstance> {
    const parsed = AgentInstanceSchema.parse(instance);
    const parsedBinding = remove ? binding : AgentInstanceModelBindingSchema.parse(binding);
    assertMastra(parsed);
    if (parsedBinding.instanceId !== parsed.instanceId)
      throw new AgentRegistryError('VALIDATION_ERROR');
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!remove)
          await checkedConnection(tx, owner, parsedBinding.connectionId, parsedBinding.modelId);
        const record = await tx.aiAgentInstance.findUnique({
          where: { identityId_instanceId: { identityId: owner, instanceId: parsed.instanceId } },
        });
        if (!record) {
          if (expectedRevision !== 0 || parsed.instanceId !== 'mastra')
            throw new AgentRegistryError('NOT_FOUND');
          await tx.aiAgentInstance.create({
            data: {
              identityId: owner,
              instanceId: 'mastra',
              driver: 'mastra',
              name: parsed.name,
              accentColor: parsed.accentColor,
              enabled: parsed.enabled,
            },
          });
        } else if (record.revision !== expectedRevision) {
          throw new AgentRegistryError('CONFLICT');
        } else {
          const modified = await tx.aiAgentInstance.updateMany({
            where: { identityId: owner, instanceId: parsed.instanceId, revision: expectedRevision },
            data: { revision: { increment: 1 } },
          });
          if (modified.count !== 1) throw new AgentRegistryError('CONFLICT');
        }
        if (remove) {
          await tx.aiAgentInstanceBinding.deleteMany({
            where: {
              identityId: owner,
              instanceId: parsed.instanceId,
              connectionId: parsedBinding.connectionId,
            },
          });
        } else {
          await tx.aiAgentInstanceBinding.upsert({
            where: {
              identityId_instanceId_connectionId: {
                identityId: owner,
                instanceId: parsed.instanceId,
                connectionId: parsedBinding.connectionId,
              },
            },
            create: {
              identityId: owner,
              instanceId: parsed.instanceId,
              connectionId: parsedBinding.connectionId,
              modelId: parsedBinding.modelId,
            },
            update: { modelId: parsedBinding.modelId },
          });
        }
        return fromRow(
          await tx.aiAgentInstance.findUniqueOrThrow({
            where: { identityId_instanceId: { identityId: owner, instanceId: parsed.instanceId } },
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AgentRegistryError('CONFLICT');
      throw error;
    }
  }
}
