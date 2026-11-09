/**
 * Shell deep-link paths for Settings / Account (Phase 0 / 诊断 UI-007)
 *
 * Settings is a shell dialog, not a page: these paths identify the deep links
 * the AppShell must convert into that dialog. They must never create a
 * BusinessTab or a second workspace scene; the workspace stays mounted.
 *
 * The predicate is shared by useShellRouterSync (route sync), AppShell (dialog
 * entry) and the settings-scene guard (unified leave protocol), so it lives in
 * its own module to avoid a circular dependency.
 */
export function isStandaloneSettingsPath(path: string): boolean {
  const bare = path.split('?')[0] ?? path;
  return (
    bare === '/settings' ||
    bare.startsWith('/settings/') ||
    bare === '/account' ||
    bare.startsWith('/account/')
  );
}
