/** Temporary V2 envelope projection backed exclusively by canonical User Preferences. */

import {
  UserPreferenceProfileSchema,
  createDefaultUserPreferenceProfile,
  parsePreferenceNamespacePayload,
  type UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import type { PortableSettings } from '@memoflow/contracts/data-portability';
import type { UserPreferenceDocumentPort } from '../../data-portability.dependencies';

export function projectSettings(
  documents: readonly UserPreferenceDocumentPort[],
): PortableSettings {
  const preferences: UserPreferenceProfile = createDefaultUserPreferenceProfile();

  for (const document of documents) {
    if (document.namespace === 'presentation') {
      preferences.presentation = parsePreferenceNamespacePayload(
        'presentation',
        document.payload,
      );
    } else if (document.namespace === 'regional') {
      preferences.regional = parsePreferenceNamespacePayload('regional', document.payload);
    }
  }

  return { preferences: UserPreferenceProfileSchema.parse(preferences) };
}
