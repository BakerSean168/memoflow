/** Persistent Chromium partition shared by Profile windows and deletion. */
export function getProfilePartition(profileId: string): string {
  return `persist:profile-${profileId}`;
}

/** On-disk directory name Electron derives from a `persist:` partition. */
export function getProfilePartitionDirectoryName(profileId: string): string {
  return `profile-${profileId}`;
}
