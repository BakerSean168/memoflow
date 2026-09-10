import {
  LabelColorSchema,
  type CreateLabelCommand,
  type DeleteLabelCommand,
  type LabelDto,
  type ListLabelsQuery,
  type UpdateLabelCommand,
} from '@memoflow/contracts/label';
import type { Clock } from '@memoflow/time';
import { normalizeLabelName, validateLabelName } from '../domain/label';
import type { LabelRepository } from '../domain/label-repository';

export interface LabelServiceOptions {
  readonly clock: Pick<Clock, 'now'>;
  readonly idFactory?: () => string;
}

export class LabelService {
  private readonly clock: Pick<Clock, 'now'>;
  private readonly idFactory: () => string;

  constructor(
    private readonly repository: LabelRepository,
    options: LabelServiceOptions,
  ) {
    this.clock = options.clock;
    this.idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  }

  async create(command: CreateLabelCommand): Promise<LabelDto> {
    const name = validateLabelName(command.name);
    const color = command.color == null ? null : LabelColorSchema.parse(command.color);
    const now = this.clock.now();
    return this.repository.create({
      id: this.idFactory(),
      identityId: command.identityId,
      name: name.name,
      normalizedName: name.normalizedName,
      color,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(command: UpdateLabelCommand): Promise<LabelDto> {
    const labelName = command.name === undefined ? undefined : validateLabelName(command.name);
    const color =
      command.color === undefined
        ? undefined
        : command.color === null
          ? null
          : LabelColorSchema.parse(command.color);
    const updated = await this.repository.update({
      identityId: command.identityId,
      labelId: command.labelId,
      ...(labelName ? { name: labelName.name, normalizedName: labelName.normalizedName } : {}),
      ...(color !== undefined ? { color } : {}),
      updatedAt: this.clock.now(),
    });
    if (!updated) throw new Error('Label not found.');
    return updated;
  }

  delete(command: DeleteLabelCommand): Promise<boolean> {
    return this.repository.delete(command.identityId, command.labelId);
  }

  list(query: ListLabelsQuery): Promise<LabelDto[]> {
    return this.repository.list({
      identityId: query.identityId,
      normalizedSearch: query.search ? normalizeLabelName(query.search) : null,
      limit: query.limit,
    });
  }

  /** Resolve human-readable names into replay-safe identity-owned canonical Label rows. */
  async resolveNames(identityId: string, names: readonly string[]): Promise<LabelDto[]> {
    const validated = names.map((name) => validateLabelName(name));
    const unique = new Map<string, { name: string; normalizedName: string }>();
    for (const item of validated) {
      if (!unique.has(item.normalizedName)) unique.set(item.normalizedName, item);
    }
    if (unique.size === 0) return [];

    const normalizedNames = [...unique.keys()];
    const existing = await this.repository.findByNormalizedNames(identityId, normalizedNames);
    const byNormalized = new Map(existing.map((label) => [label.normalizedName, label]));
    const resolved: LabelDto[] = [];

    for (const item of unique.values()) {
      let label = byNormalized.get(item.normalizedName);
      if (!label) {
        try {
          label = await this.create({ identityId, name: item.name });
        } catch (cause) {
          const afterRace = await this.repository.findByNormalizedNames(identityId, [
            item.normalizedName,
          ]);
          label = afterRace.find((candidate) => candidate.normalizedName === item.normalizedName);
          if (!label) throw cause;
        }
        byNormalized.set(item.normalizedName, label);
      }
      resolved.push(label);
    }

    return resolved;
  }
}
