import type { IdentityId, TaskPlanId } from '../../../../primitives';

export interface TaskOccurrencesGeneratedEvent {
  identityId: IdentityId;
  templateId: TaskPlanId;
  templateTitle: string;
  instanceCount: number;
  strategy: 'full' | 'summary';
}
