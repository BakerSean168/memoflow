/**
 * Canonical scheduling identity builders live in the neutral contract seam.
 * Keep this compatibility re-export so existing scheduler infrastructure imports
 * do not become a second implementation.
 */
export { buildSchedulingKey, buildSchedulingOwnerKey } from '@memoflow/contracts/schedule';
