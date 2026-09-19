import { createTimeContext, type UserTimeContextPort } from '@memoflow/time';
import type { UserPreferenceService } from './user-preference-service';

/** Preference-owned implementation of the identity-scoped Product Time seam. */
export class PreferenceUserTimeContextAdapter implements UserTimeContextPort {
  constructor(private readonly preferences: UserPreferenceService) {}

  async getUserTimeContext(identityId: string) {
    const profile = await this.preferences.getPreferenceProfile(identityId);
    return createTimeContext({
      timeZone: profile.regional.timeZone,
      weekStartsOn: profile.regional.weekStartsOn,
    });
  }
}
