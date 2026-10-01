/**
 * DU-1403 rollout control shared by release tooling and future runtime/feed hosting.
 *
 * electron-updater 6.8.9 persists a device-local UUID in app.userDataPath/.updaterId
 * and derives staged eligibility from the final 32 bits of that UUID. MemoFlow mirrors
 * that calculation for evidence/tests only; it does not create or own another device ID.
 */

export const DESKTOP_UPDATE_ROLLOUT_PERCENTAGES = Object.freeze([10, 30, 50, 100]);

export function normalizeDesktopUpdateRolloutControl(control) {
  if (!control || typeof control !== 'object') {
    throw new Error('invalid Desktop update rollout control');
  }

  if (control.state === 'paused') {
    if (Object.keys(control).some((key) => key !== 'state')) {
      throw new Error('paused Desktop update rollout control must not include extra fields');
    }
    return Object.freeze({
      state: 'paused',
      effectiveStagingPercentage: 0,
      operatorAction: 'pause',
      controlName: 'paused',
    });
  }

  if (
    control.state !== 'active' ||
    !Number.isInteger(control.percentage) ||
    !DESKTOP_UPDATE_ROLLOUT_PERCENTAGES.includes(control.percentage) ||
    Object.keys(control).some((key) => key !== 'state' && key !== 'percentage')
  ) {
    throw new Error('invalid Desktop update rollout control');
  }

  return Object.freeze({
    state: 'active',
    percentage: control.percentage,
    effectiveStagingPercentage: control.percentage,
    operatorAction: 'set-percentage',
    controlName: `p${control.percentage}`,
  });
}

export function describeDesktopUpdateRolloutTransition(previousControl, nextControl) {
  const next = normalizeDesktopUpdateRolloutControl(nextControl);
  if (previousControl == null) {
    return Object.freeze({
      action: next.state === 'paused' ? 'pause' : 'start',
      fromControlName: null,
      toControlName: next.controlName,
    });
  }

  const previous = normalizeDesktopUpdateRolloutControl(previousControl);
  let action;
  if (next.state === 'paused') {
    action = previous.state === 'paused' ? 'hold' : 'pause';
  } else if (previous.state === 'paused') {
    action = 'resume';
  } else if (next.percentage > previous.percentage) {
    action = 'increase';
  } else if (next.percentage < previous.percentage) {
    action = 'decrease';
  } else {
    action = 'hold';
  }

  return Object.freeze({
    action,
    fromControlName: previous.controlName,
    toControlName: next.controlName,
  });
}

export function desktopUpdateRolloutBucket(installationId) {
  if (
    typeof installationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(installationId)
  ) {
    throw new Error('invalid Desktop update rollout installation ID');
  }

  // Mirrors UUID.parse(id).readUInt32BE(12) / 0xffffffff in electron-updater 6.8.9.
  const finalWord = Number.parseInt(installationId.slice(-8), 16);
  return finalWord / 0xffffffff;
}

export function isDesktopUpdateRolloutEligible(installationId, control) {
  const normalized = normalizeDesktopUpdateRolloutControl(control);
  if (normalized.state === 'paused') return false;
  return desktopUpdateRolloutBucket(installationId) < normalized.percentage / 100;
}
