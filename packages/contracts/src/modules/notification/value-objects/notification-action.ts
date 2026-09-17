import type { JsonValue } from '../../../result';

export interface NotificationEntityRef {
  type: string;
  id: string;
}

export interface NotificationNavigationIntent {
  route: string;
  params?: Record<string, string>;
}

export type NotificationActionIntent =
  | {
      kind: 'navigate';
      actionKey: string;
      labelKey: string;
      destination: NotificationNavigationIntent;
    }
  | {
      kind: 'owner-command';
      actionKey: string;
      labelKey: string;
      owner: NotificationEntityRef;
      commandKey: string;
      input?: JsonValue;
    }
  | {
      kind: 'archive';
      actionKey: string;
      labelKey: string;
    };

/** Canonical typed notification action contract (ADR-087). */
export type NotificationAction = NotificationActionIntent;
export type NotificationActionDTO = NotificationActionIntent;
