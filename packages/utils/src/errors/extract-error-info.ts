/**
 * 从未知错误中提取错误信息
 */
import { extractStructuredResultError } from '@memoflow/transport-contracts/result';

export function extractErrorInfo(error: unknown): {
  code: string;
  message: string;
  httpStatus: number;
  context?: Record<string, unknown>;
} {
  const structured = extractStructuredResultError(error);
  if (structured) {
    return {
      code: structured.code,
      message: structured.message,
      httpStatus: structured.statusCode ?? 400,
      context: structured.context,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      httpStatus: 500,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    httpStatus: 500,
  };
}
