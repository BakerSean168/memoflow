import { randomUUID } from 'node:crypto';
import { ValueObject } from '@memoflow/utils/domain';
import type {
  ChecklistItemDefinition as IChecklistItemDefinition,
  ChecklistItemDefinitionDTO,
} from '@memoflow/contracts/task';

/** Plan-owned checklist definition. Per-occurrence completion lives on TaskOccurrence. */
export class ChecklistItemDefinition
  extends ValueObject<ChecklistItemDefinitionDTO>
  implements IChecklistItemDefinition
{
  private constructor(props: ChecklistItemDefinitionDTO) {
    super(props);
  }

  public static create(props: ChecklistItemDefinitionDTO): ChecklistItemDefinition {
    this.validate(props);
    return new ChecklistItemDefinition({ ...props, title: props.title.trim() });
  }

  public static of(
    title: string,
    order: number,
    id: string = randomUUID(),
  ): ChecklistItemDefinition {
    return ChecklistItemDefinition.create({ id, title, order });
  }

  public static fromDTO(dto: ChecklistItemDefinitionDTO): ChecklistItemDefinition {
    return ChecklistItemDefinition.create(dto);
  }

  public static fromTitles(titles: string[]): ChecklistItemDefinition[] {
    return titles.map((title, order) => ChecklistItemDefinition.of(title, order));
  }

  private static validate(props: ChecklistItemDefinitionDTO): void {
    if (!props.id || props.id.trim().length === 0) throw new Error('Checklist item ID is required');
    if (!props.title || props.title.trim().length === 0) throw new Error('Title cannot be empty');
    if (props.title.length > 200) throw new Error('Title too long (max 200 characters)');
    if (!Number.isInteger(props.order) || props.order < 0) {
      throw new Error('Order must be a non-negative integer');
    }
  }

  public get id(): string {
    return this.props.id;
  }

  public get title(): string {
    return this.props.title;
  }

  public get order(): number {
    return this.props.order;
  }

  public updateTitle(title: string): ChecklistItemDefinition {
    return ChecklistItemDefinition.create({ ...this.props, title });
  }

  public updateOrder(order: number): ChecklistItemDefinition {
    return ChecklistItemDefinition.create({ ...this.props, order });
  }

  public toDTO(): ChecklistItemDefinitionDTO {
    return { id: this.props.id, title: this.props.title, order: this.props.order };
  }
}
