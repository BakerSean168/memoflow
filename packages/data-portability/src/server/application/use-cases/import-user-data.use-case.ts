/**
 * Import User Data Use Case
 *
 * Validates an exported envelope, creates all entities with new IDs,
 * injects the current user's identityId, and returns a summary.
 *
 * Delegates per-module import logic to dedicated importers.
 */

import { newId } from '@memoflow/utils';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import type { DataPortabilityEventMap, ImportUserDataRes } from '@memoflow/contracts/data-portability';
import type { ImportContext, RefMap } from '../portable-runtime';
import { DataPortabilityEventTopics, parseUserDataExportEnvelope } from '@memoflow/contracts/data-portability';
import type { DataPortabilityImportStore } from '../import-store/data-portability-import-store';
import { importSettings, importNotificationPreference, importUserReminderPreference } from './importers/settings.importer';
import { importRepositories } from './importers/repository.importer';
import { importGoals } from './importers/goal.importer';
import { importTasks } from './importers/task.importer';
import { importReminders } from './importers/reminder.importer';
import { importSchedules } from './importers/schedule.importer';
import { importAI } from './importers/ai.importer';
import { throwValidationError } from './importers/import-helpers';

const logger = createLogger('ImportUserData');
const dataPortabilityEvents = createTypedEventPublisher<
  Pick<
    DataPortabilityEventMap,
    | typeof DataPortabilityEventTopics.IMPORT_DRY_RUN_VALIDATED
    | typeof DataPortabilityEventTopics.IMPORTED
  >
>(eventBus);

export class ImportUserDataUseCase {
  constructor(private readonly importStore: DataPortabilityImportStore) {}

  async execute(identityId: string, content: string, dryRun = false): Promise<ImportUserDataRes> {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throwValidationError('Invalid JSON content');
    }

    const parsed = parseUserDataExportEnvelope(raw);
    if (!parsed.ok) {
      throwValidationError(parsed.error);
    }

    const data = parsed.envelope.data;

    this.validateRefUniqueness(data as Record<string, unknown>);

    const batchId = newId();
    const refMap: RefMap = new Map();
    const ctx: ImportContext = {
      identityId,
      batchId,
      refMap,
      created: {},
      updatedSingletons: {},
      skipped: {},
      warnings: [],
    };

    if (dryRun) {
      this.validateRefs(data as Record<string, unknown>, ctx);
      const dryRunValidatedEvent: DataPortabilityEventMap[typeof DataPortabilityEventTopics.IMPORT_DRY_RUN_VALIDATED] = {
        identityId,
        batchId,
        created: {},
        updatedSingletons: {},
        skipped: {},
        warnings: ctx.warnings,
      };
      dataPortabilityEvents.send(
        DataPortabilityEventTopics.IMPORT_DRY_RUN_VALIDATED,
        dryRunValidatedEvent,
      );
      return { batchId, dryRun: true, created: {}, updatedSingletons: {}, skipped: {}, warnings: ctx.warnings };
    }

    await this.importStore.transaction(async (tx) => {
      // Singletons (upsert — overwrite current user's preferences)
      await importSettings(tx, ctx, data.settings);
      await importNotificationPreference(tx, ctx, data.notificationPreference);
      await importUserReminderPreference(tx, ctx, data.userReminderPreference);

      // Entity collections (append-create — always create new)
      if (data.repositories) await importRepositories(tx, ctx, data.repositories);
      if (data.goals) await importGoals(tx, ctx, data.goals);
      if (data.tasks) await importTasks(tx, ctx, data.tasks);
      if (data.reminders) await importReminders(tx, ctx, data.reminders);
      if (data.schedules) await importSchedules(tx, ctx, data.schedules);
      if (data.ai) await importAI(tx, ctx, data.ai);
    });

    logger.info('Import completed', { identityId, batchId, created: ctx.created, updatedSingletons: ctx.updatedSingletons });

    const importedEvent: DataPortabilityEventMap[typeof DataPortabilityEventTopics.IMPORTED] = {
      identityId,
      batchId,
      created: ctx.created,
      updatedSingletons: ctx.updatedSingletons,
      skipped: ctx.skipped,
      warnings: ctx.warnings,
    };
    dataPortabilityEvents.send(DataPortabilityEventTopics.IMPORTED, importedEvent);

    return {
      batchId,
      dryRun: false,
      created: ctx.created,
      updatedSingletons: ctx.updatedSingletons,
      skipped: ctx.skipped,
      warnings: ctx.warnings,
    };
  }

  // ============ Ref Validation ============

  private validateRefUniqueness(data: Record<string, unknown>): void {
    const seen = new Set<string>();
    const check = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object') return;
      const rec = obj as Record<string, unknown>;
      if (typeof rec._ref === 'string') {
        if (seen.has(rec._ref)) throwValidationError(`Duplicate _ref "${rec._ref}"`);
        seen.add(rec._ref);
      }
      for (const v of Object.values(rec)) {
        if (Array.isArray(v)) v.forEach(check);
        else if (v && typeof v === 'object') check(v);
      }
    };
    check(data);
  }

  private validateRefs(data: Record<string, unknown>, ctx: ImportContext): void {
    const allRefs = new Set<string>();
    const collect = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object') return;
      const rec = obj as Record<string, unknown>;
      if (typeof rec._ref === 'string') allRefs.add(rec._ref);
      for (const v of Object.values(rec)) {
        if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === 'object') collect(v);
      }
    };
    collect(data);

    const check = (obj: unknown): void => {
      if (!obj || typeof obj !== 'object') return;
      const rec = obj as Record<string, unknown>;
      for (const [key, value] of Object.entries(rec)) {
        if (key.endsWith('Ref') && typeof value === 'string' && !allRefs.has(value)) {
          ctx.warnings.push(`Reference "${value}" in field "${key}" not found in data`);
        }
        if (Array.isArray(value)) value.forEach(check);
        else if (value && typeof value === 'object') check(value);
      }
    };
    check(data);
  }
}
