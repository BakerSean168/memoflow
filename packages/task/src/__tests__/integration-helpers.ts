/**
 * Task integration helpers.
 *
 * Shared account/database helpers live in @memoflow/test-utils. Task-local
 * cleanup tracks only canonical vNext persistence; retired Folder/DAG tables
 * must never be reintroduced into integration setup.
 */
import { getPrisma } from '@memoflow/test-utils/setup/integration-helpers';

export {
  getPrisma,
  disconnectPrisma,
  cleanAll,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

/** Delete task-owned rows while preserving identity/account fixtures. */
export async function cleanTaskTables(): Promise<void> {
  const prisma = await getPrisma();
  await prisma.taskGoalOutbox.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.taskOccurrence.deleteMany();
  await prisma.taskPlanHistory.deleteMany();
  await prisma.taskPlan.deleteMany();
  await prisma.taskStatistic.deleteMany();
}
