import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';

export type DesktopUpdateShellIndicatorKind = 'ready' | 'attention';

export interface DesktopUpdateShellIndicatorPresentation {
  readonly kind: DesktopUpdateShellIndicatorKind;
  readonly labelKey: string;
  readonly version: string | null;
}

/**
 * Project canonical updater state into the tiny set of shell-worthy signals.
 *
 * Background checking/downloading remains silent. The shell only asks for
 * attention when the user can meaningfully act: a verified update is Ready, or
 * an install failure can recover back to Ready.
 */
export function presentDesktopUpdateShellIndicator(
  snapshot: DesktopUpdateSnapshotDTO | null,
): DesktopUpdateShellIndicatorPresentation | null {
  if (!snapshot) return null;

  const state = snapshot.state;
  if (state.type === 'ready') {
    return {
      kind: 'ready',
      labelKey: 'shell.update.ready',
      version: state.release.version,
    };
  }

  if (
    state.type === 'failed' &&
    state.operation === 'install' &&
    state.recoverableTo === 'ready' &&
    state.failure.retryable
  ) {
    return {
      kind: 'attention',
      labelKey: 'shell.update.attention',
      version: state.release?.version ?? null,
    };
  }

  return null;
}
