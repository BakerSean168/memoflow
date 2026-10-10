import { createHash } from 'node:crypto';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import {
  AgentInstanceSchema,
  AgentInstanceModelBindingSchema,
  type AgentInstance,
  type AgentInstanceModelBinding,
  type AgentRegistrySnapshot,
  type LocalAgentConnection,
} from '@memoflow/contracts/ai';
import {
  AgentRegistryError,
  type IAgentInstanceRepository,
} from '../../../application/agent-instance/agent-instance.repository';
import { LocalAgentRepository } from './local-agent.repository';

const recordRow = (value: unknown): string => {
  if (
    !value ||
    typeof value !== 'object' ||
    !('record_json' in value) ||
    typeof value.record_json !== 'string'
  )
    throw new AgentRegistryError('VALIDATION_ERROR');
  return value.record_json;
};
function key(owner: string, id: string, extra = ''): string {
  return createHash('sha256')
    .update(JSON.stringify([owner, id, extra]))
    .digest('hex');
}
function fromLegacy(connection: LocalAgentConnection): AgentInstance {
  return AgentInstanceSchema.parse({
    instanceId:
      connection.instanceSlug === `${connection.driver}-default`
        ? connection.driver
        : (connection.instanceSlug ?? connection.driver + '-' + connection.id.replace(/-/gu, '')),
    driver: connection.driver,
    name: connection.name,
    accentColor: connection.accentColor ?? '#6469da',
    enabled: connection.enabled,
    nativeConfig: {
      executablePath: connection.executablePath,
      ...(connection.homePath ? { homePath: connection.homePath } : {}),
      writeScopes: connection.writeScopes,
    },
    legacyConnectionId: connection.id,
    revision: connection.revision,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  });
}

