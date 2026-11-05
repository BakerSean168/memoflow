import { join } from 'node:path';
import { createRuntimePermissionAcceptance } from '@memoflow/ai/testing';

export function createAcceptanceRuntime() {
  return createRuntimePermissionAcceptance(join(import.meta.dirname, 'native-agent.cjs'));
}
