/**
 * OpenAPI Document Generator
 *
 * Generates OpenAPI 3.0 document from the registry using @asteasolutions/zod-to-openapi.
 *
 * @module openapi/generator
 */

import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';
import { env } from '../config/env';

/**
 * OpenAPI 3.0 文档结构（简化类型，避免 TS2742 因 openapi3-ts 为 transitive dep 无法解析）
 */
export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string; [k: string]: unknown };
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  security?: Array<Record<string, string[]>>;
  [k: string]: unknown;
}

/**
 * Generate the complete OpenAPI 3.0 document
 */
export function generateOpenApiDocument(): OpenApiDocument {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'MemoFlow API',
      description:
        'MemoFlow 个人生产力管理平台 REST API 文档。\n\n' +
        '## 认证\n' +
        '云端认证由 Better Auth 的 `/api/auth/*` 端点提供。Web 使用 HttpOnly cookie session；Desktop 使用 Better Auth bearer session token。Desktop 的本地账户解锁不是 API 认证，也不会签发云端 token。\n\n' +
        '## 响应格式\n' +
        '所有响应遵循统一的 HttpResponse 格式：\n' +
        '- `ok: true` 表示成功，数据在 `data` 字段\n' +
        '- `ok: false` 表示失败，错误信息在 `error` 字段\n',
      contact: {
        name: 'MemoFlow Team',
        email: 'support@memoflow.app',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.API_PORT}`,
        description: '开发环境',
      },
    ],
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  }) as OpenApiDocument;
}
