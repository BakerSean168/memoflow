import type { Prisma } from '@memoflow/database';
import {
  createBusinessDataSummaryReader,
  type BusinessDataPresenceReaders,
} from '@memoflow/account';
import { createGoalBusinessDataPresence } from '@memoflow/goal';
import { createTaskBusinessDataPresence } from '@memoflow/task';
import { createLabelBusinessDataPresence } from '@memoflow/label';
import { createScheduleBusinessDataPresence } from '@memoflow/schedule';
import { createRoutineBusinessDataPresence } from '@memoflow/reminder/routine-runtime';
import { createRepositoryBusinessDataPresence } from '@memoflow/repository';
import { createAiBusinessDataPresence } from '@memoflow/ai';
import { createNotificationBusinessDataPresence } from '@memoflow/notification';
import { createRelationBusinessDataPresence } from '@memoflow/relation';

/** Bind all owner existence probes to the host's database or current transaction. */
export function composeBusinessDataSummary(db: Prisma.TransactionClient) {
  return createBusinessDataSummaryReader({
    goal: createGoalBusinessDataPresence(db),
    task: createTaskBusinessDataPresence(db),
    label: createLabelBusinessDataPresence(db),
    schedule: createScheduleBusinessDataPresence(db),
    routine: createRoutineBusinessDataPresence(db),
    repository: createRepositoryBusinessDataPresence(db),
    ai: createAiBusinessDataPresence(db),
    notification: createNotificationBusinessDataPresence(db),
    relation: createRelationBusinessDataPresence(db),
  } satisfies Required<BusinessDataPresenceReaders>);
}
