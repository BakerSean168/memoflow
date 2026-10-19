/** Persistent Chromium partition shared by Profile windows and deletion. */
export function getProfilePartition(profileId: string): string {
  return `persist:profile-${profileId}`;
}
