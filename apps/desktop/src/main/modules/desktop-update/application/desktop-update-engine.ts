import type {
  DesktopUpdateChannelDTO,
  DesktopUpdateFailureDTO,
  DesktopUpdateProgressDTO,
  DesktopUpdateReleaseDTO,
} from '@memoflow/contracts/electron';

export type DesktopUpdateEngineCheckResult =
  | { readonly kind: 'available'; readonly release: DesktopUpdateReleaseDTO }
  | { readonly kind: 'up-to-date' };

export type DesktopUpdateEngineEvent =
  | { readonly type: 'download-progress'; readonly progress: DesktopUpdateProgressDTO }
  | { readonly type: 'downloaded'; readonly release: DesktopUpdateReleaseDTO }
  | { readonly type: 'engine-error'; readonly failure: DesktopUpdateFailureDTO };

export type DesktopUpdateFeed =
  | {
      readonly provider: 'github';
      readonly owner: string;
      readonly repo: string;
      readonly channel: string;
      readonly tagNamePrefix?: string;
    }
  | {
      readonly provider: 'generic';
      readonly url: string;
      readonly channel: string;
    };

export interface DesktopUpdateEngineInitOptions {
  readonly channel: DesktopUpdateChannelDTO;
  readonly feed?: DesktopUpdateFeed;
}

/**
 * MemoFlow-owned application port for a platform update engine.
 *
 * Third-party updater types stop at the infrastructure adapter boundary.
 */
export interface DesktopUpdateEngine {
  initialize(options: DesktopUpdateEngineInitOptions): Promise<void>;
  check(): Promise<DesktopUpdateEngineCheckResult>;
  download(): Promise<void>;
  prepare(): Promise<void>;
  quitAndInstall(): void;
  subscribe(listener: (event: DesktopUpdateEngineEvent) => void): () => void;
  destroy(): void;
}

export class DesktopUpdateEngineError extends Error {
  constructor(readonly failure: DesktopUpdateFailureDTO) {
    super(failure.message);
    this.name = 'DesktopUpdateEngineError';
  }
}
