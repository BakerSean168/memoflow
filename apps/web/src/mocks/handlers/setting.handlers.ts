/** MSW handlers for the canonical Setting API. */
import { http, HttpResponse } from 'msw';
import {
  PreferencePortableDocumentV3Schema,
  createDefaultUserPreferenceProfile,
  parsePreferenceNamespacePatch,
  parsePreferenceNamespacePayload,
  type PreferenceNamespace,
  type UserPreferenceProfile,
} from '@memoflow/contracts/setting';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const BASE = `${API_BASE}/settings`;

let preferences: UserPreferenceProfile = createDefaultUserPreferenceProfile();
let revisions: Record<PreferenceNamespace, number> = { presentation: 1, regional: 1 };

function envelope(data: unknown, message = 'Success') {
  return HttpResponse.json({ ok: true, code: 200, message, data, timestamp: Date.now() });
}

function namespaceResponse(namespace: PreferenceNamespace) {
  return { namespace, preferences: preferences[namespace], revision: revisions[namespace] };
}

export const settingHandlers = [
  http.get(`${BASE}/preferences`, () => envelope(preferences)),

  http.get(`${BASE}/preferences/:namespace`, ({ params }) => {
    const namespace = params.namespace as PreferenceNamespace;
    if (namespace !== 'presentation' && namespace !== 'regional') {
      return HttpResponse.json({ ok: false, code: 400, message: 'Invalid preference namespace' }, { status: 400 });
    }
    return envelope(namespaceResponse(namespace));
  }),

  http.patch(`${BASE}/preferences/:namespace`, async ({ params, request }) => {
    const namespace = params.namespace as PreferenceNamespace;
    if (namespace !== 'presentation' && namespace !== 'regional') {
      return HttpResponse.json({ ok: false, code: 400, message: 'Invalid preference namespace' }, { status: 400 });
    }
    const body = (await request.json()) as { patch?: unknown; expectedRevision?: number };
    if (body.expectedRevision !== undefined && body.expectedRevision !== revisions[namespace]) {
      return HttpResponse.json({ ok: false, code: 409, message: 'Preference revision conflict' }, { status: 409 });
    }
    const patch = parsePreferenceNamespacePatch(namespace, body.patch ?? {});
    preferences = {
      ...preferences,
      [namespace]: parsePreferenceNamespacePayload(namespace, {
        ...preferences[namespace],
        ...patch,
      }),
    } as UserPreferenceProfile;
    revisions[namespace] += 1;
    return envelope({ namespace, revision: revisions[namespace], changedKeys: Object.keys(patch) }, 'Updated');
  }),

  http.post(`${BASE}/preferences/:namespace/reset`, ({ params }) => {
    const namespace = params.namespace as PreferenceNamespace;
    if (namespace !== 'presentation' && namespace !== 'regional') {
      return HttpResponse.json({ ok: false, code: 400, message: 'Invalid preference namespace' }, { status: 400 });
    }
    preferences = { ...preferences, [namespace]: createDefaultUserPreferenceProfile()[namespace] } as UserPreferenceProfile;
    revisions[namespace] += 1;
    return envelope({ namespace, revision: revisions[namespace], changedKeys: [] }, 'Reset');
  }),

  http.post(`${BASE}/preferences/reset-all`, () => {
    preferences = createDefaultUserPreferenceProfile();
    revisions = { presentation: revisions.presentation + 1, regional: revisions.regional + 1 };
    return envelope({
      presentation: { namespace: 'presentation', revision: revisions.presentation, changedKeys: [] },
      regional: { namespace: 'regional', revision: revisions.regional, changedKeys: [] },
    }, 'Reset');
  }),

  http.post(`${BASE}/export`, () => {
    const exportedAt = new Date().toISOString();
    const document = PreferencePortableDocumentV3Schema.parse({ schemaVersion: 3, exportedAt, preferences });
    return envelope({
      data: JSON.stringify(document, null, 2),
      fileName: `memoflow-settings-${exportedAt.replace(/[:.]/g, '-')}.json`,
    });
  }),

  http.post(`${BASE}/import`, async ({ request }) => {
    const body = (await request.json()) as { data?: string };
    const document = PreferencePortableDocumentV3Schema.parse(JSON.parse(body.data ?? 'null'));
    preferences = document.preferences;
    revisions = { presentation: revisions.presentation + 1, regional: revisions.regional + 1 };
    return HttpResponse.json({
      ok: true,
      code: 201,
      message: 'Imported',
      data: { schemaVersion: 3, imported: 2, skipped: 0, warnings: [] },
      timestamp: Date.now(),
    }, { status: 201 });
  }),
];
