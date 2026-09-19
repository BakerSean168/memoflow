import type { PrismaClient } from '@memoflow/database';
import type { INotificationPreferenceRepository } from '../../../domain';
import { NotificationPreference } from '../../../domain/aggregates/notification-preference';
import { NotificationPreferencePrismaMapper } from './mappers/notification-preference-prisma.mapper';

export class NotificationPreferencePrismaRepository implements INotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(preference: NotificationPreference): Promise<void> {
    const { dto, globalChannels, workflowOverrides, quietHours } =
      NotificationPreferencePrismaMapper.toPersistence(preference);
    await this.prisma.notificationPreference.upsert({
      where: { identityId: String(dto.identityId) },
      create: {
        id: String(dto.id),
        identityId: String(dto.identityId),
        globalChannels,
        workflowOverrides,
        quietHours,
        version: dto.version,
        deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
      },
      update: {
        globalChannels,
        workflowOverrides,
        quietHours,
        version: dto.version,
        deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
      },
    });
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<NotificationPreference | null> {
    const row = await this.prisma.notificationPreference.findFirst({ where: { id, identityId } });
    return row ? NotificationPreferencePrismaMapper.toDomain(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<NotificationPreference | null> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { identityId } });
    return row ? NotificationPreferencePrismaMapper.toDomain(row) : null;
  }

  async delete(identityId: string, id: string): Promise<void> {
    const result = await this.prisma.notificationPreference.deleteMany({ where: { id, identityId } });
    if (result.count === 0) throw new Error('Notification preference not found for the current identity.');
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    return (await this.prisma.notificationPreference.count({ where: { id, identityId } })) > 0;
  }

  async existsForIdentity(identityId: string): Promise<boolean> {
    return (await this.prisma.notificationPreference.count({ where: { identityId } })) > 0;
  }

  async getOrCreate(identityId: string): Promise<NotificationPreference> {
    const existing = await this.findByIdentityId(identityId);
    if (existing) return existing;
    const preference = NotificationPreference.create({ identityId: identityId as never });
    await this.save(preference);
    return preference;
  }
}
