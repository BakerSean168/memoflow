import path from 'node:path';
import { LocalProfileIdSchema } from './profile-cleanup';
import { writeProfileDurableFile } from './profile-durable-file';

export async function markProfileImportOpportunity(
  rootDir: string,
  targetProfileId: string,
  sourceProfileId: string | null,
) {
  LocalProfileIdSchema.parse(targetProfileId);
  if (sourceProfileId !== null) LocalProfileIdSchema.parse(sourceProfileId);
  await writeProfileDurableFile(
    path.join(rootDir, 'shared', 'profiles', 'import-prompts', `${targetProfileId}.json`),
    JSON.stringify({ sourceProfileId, consumed: false }),
  );
}
