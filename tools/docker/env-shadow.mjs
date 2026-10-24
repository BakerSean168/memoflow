/**
 * Detect host process env keys that shadow docker env-file values.
 * Compose prefers process env over --env-file, which caused local Docker
 * DB_PASSWORD / JWT_SECRET / NODE_ENV drift (PM-journey engineering note).
 */

export const HOST_SHADOW_WARN_KEYS = [
  'DB_PASSWORD',
  'JWT_SECRET',
  'NODE_ENV',
  'REDIS_PASSWORD',
  'DB_USER',
  'DB_NAME',
  'DB_HOST',
];

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} processEnv
 * @param {Map<string, string>} envFileMap
 * @param {string[]} [keys]
 * @returns {string[]}
 */
export function detectHostEnvShadowing(processEnv, envFileMap, keys = HOST_SHADOW_WARN_KEYS) {
  const warnings = [];
  for (const key of keys) {
    if (!envFileMap.has(key)) continue;
    const host = processEnv[key];
    const file = envFileMap.get(key);
    if (host != null && host !== '' && file != null && String(host) !== String(file)) {
      warnings.push(
        `[docker:local] host env ${key} shadows .env.production.local (compose prefers process env). Unset it or align values to avoid drift.`,
      );
    }
  }
  return warnings;
}
