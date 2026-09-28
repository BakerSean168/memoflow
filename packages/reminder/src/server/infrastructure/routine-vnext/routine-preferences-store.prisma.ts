import type { PrismaClient } from '@memoflow/database';
import type { RoutinePreferencesStore } from '../../domain/ports';
import { RoutinePreferences } from '../../domain/routine';

export class PrismaRoutinePreferencesStore implements RoutinePreferencesStore {
  constructor(private readonly prisma: PrismaClient) {}

  async find(input: { readonly identityId: string }): Promise<RoutinePreferences | null> {
    const row = await this.prisma.routinePreference.findUnique({
      where: { identityId: input.identityId },
    });
    return row
      ? RoutinePreferences.load({
          id: row.id,
          identityId: row.identityId,
          globalEnabled: row.globalEnabled,
          version: row.version,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
      : null;
  }

  async create(input: { readonly preferences: RoutinePreferences }): Promise<void> {
    const state = input.preferences.snapshot();
    await this.prisma.routinePreference.create({
      data: {
        id: state.id,
        identityId: state.identityId,
        globalEnabled: state.globalEnabled,
        version: state.version,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
    });
  }

  async update(input: {
    readonly preferences: RoutinePreferences;
    readonly expectedVersion: number;
  }): Promise<void> {
    const state = input.preferences.snapshot();
    const result = await this.prisma.routinePreference.updateMany({
      where: {
        identityId: state.identityId,
        version: input.expectedVersion,
      },
      data: {
        globalEnabled: state.globalEnabled,
        version: state.version,
        updatedAt: state.updatedAt,
      },
    });
    if (result.count !== 1) {
      throw new Error('Routine preferences version conflict');
    }
  }
}
