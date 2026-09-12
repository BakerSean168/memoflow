export type {
  LabelDto,
  LabelColor,
  CreateLabelCommand,
  UpdateLabelCommand,
  DeleteLabelCommand,
  ListLabelsQuery,
} from '@memoflow/contracts/label';
export { LabelColorSchema } from '@memoflow/contracts/label';
export { normalizeLabelName, validateLabelName, normalizeLabelColor } from './domain/label';
export type { LabelRecord, NewLabelRecord } from './domain/label';
export type { LabelListOptions, LabelRepository } from './domain/label-repository';
export { LabelService, type LabelServiceOptions } from './application/label-service';
export { PrismaLabelRepository } from './infrastructure/prisma/prisma-label.repository';
export { PowerSyncLabelRepository } from './infrastructure/powersync/powersync-label.repository';
