/**
 * @file env.ts
 * @description 环境变量统一加载和验证模块
 *
 * 加载优先级（后面覆盖前面）：
 * 1. .env                    - 共享默认值
 * 2. .env.{NODE_ENV}         - 环境特定配置
 * 3. .env.local              - 本地覆盖（.gitignore）
 * 4. .env.{NODE_ENV}.local   - 环境特定本地覆盖（.gitignore）
 *
 * @date 2025-12-22
 */

import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { envSchema, processEnv, type Env } from './env.schema.js';
import { ZodError } from 'zod';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root (from apps/api/src/shared/infrastructure/config up 6 levels)
const PROJECT_ROOT = resolve(__dirname, '../../../../../../');

/**
 * 加载 .env 文件
 * @param filePath 文件路径
 * @param override 是否覆盖已有环境变量
 *
 * Preserves intentionally empty process.env values (e.g. vi.stubEnv(key, '') for
 * residual 1338 id-without-secret): some dotenv versions still fill empty keys
 * from files even with override:false.
 */
function loadEnvFile(filePath: string, override = true): void {
  if (!existsSync(filePath)) {
    return;
  }

  const lockedEmptyKeys = Object.entries(process.env)
    .filter(([, value]) => value === '')
    .map(([key]) => key);

  expand(config({ path: filePath, override }));

  for (const key of lockedEmptyKeys) {
    process.env[key] = '';
  }
}

/**
 * 按优先级加载所有 .env 文件
 *
 * Highest-priority file first with override:false so:
 * - process.env already set (Docker inject, vi.stubEnv, shell) always wins
 * - among files, the first (highest) value for each key sticks
 * This keeps residual 1338 host-dev "id without secret" tests honest when
 * gitignored .env.*.local would otherwise re-fill an empty stub.
 */
function loadAllEnvFiles(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';

  const envFiles = [
    resolve(PROJECT_ROOT, `.env.${nodeEnv}.local`),
    resolve(PROJECT_ROOT, '.env.local'),
    resolve(PROJECT_ROOT, `.env.${nodeEnv}`),
    resolve(PROJECT_ROOT, '.env'),
  ];

  envFiles.forEach((file) => loadEnvFile(file, false));
}

/**
 * 格式化 Zod 验证错误
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  });

  return `环境变量验证失败:\n${issues.join('\n')}`;
}

/**
 * 验证并返回环境变量
 */
function validateEnv(): Env {
  // 先加载所有 .env 文件
  loadAllEnvFiles();

  try {
    // 使用 Zod Schema 验证
    let env = envSchema.parse(process.env);

    // 后处理：如果未提供 DATABASE_URL，从分解式配置生成
    env = processEnv(env);

    return env;
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('\n' + '='.repeat(60));
      console.error('🚨 环境变量配置错误');
      console.error('='.repeat(60));
      console.error(formatZodError(error));
      console.error('='.repeat(60));
      console.error('\n请检查 .env 文件配置是否正确\n');
      console.error('参考: .env.example 或 .env.development\n');

      // 在非测试环境下退出
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
    throw error;
  }
}

/**
 * 已验证的环境变量单例
 * 应用启动时加载一次，后续直接使用
 */
export const env: Env = validateEnv();

/**
 * 判断是否为开发环境
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * 判断是否为生产环境
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * 判断是否为测试环境
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * 获取 Redis 连接配置
 * 优先使用 REDIS_URL，否则使用分解配置
 */
export function getRedisConfig() {
  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  };
}

/**
 * Residual 1189 keep-boundary: API getCorsOrigins — production env string[] list.
 * Splits env.CORS_ORIGIN into trimmed non-empty origins (no E2E web origin injection).
 * Soft residual 1189: Playwright getCorsOrigins returns joined string with E2E/legacy origins (no force-merge).
 *
 * 获取 CORS 允许的来源列表
 */
export function getCorsOrigins(): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 判断是否允许所有跨域来源
 */
export function isAllCorsOriginsAllowed(): boolean {
  return getCorsOrigins().includes('*');
}

/**
 * 获取 JWT 配置
 */
export function getJwtConfig() {
  return {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    refreshSecret: env.REFRESH_TOKEN_SECRET || env.JWT_SECRET,
  };
}

/**
 * 获取 GitHub OAuth 登录配置（可选）。
 * Returns null when GitHub login is not configured, so the composition root
 * can skip registering the GitHub provider entirely.
 * 未配置时返回 null，组合根据此跳过注册 GitHub 提供者。
 *
 * Residual 1333: Playwright e2e lane uses placeholder `e2e-mock` credentials
 * so it can verify provider URL issuance without secrets or browser consent.
 * Real `GITHUB_OAUTH_*` values may still be present in gitignored
 * `.env.test.local`; they must not displace the placeholder configuration.
 * Knowledge-repo App credentials stay on `getGithubAppConfig()` (separate).
 */
