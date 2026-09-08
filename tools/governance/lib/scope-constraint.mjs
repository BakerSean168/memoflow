/**
 * Scope constraint completeness helpers (ADR-033 / M3).
 *
 * Pure functions so governance audits can unit-test fixtures without
 * reading the live monorepo.
 */

/**
 * Extract `scope:*` tags from project.json tag arrays.
 * @param {Array<{ name: string, tags?: string[] }>} projects
 * @returns {string[]} sorted unique feature-ish scopes that need depConstraints
 */
export function collectScopedProjects(projects) {
  const scopes = new Set();
  for (const project of projects) {
    for (const tag of project.tags ?? []) {
      if (typeof tag === 'string' && tag.startsWith('scope:')) {
        scopes.add(tag);
      }
    }
  }
  return [...scopes].sort();
}

/**
 * Feature / composition scopes that must have an explicit depConstraint entry.
 * Shared/infra/meta scopes are intentionally excluded — they are allowlisted
 * as dependency targets, not isolation sources.
 */
const REQUIRED_SCOPE_PREFIXES = [
  'scope:account',
  'scope:ai',
  'scope:authentication',
  'scope:goal',
  'scope:governance',
  'scope:notification',
  'scope:reminder',
  'scope:repository',
  'scope:schedule',
  'scope:scheduler',
  'scope:setting',
  'scope:task',
  'scope:data-portability',
  'scope:app-vue',
  'scope:app-react',
  'scope:web',
  'scope:desktop',
  'scope:mobile',
  'scope:api',
];

/**
 * @param {string[]} scopes
 * @returns {string[]}
 */
export function filterRequiredFeatureScopes(scopes) {
  return scopes.filter((scope) => REQUIRED_SCOPE_PREFIXES.includes(scope));
}

/**
 * Parse sourceTag entries from an eslint module-boundary config source text.
 * @param {string} eslintSource
 * @returns {string[]}
 */
export function extractSourceTagsFromEslint(eslintSource) {
  const tags = new Set();
  const re = /sourceTag\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(eslintSource)) !== null) {
    tags.add(match[1]);
  }
  return [...tags].sort();
}

/**
 * @param {{ requiredScopes: string[], configuredSourceTags: string[] }} input
 * @returns {{ missing: string[], extraFeatureTags: string[] }}
 */
export function findMissingScopeConstraints({ requiredScopes, configuredSourceTags }) {
  const configured = new Set(configuredSourceTags);
  const missing = requiredScopes.filter((scope) => !configured.has(scope));
  // Extra tags are informational only; we do not fail on them.
  const required = new Set(requiredScopes);
  const extraFeatureTags = configuredSourceTags.filter(
    (tag) => tag.startsWith('scope:') && !required.has(tag) && !tag.startsWith('scope:shared'),
  );
  return { missing, extraFeatureTags };
}
