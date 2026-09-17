import { ValueObject } from '@memoflow/utils/domain';
import { isJsonValue } from '@memoflow/contracts/result';
import type { NotificationActionDTO } from '@memoflow/contracts/notification';

function cloneAction(action: NotificationActionDTO): NotificationActionDTO {
  if (action.kind === 'navigate') {
    return {
      ...action,
      destination: {
        ...action.destination,
        params: action.destination.params ? { ...action.destination.params } : undefined,
      },
    };
  }
  if (action.kind === 'owner-command') {
    return {
      ...action,
      owner: { ...action.owner },
      input: action.input,
    };
  }
  return { ...action };
}

/** Typed action intent owned by the Notification surface (ADR-087). */
export class NotificationAction extends ValueObject<NotificationActionDTO> {
  private constructor(props: NotificationActionDTO) {
    super(cloneAction(props));
  }

  static create(props: NotificationActionDTO): NotificationAction {
    this.validate(props);
    return new NotificationAction(props);
  }

  static fromDTO(dto: NotificationActionDTO): NotificationAction {
    return this.create(dto);
  }

  private static validate(props: NotificationActionDTO): void {
    if (!props.actionKey?.trim()) throw new Error('Action actionKey is required');
    if (!props.labelKey?.trim()) throw new Error('Action labelKey is required');

    switch (props.kind) {
      case 'navigate':
        if (!props.destination.route?.trim()) throw new Error('Navigate destination.route is required');
        return;
      case 'owner-command':
        if (!props.owner.type?.trim() || !props.owner.id?.trim()) {
          throw new Error('Owner command owner reference is required');
        }
        if (!props.commandKey?.trim()) throw new Error('Owner command commandKey is required');
        if (props.input !== undefined && !isJsonValue(props.input)) {
          throw new Error('Owner command input must be a JSON value');
        }
        return;
      case 'archive':
        return;
      default: {
        const exhaustive: never = props;
        throw new Error(`Unsupported notification action: ${String(exhaustive)}`);
      }
    }
  }

  get actionKey(): string { return this.props.actionKey; }
  get labelKey(): string { return this.props.labelKey; }
  get kind(): NotificationActionDTO['kind'] { return this.props.kind; }

  toDTO(): NotificationActionDTO {
    return cloneAction(this.props);
  }
}