export function getGithubOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
} | null {
  // Prefer live process.env so test stubs (vi.stubEnv) and container inject win
  // over the frozen env singleton when modules are re-imported.
  const runtimeLane = process.env.RUNTIME_LANE ?? env.RUNTIME_LANE;
  const nodeEnv = process.env.NODE_ENV ?? env.NODE_ENV;
  const clientId = (process.env.GITHUB_OAUTH_CLIENT_ID ?? env.GITHUB_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = (
    process.env.GITHUB_OAUTH_CLIENT_SECRET ??
    env.GITHUB_OAUTH_CLIENT_SECRET ??
    ''
  ).trim();
  const redirectURI = (
    process.env.GITHUB_OAUTH_REDIRECT_URI ??
    env.GITHUB_OAUTH_REDIRECT_URI ??
    ''
  ).trim();

  // E2E lane: placeholder credentials for authorize-URL contract tests only.
  if (runtimeLane === 'e2e') {
    return {
      clientId: 'e2e-mock',
      clientSecret: 'e2e-mock-secret',
    };
  }

  // Residual 1338: both id and secret required; id-only must not enable OAuth.
  if (clientId && clientSecret) {
    return {
      clientId,
      clientSecret,
      ...(redirectURI ? { redirectURI } : {}),
    };
  }

  // Unit/integration test without explicit credentials: same mock provider.
  if (nodeEnv === 'test') {
    return {
      clientId: 'e2e-mock',
      clientSecret: 'e2e-mock-secret',
    };
  }

  return null;
}

export interface GithubAppConfig {
  appId: string;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  installationRouting: {
    routeKey: string;
    webOrigin: string;
    routeTargets: Record<string, string>;
  };
}

function parseGithubInstallationRouteTargets(value?: string): Record<string, string> {
  const targets: Record<string, string> = {};
  if (!value?.trim()) return targets;
  for (const rawEntry of value.split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const equalsIndex = entry.indexOf('=');
    if (equalsIndex <= 0 || equalsIndex === entry.length - 1) {
      throw new Error(
        'GITHUB_INSTALLATION_ROUTE_TARGETS entries must use routeKey=https://api-origin',
      );
    }
    const routeKey = entry.slice(0, equalsIndex).trim();
    const rawUrl = entry.slice(equalsIndex + 1).trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(routeKey)) {
      throw new Error(`Invalid GitHub installation route key: ${routeKey}`);
    }
    const url = new URL(rawUrl);
    const loopbackHttp =
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(env.LOCAL_VALIDATION && loopbackHttp)) {
      throw new Error(`GitHub installation route target ${routeKey} must use HTTPS`);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`GitHub installation route target ${routeKey} must be an API origin only`);
    }
    targets[routeKey] = url.origin;
  }
  return targets;
}

/**
 * GitHub App configuration for knowledge repository authorization.
 * A partial configuration is rejected so the runtime cannot expose a flow
 * that later fails at token issuance or webhook verification.
 */
export function getGithubAppConfig(): GithubAppConfig | null {
  const credentialValues = [
    env.GITHUB_APP_ID,
    env.GITHUB_APP_SLUG,
    env.GITHUB_APP_PRIVATE_KEY,
    env.GITHUB_APP_WEBHOOK_SECRET,
  ];
  if (credentialValues.every((value) => value === undefined)) {
    return null;
  }
  if (credentialValues.some((value) => value === undefined)) {
    throw new Error(
      'GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY and GITHUB_APP_WEBHOOK_SECRET must be configured together',
    );
  }
  if (!env.GITHUB_INSTALLATION_ROUTE_KEY || !env.MEMOFLOW_WEB_URL) {
    throw new Error(
      'GITHUB_INSTALLATION_ROUTE_KEY and MEMOFLOW_WEB_URL are required when the GitHub knowledge App is configured',
    );
  }
  return {
    appId: env.GITHUB_APP_ID!,
    appSlug: env.GITHUB_APP_SLUG!,
    privateKey: env.GITHUB_APP_PRIVATE_KEY!,
    webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET!,
    installationRouting: {
      routeKey: env.GITHUB_INSTALLATION_ROUTE_KEY,
      webOrigin: new URL(env.MEMOFLOW_WEB_URL).origin,
      routeTargets: parseGithubInstallationRouteTargets(env.GITHUB_INSTALLATION_ROUTE_TARGETS),
    },
  };
}

/**
 * 获取 PowerSync 配置
 */
export function getPowerSyncConfig() {
  return {
    url: env.POWERSYNC_URL,
    privateKey: env.POWERSYNC_PRIVATE_KEY
      ? Buffer.from(env.POWERSYNC_PRIVATE_KEY, 'base64').toString('utf-8')
      : undefined,
    publicKeyN: env.POWERSYNC_PUBLIC_KEY_N,
    publicKeyE: env.POWERSYNC_PUBLIC_KEY_E,
    keyId: env.POWERSYNC_KEY_ID,
    snapshotDir: env.POWERSYNC_SNAPSHOT_DIR,
  };
}

// 导出 schema 供测试使用
export { envSchema } from './env.schema.js';
export type { Env, PartialEnv } from './env.schema.js';
