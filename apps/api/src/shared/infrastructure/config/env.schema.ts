/**
 * @file env.schema.ts
 * @description 环境变量 Zod Schema 定义
 * 统一所有环境变量的类型验证和默认值
 * @date 2025-12-22
 */

import { z } from 'zod';

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

/**
 * 环境变量 Schema
 *
 * 分类:
 * 1. 应用基础配置 - NODE_ENV, API_PORT, API_HOST, LOG_LEVEL
 * 2. 数据库配置 - DATABASE_URL, DB_*
 * 3. Redis 缓存 - REDIS_URL, REDIS_*
 * 4. 认证配置 - JWT_*
 * 5. CORS 配置 - CORS_ORIGIN
 * 6. AI 服务 - OPENAI_*, QI_NIU_YUN_*
 * 7. 可选服务 - SMTP_*, SENTRY_DSN
 * 8. 功能开关 - ENABLE_*, USE_*
 */
export const envSchema = z
  .object({
    // ========== 应用基础配置 ==========
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    RUNTIME_LANE: z
      .preprocess(emptyStringToUndefined, z.string().trim().min(1).optional())
      .describe('Named runtime lane used to identify managed local processes (for example e2e)'),

    LOCAL_VALIDATION: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1')
      .describe('Expose local-only validation controls such as captured email links'),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    API_HOST: z.string().default('localhost'),

    AUTH_BASE_URL: z
      .preprocess(emptyStringToUndefined, z.string().url().optional())
      .describe('Canonical public Better Auth endpoint, including /api/auth'),

    MEMOFLOW_WEB_URL: z
      .preprocess(emptyStringToUndefined, z.string().url().optional())
      .describe('Canonical public MemoFlow Web URL used by browser authentication flows'),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    TZ: z.string().default('Asia/Shanghai'),

    // ========== 数据库配置 ==========
    // 完整连接字符串（可选，如果提供则优先使用）
    // 否则应用会从分解式配置自动生成
    DATABASE_URL: z
      .preprocess(emptyStringToUndefined, z.string().url().optional())
      .describe('PostgreSQL 连接字符串（可选，优先使用）'),

    // 分解式配置（用于 docker-compose 等场景）
    // Docker 最佳实践：使用分解配置而非完整 URL
    // 当 DATABASE_URL 未提供时，应用会从这些值自动生成
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().default(5432),
    DB_NAME: z.string().default('memoflow'),
    DB_USER: z.string().default('memoflow'),
    DB_PASSWORD: z.string().default(''),

    // ========== Redis 缓存配置 ==========
    REDIS_URL: z
      .preprocess(emptyStringToUndefined, z.string().url().optional())
      .describe('Redis 连接字符串 (优先使用)'),

    REDIS_HOST: z.string().default('localhost'),

    REDIS_PORT: z.coerce.number().int().default(6379),

    REDIS_PASSWORD: z.string().optional(),

    REDIS_DB: z.coerce.number().int().default(0),

    // ========== JWT 认证配置 ==========
    JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少需要 32 个字符').describe('JWT 签名密钥'),

    JWT_EXPIRES_IN: z.string().default('7d').describe('JWT Token 有效期'),

    JWT_REFRESH_EXPIRES_IN: z.string().default('30d').describe('JWT 刷新 Token 有效期'),

    REFRESH_TOKEN_SECRET: z
      .preprocess(emptyStringToUndefined, z.string().min(32).optional())
      .describe('刷新 Token 签名密钥 (默认使用 JWT_SECRET)'),

    // ========== GitHub 登录配置（可选，可插拔登录方式）==========
    // GitHub login is identity-only per ADR-034; repository authorization is
    // a separate GitHub App installation flow, not configured here.
    // ADR-034：GitHub 登录仅做身份认证；仓库授权是独立的 GitHub App 安装流程。
    GITHUB_OAUTH_CLIENT_ID: z
      .preprocess(emptyStringToUndefined, z.string().optional())
      .describe('GitHub 登录 Client ID（未设置时禁用 GitHub 登录）'),

    GITHUB_OAUTH_CLIENT_SECRET: z
      .preprocess(emptyStringToUndefined, z.string().optional())
      .describe('GitHub 登录 Client Secret（服务端保管，未设置时禁用 GitHub 登录）'),

    GITHUB_OAUTH_REDIRECT_URI: z
      .preprocess(emptyStringToUndefined, z.string().url().optional())
      .describe('GitHub 登录 provider callback override（用于受控的 remote-dev callback ingress）'),

    // ========== GitHub 知识仓库配置（GitHub App，与登录 OAuth 分离）==========
    GITHUB_APP_ID: z
      .preprocess(emptyStringToUndefined, z.string().trim().min(1).optional())
      .describe('GitHub App ID（知识仓库授权）'),

    GITHUB_APP_SLUG: z
      .preprocess(emptyStringToUndefined, z.string().trim().min(1).optional())
      .describe('GitHub App slug（用于安装链接）'),

    GITHUB_APP_PRIVATE_KEY: z
      .preprocess(emptyStringToUndefined, z.string().min(1).optional())
      .describe('GitHub App RSA private key（支持转义换行）'),

    GITHUB_APP_WEBHOOK_SECRET: z
      .preprocess(emptyStringToUndefined, z.string().min(32).optional())
      .describe('GitHub App webhook HMAC secret（至少 32 字符）'),

    GITHUB_INSTALLATION_ROUTE_KEY: z
      .preprocess(
        emptyStringToUndefined,
        z
          .string()
          .regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/)
          .optional(),
      )
      .describe(
        'GitHub App installation intent environment route key (for example dev/staging/prod)',
      ),

    GITHUB_INSTALLATION_ROUTE_TARGETS: z
      .preprocess(emptyStringToUndefined, z.string().optional())
      .describe(
        'Comma-separated allowlisted installation route targets: routeKey=https://api-origin',
      ),

    // ========== CORS 配置 ==========
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .describe('允许的跨域来源，多个用逗号分隔，* 表示全部'),

    // ========== AI 服务配置 ==========
    // OpenAI
    OPENAI_API_KEY: z.string().optional().describe('OpenAI API 密钥'),

    OPENAI_MODEL: z.string().default('gpt-4-turbo-preview'),

    OPENAI_BASE_URL: z.preprocess(
      emptyStringToUndefined,
      z.string().url().default('https://api.openai.com/v1'),
    ),

    // 七牛云 AI
    QI_NIU_YUN_API_KEY: z.string().optional(),
    QI_NIU_YUN_BASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
    QI_NIU_YUN_MODEL_ID: z.string().optional(),

    // AI Provider 加密密钥
    // 字段本身保持 optional 以允许 development/test 导入 env；production 则在
    // superRefine 中 fail-fast 必填。这样部署错误在 API preflight 暴露，而不是
    // 等用户第一次保存 Provider 才以 500 暴露。
    // 密钥经 SHA-256 派生为 32 字节；配置层仍要求至少 32 字符，
    // 推荐使用 `openssl rand -hex 32`（64 字符）生成高熵 secret。
    AI_PROVIDER_ENCRYPTION_KEY: z
      .preprocess(emptyStringToUndefined, z.string().min(32).optional())
      .describe('AI Provider 配置加密密钥（至少 32 字符；启用 AI 模块时必填）'),
    AI_PROVIDER_ENCRYPTION_KEY_ID: z
      .preprocess(
        emptyStringToUndefined,
        z
          .string()
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u)
          .optional(),
      )
      .describe('AI Provider active encryption key id（轮换标识；默认 primary）'),
    AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS: z
      .preprocess(emptyStringToUndefined, z.string().optional())
      .describe('AI Provider previous decrypt-only keys，格式 kid=secret,kid=secret'),
    AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST: z
      .preprocess(
        emptyStringToUndefined,
        z.string().superRefine((value, context) => {
          for (const raw of value.split(',')) {
            const candidate = raw.trim();
            if (!candidate) continue;
            try {
              const parsed = new URL(`https://${candidate}`);
              if (
                parsed.username ||
                parsed.password ||
                parsed.pathname !== '/' ||
                parsed.search ||
                parsed.hash ||
                !parsed.port
              ) {
                throw new Error('not exact host:port');
              }
            } catch {
              context.addIssue({
                code: 'custom',
                message:
                  'AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST must contain comma-separated exact host:port values',
              });
              return;
            }
          }
        }).optional(),
      )
      .describe(
        'Deployment-approved private OpenAI-compatible endpoints, comma-separated exact host:port values',
      ),

    // ========== 邮件服务配置 ==========
    // EMAIL_PROVIDER: console (default) | smtp | resend. Never infer from NODE_ENV alone
    // (local-docker uses NODE_ENV=production with console capture).
    EMAIL_PROVIDER: z
      .preprocess(emptyStringToUndefined, z.enum(['console', 'smtp', 'resend']).optional())
      .describe('Transactional email delivery: console (default), smtp, or resend'),
    SMTP_HOST: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.preprocess(
      emptyStringToUndefined,
      z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === 'true')),
    ),
    SMTP_USER: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SMTP_PASS: z.preprocess(emptyStringToUndefined, z.string().optional()),
    // Accept bare email or "Display Name <email@domain>" (Brevo-style From).
    SMTP_FROM: z.preprocess(emptyStringToUndefined, z.string().min(3).optional()),
    SMTP_REPLY_TO: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SMTP_LOCALE: z.preprocess(emptyStringToUndefined, z.enum(['zh', 'en']).optional()),
    EMAIL_LOCALE: z.preprocess(emptyStringToUndefined, z.enum(['zh', 'en']).optional()),
    RESEND_API_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
    RESEND_FROM: z.preprocess(emptyStringToUndefined, z.string().min(3).optional()),
    // Optional secondary SMTP (failover after primary smtp/resend failure).
    SMTP_SECONDARY_HOST: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SMTP_SECONDARY_PORT: z.coerce.number().optional(),
    SMTP_SECONDARY_SECURE: z.preprocess(
      emptyStringToUndefined,
      z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === 'true')),
    ),
    SMTP_SECONDARY_USER: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SMTP_SECONDARY_PASS: z.preprocess(emptyStringToUndefined, z.string().optional()),
    SMTP_SECONDARY_FROM: z.preprocess(emptyStringToUndefined, z.string().min(3).optional()),
    // memory (default) | redis — multi-instance verification challenges.
    AUTH_CHALLENGE_STORE: z
      .preprocess(emptyStringToUndefined, z.enum(['memory', 'redis']).optional())
      .describe('Verification challenge backend: memory (default) or redis'),

    // ========== 文件上传配置 ==========
    UPLOAD_MAX_SIZE: z.coerce
      .number()
      .default(10485760) // 10MB
      .describe('最大上传文件大小 (字节)'),

    REPOSITORY_STORAGE_PATH: z
      .preprocess(emptyStringToUndefined, z.string().optional())
      .describe('Repository/editor/AI knowledge file storage root directory'),

    // ========== 监控配置 ==========
    SENTRY_DSN: z.preprocess(emptyStringToUndefined, z.string().url().optional()),

    // ========== 功能开关 ==========
    ENABLE_DAILY_ANALYSIS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    USE_PRIORITY_QUEUE_SCHEDULER: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // ========== PowerSync 同步配置 ==========
    POWERSYNC_URL: z
      .string()
      .optional()
      .describe('PowerSync Service URL (e.g. http://localhost:8080)'),

    POWERSYNC_PRIVATE_KEY: z
      .string()
      .optional()
      .describe('PowerSync RSA private key (PEM, base64 encoded) for signing sync JWTs'),

    POWERSYNC_PUBLIC_KEY_N: z
      .string()
      .optional()
      .describe('PowerSync RSA public key JWK "n" parameter'),

    POWERSYNC_PUBLIC_KEY_E: z
      .string()
      .default('AQAB')
      .describe('PowerSync RSA public key JWK "e" parameter'),

    POWERSYNC_KEY_ID: z.string().default('powersync-key').describe('PowerSync JWKS key ID (kid)'),

    POWERSYNC_SNAPSHOT_DIR: z
      .preprocess(emptyStringToUndefined, z.string().optional())
      .describe('Per-user PowerSync SQLite snapshot root directory'),

    SNAPSHOT_REBUILD_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true')
      .describe('Enable automated snapshot rebuild cron job'),

    SNAPSHOT_REBUILD_SCHEDULE: z
      .string()
      .default('0 */4 * * *')
      .describe('Cron schedule for automated snapshot rebuild'),

    // ========== 构建信息（CI 注入）==========
    BUILD_TIMESTAMP: z.string().optional(),
    GIT_COMMIT: z.string().optional(),

    // ========== OpenTelemetry（默认关闭，显式 opt-in）==========
    // RefArch Phase 6: tracing is disabled by default (`0`) and never requires a
    // collector. When enabled, the OTLP endpoint and service name MUST both be
    // configured or startup fails fast (no "enabled but silently unexported").
    OTEL_TRACING_ENABLED: z
      .enum(['0', '1'])
      .default('0')
      .describe('Enable OpenTelemetry tracing (0=off default, 1=on)'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z
      .preprocess(emptyStringToUndefined, z.string().url().optional())
      .describe('OTLP HTTP trace exporter endpoint (required when tracing is enabled)'),
    OTEL_SERVICE_NAME: z
      .preprocess(emptyStringToUndefined, z.string().trim().min(1).optional())
      .describe('OTel service name for the API process (required when tracing is enabled)'),
  })
  .superRefine((env, context) => {
    // Combinational guard: tracing enabled without an exporter/service is a
    // startup misconfiguration, not a runtime silent failure.
    if (env.OTEL_TRACING_ENABLED === '1') {
      for (const key of ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_SERVICE_NAME'] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when OTEL_TRACING_ENABLED=1`,
          });
        }
      }
    }

    if (env.NODE_ENV !== 'production') return;

    if (!env.AI_PROVIDER_ENCRYPTION_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER_ENCRYPTION_KEY'],
        message: 'AI_PROVIDER_ENCRYPTION_KEY is required in production',
      });
    }

    for (const key of ['AUTH_BASE_URL', 'MEMOFLOW_WEB_URL'] as const) {
      const value = env[key];
      if (!value) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
        continue;
      }

      const url = new URL(value);
      const loopbackHttp =
        url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const trustedHttp = env.LOCAL_VALIDATION && loopbackHttp;
      if (url.protocol !== 'https:' && !trustedHttp) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must use HTTPS in production`,
        });
      }
    }
  });

/**
 * 环境变量类型
 */
export type Env = z.infer<typeof envSchema>;

/**
 * 处理环境变量的后处理
 * 如果未提供 DATABASE_URL，则从分解式配置自动生成
 *
 * ⚠️ 重要：必须同步设置回 process.env，因为 Prisma 直接读取 process.env.DATABASE_URL
 * ⚠️ 重要：密码中的特殊字符必须 URL 编码
 *
 * @param env 验证后的环境变量对象
 * @returns 处理后的环境变量对象
 */
export function processEnv(env: Env): Env {
  // 如果没有 DATABASE_URL，从分解式配置生成
  if (!env.DATABASE_URL && env.DB_HOST) {
    const username = encodeURIComponent(env.DB_USER || 'memoflow');
    // ⚠️ 密码必须 URL 编码，否则特殊字符（如 / = @ 等）会破坏 URL 解析
    const password = env.DB_PASSWORD ? `:${encodeURIComponent(env.DB_PASSWORD)}` : '';
    const host = env.DB_HOST;
    const port = env.DB_PORT || 5432;
    const database = encodeURIComponent(env.DB_NAME || 'memoflow');

    const databaseUrl = `postgresql://${username}${password}@${host}:${port}/${database}?schema=public`;
    env.DATABASE_URL = databaseUrl;

    // ⚠️ 关键：同步设置回 process.env，Prisma 直接读取 process.env.DATABASE_URL
    process.env.DATABASE_URL = databaseUrl;
  }

  // 如果没有 REDIS_URL，从分解式配置生成
  if (!env.REDIS_URL && env.REDIS_HOST) {
    // ⚠️ 密码必须 URL 编码
    const password = env.REDIS_PASSWORD ? `:${encodeURIComponent(env.REDIS_PASSWORD)}` : '';
    const host = env.REDIS_HOST;
    const port = env.REDIS_PORT || 6379;
    const db = env.REDIS_DB || 0;

    const redisUrl = `redis://${password}@${host}:${port}/${db}`;
    env.REDIS_URL = redisUrl;

    // 同步设置回 process.env（如果其他库需要）
    process.env.REDIS_URL = redisUrl;
  }

  return env;
}

/**
 * 部分环境变量类型（用于测试等场景）
 */
export type PartialEnv = Partial<Env>;
