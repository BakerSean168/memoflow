import { prisma } from '@memoflow/database';
import { createTaskPrismaModule } from '@memoflow/task';
import { TASK_TEST_USER_TIME_CONTEXT_PORT } from '@memoflow/task/testing';

const [, , taskOccurrenceId, identityId] = process.argv;

if (!taskOccurrenceId || !identityId) {
  throw new Error('taskOccurrenceId and identityId are required');
}

const taskModule = createTaskPrismaModule(prisma, {
  userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
});
const result = await taskModule.api.completeTaskOccurrence(taskOccurrenceId, identityId);

if (!result.ok) {
  throw new Error(`${result.error.code}: ${result.error.message}`);
}

process.stdout.write('TASK_COMMITTED\n');
// Deliberately skip normal host disposal and database disconnect. This leaves
// only committed database state available to the replacement host.
process.exit(0);
