/**
 * Launch-scoped memory marker for #926.
 *
 * Signing out ends the active account and returns to the identity gate; the
 * same launch must not then enter the account the user just left. The marker
 * is deliberately main-process memory only — never persisted — so quitting and
 * relaunching restores the preference.
 */
let suppressedForLaunch = false;

export function suppressProfileAutoEnterForLaunch(): void {
  suppressedForLaunch = true;
}

export function isProfileAutoEnterSuppressed(): boolean {
  return suppressedForLaunch;
}
