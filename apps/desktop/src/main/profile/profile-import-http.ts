import { z } from 'zod';
import { ResultErrorException } from '@memoflow/contracts/result';
import { getApiBaseUrl } from '../utils/api-config';

export async function profileImportHttp<T>(
  token: string,
  endpoint: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25_000),
  });
  const raw: unknown = await response.json();
  const envelope = z
    .object({
      ok: z.boolean(),
      data: z.unknown().optional(),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    })
    .parse(raw);
  if (!response.ok || !envelope.ok)
    throw new ResultErrorException(
      envelope.error?.message ?? '导入请求失败',
      envelope.error?.code ?? 'IMPORT_HTTP_ERROR',
    );
  return schema.parse(envelope.data);
}