/** Owner-bound Profile-local Registry; legacy native UUIDs remain usable by old conversations. */
export class AgentInstancePowerSyncRepository implements IAgentInstanceRepository {
  private readonly local: LocalAgentRepository;
  constructor(private readonly db: IElectronDatabase) {
    this.local = new LocalAgentRepository(db);
  }
  async list(owner: string): Promise<AgentRegistrySnapshot> {
    const [rows, bindingRows, legacy] = await Promise.all([
      this.db.getAll<unknown>(
        'SELECT record_json FROM ai_agent_instances WHERE identity_id = ? ORDER BY id',
        [owner],
      ),
      this.db.getAll<unknown>(
        'SELECT record_json FROM ai_agent_instance_bindings WHERE identity_id = ? ORDER BY id',
        [owner],
      ),
      this.local.listConnections(owner),
    ]);
    const instances = rows.map((row) => AgentInstanceSchema.parse(JSON.parse(recordRow(row))));
    const existing = new Set(instances.map((record) => record.instanceId));
    for (const connection of legacy) {
      const projected = fromLegacy(connection);
      if (!existing.has(projected.instanceId)) instances.push(projected);
    }
    return {
      instances,
      bindings: bindingRows.map((row) =>
        AgentInstanceModelBindingSchema.parse(JSON.parse(recordRow(row))),
      ),
    };
  }
  async create(owner: string, instance: AgentInstance): Promise<AgentInstance> {
    const record = AgentInstanceSchema.parse(instance);
    if (record.driver !== 'mastra') {
      const existing = await this.list(owner);
      if (existing.instances.some((item) => item.instanceId === record.instanceId))
        throw new AgentRegistryError('CONFLICT');
      const native = await this.local.createConnection(owner, {
        driver: record.driver,
        name: record.name,
        enabled: record.enabled,
        instanceSlug: record.instanceId,
        accentColor: record.accentColor,
        executablePath: record.nativeConfig?.executablePath ?? record.driver,
        homePath: record.nativeConfig?.homePath,
        writeScopes: record.nativeConfig?.writeScopes ?? [],
      });
      return fromLegacy(native);
    }
    return this.db.writeTransaction(async (tx) => {
      const previous = await tx.getOptional(
        'SELECT id FROM ai_agent_instances WHERE id = ? AND identity_id = ?',
        [key(owner, record.instanceId), owner],
      );
      if (previous) throw new AgentRegistryError('CONFLICT');
      const existsLegacy = await this.local.listConnections(owner);
      if (existsLegacy.some((value) => fromLegacy(value).instanceId === record.instanceId))
        throw new AgentRegistryError('CONFLICT');
      await tx.execute(
        'INSERT INTO ai_agent_instances (id, identity_id, record_json) VALUES (?, ?, ?)',
        [key(owner, record.instanceId), owner, JSON.stringify(record)],
      );
      return record;
    });
  }
  async replace(
    owner: string,
    instance: AgentInstance,
    expectedRevision: number,
  ): Promise<AgentInstance> {
    const record = AgentInstanceSchema.parse(instance);
    if (record.legacyConnectionId) {
      const prior = await this.local.getConnection(owner, record.legacyConnectionId);
      if (prior.driver !== record.driver || prior.revision !== expectedRevision)
        throw new AgentRegistryError('CONFLICT');
      const next = await this.local.updateConnection(owner, prior.id, prior.revision, {
        driver: prior.driver,
        name: record.name,
        enabled: record.enabled,
        executablePath: record.nativeConfig?.executablePath ?? prior.executablePath,
        homePath: record.nativeConfig?.homePath ?? prior.homePath,
        writeScopes: record.nativeConfig?.writeScopes ?? prior.writeScopes,
        instanceSlug: prior.instanceSlug,
        accentColor: record.accentColor,
      });
      return fromLegacy(next);
    }
    return this.db.writeTransaction(async (tx) => {
      const previous = await this.getSaved(tx, owner, record.instanceId);
      if (!previous) {
        if (expectedRevision !== 0 || record.instanceId !== record.driver)
          throw new AgentRegistryError('NOT_FOUND');
        await tx.execute(
          'INSERT INTO ai_agent_instances (id, identity_id, record_json) VALUES (?, ?, ?)',
          [key(owner, record.instanceId), owner, JSON.stringify(record)],
        );
        return record;
      }
      if (previous.revision !== expectedRevision || previous.driver !== record.driver)
        throw new AgentRegistryError('CONFLICT');
      await tx.execute(
        'UPDATE ai_agent_instances SET record_json = ? WHERE id = ? AND identity_id = ?',
        [JSON.stringify(record), key(owner, record.instanceId), owner],
      );
      return record;
    });
  }
  async remove(owner: string, instanceId: string, expectedRevision: number): Promise<void> {
    await this.db.writeTransaction(async (tx) => {
      const prior = await this.getSaved(tx, owner, instanceId);
      if (!prior) throw new AgentRegistryError('NOT_FOUND');
      if (prior.revision !== expectedRevision) throw new AgentRegistryError('CONFLICT');
      await tx.execute(
        'DELETE FROM ai_agent_instance_bindings WHERE identity_id = ? AND instance_id = ?',
        [owner, instanceId],
      );
      await tx.execute('DELETE FROM ai_agent_instances WHERE id = ? AND identity_id = ?', [
        key(owner, instanceId),
        owner,
      ]);
    });
  }
  async hasConversationBindings(owner: string, instanceId: string): Promise<boolean> {
    return Boolean(
      await this.db.getOptional(
        'SELECT id FROM ai_agent_conversation_bindings WHERE identity_id = ? AND instance_id = ? LIMIT 1',
        [owner, instanceId],
      ),
    );
  }
  async getConversationInstance(owner: string, conversationId: string): Promise<string | null> {
    const row = await this.db.getOptional<{ instance_id: string }>(
      'SELECT instance_id FROM ai_agent_conversation_bindings WHERE id = ? AND identity_id = ?',
      [key(owner, conversationId), owner],
    );
    return row?.instance_id ?? null;
  }
  async claimConversationInstance(
    owner: string,
    conversationId: string,
    instanceId: string,
  ): Promise<void> {
    await this.db.writeTransaction(async (tx) => {
      await tx.execute(
        'INSERT OR IGNORE INTO ai_agent_conversation_bindings (id, identity_id, conversation_id, instance_id) VALUES (?, ?, ?, ?)',
        [key(owner, conversationId), owner, conversationId, instanceId],
      );
      const row = await tx.getOptional<{ instance_id: string }>(
        'SELECT instance_id FROM ai_agent_conversation_bindings WHERE id = ? AND identity_id = ?',
        [key(owner, conversationId), owner],
      );
      if (row?.instance_id !== instanceId) throw new AgentRegistryError('CONFLICT');
    });
  }
  async hasConnectionBindings(owner: string, connectionId: string): Promise<boolean> {
    return Boolean(
      await this.db.getOptional(
        'SELECT id FROM ai_agent_instance_bindings WHERE identity_id = ? AND connection_id = ? LIMIT 1',
        [owner, connectionId],
      ),
    );
  }
  async bind(
    owner: string,
    instance: AgentInstance,
    expectedRevision: number,
    binding: AgentInstanceModelBinding,
    remove: boolean,
  ): Promise<AgentInstance> {
    const next = AgentInstanceSchema.parse(instance);
    return this.db.writeTransaction(async (tx) => {
      const prior = await this.getSaved(tx, owner, next.instanceId);
      if (!prior && (expectedRevision !== 0 || next.instanceId !== 'mastra'))
        throw new AgentRegistryError('NOT_FOUND');
      if (prior && prior.revision !== expectedRevision) throw new AgentRegistryError('CONFLICT');
      if (next.driver !== 'mastra') throw new AgentRegistryError('VALIDATION_ERROR');
      if (!remove) {
        const connection = await tx.getOptional<{
          default_model: string | null;
          available_models: string | null;
        }>(
          'SELECT default_model, available_models FROM ai_provider_configs WHERE id = ? AND identity_id = ? AND deleted_at IS NULL AND is_active = 1',
          [binding.connectionId, owner],
        );
        if (!connection) throw new AgentRegistryError('NOT_FOUND');
        const models: Array<{ id: string }> = connection.available_models
          ? JSON.parse(connection.available_models)
          : [];
        if (
          binding.modelId !== connection.default_model &&
          !models.some((model) => model.id === binding.modelId)
        )
          throw new AgentRegistryError('VALIDATION_ERROR');
      }
      if (prior) {
        await tx.execute(
          'UPDATE ai_agent_instances SET record_json = ? WHERE id = ? AND identity_id = ?',
          [JSON.stringify(next), key(owner, next.instanceId), owner],
        );
      } else {
        await tx.execute(
          'INSERT INTO ai_agent_instances (id, identity_id, record_json) VALUES (?, ?, ?)',
          [key(owner, next.instanceId), owner, JSON.stringify(next)],
        );
      }
      if (remove) {
        await tx.execute(
          'DELETE FROM ai_agent_instance_bindings WHERE id = ? AND identity_id = ?',
          [key(owner, binding.instanceId, binding.connectionId), owner],
        );
      } else {
        const parsed = AgentInstanceModelBindingSchema.parse(binding);
        await tx.execute(
          'INSERT OR REPLACE INTO ai_agent_instance_bindings (id, identity_id, instance_id, connection_id, record_json) VALUES (?, ?, ?, ?, ?)',
          [
            key(owner, parsed.instanceId, parsed.connectionId),
            owner,
            parsed.instanceId,
            parsed.connectionId,
            JSON.stringify(parsed),
          ],
        );
      }
      return next;
    });
  }
  private async getSaved(
    tx: IElectronDatabaseTransaction,
    owner: string,
    id: string,
  ): Promise<AgentInstance | null> {
    const row = await tx.getOptional<unknown>(
      'SELECT record_json FROM ai_agent_instances WHERE id = ? AND identity_id = ?',
      [key(owner, id), owner],
    );
    return row ? AgentInstanceSchema.parse(JSON.parse(recordRow(row))) : null;
  }
}
